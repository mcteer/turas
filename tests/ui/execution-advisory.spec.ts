import { test, expect as baseExpect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { query } from "../../lib/server/db/client";
import { signIn } from "../fixtures/ui";
import { requireOwnedExecutionClone } from "../../scripts/execution-eval-environment";
import { timeFixture } from "../fixtures/execution/time";
import { reviewRegister } from "../fixtures/execution/registers";
import { readExecutionRecords } from "../../lib/server/execution/service";
import { settleDueExecutionAdvisories } from "../../lib/server/execution/maintenance";
const expect=baseExpect.configure({timeout:30000});
test.beforeEach(()=>{requireOwnedExecutionClone();if(process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY!=="1")throw new Error("Owned native UI fixture required");});
async function open(page:Page,scenario:"normal"|"barrier",lost=false){
  const f=await timeFixture();let prepared:{attemptId:string;conversationId:string;nativeRequestId:string}|null=null;
  let lose=lost;
  await page.route(/\/api\/execution\/engagements\/[^/]+\/advice$/,async route=>{
    const response=await route.fetch(),body=await response.json();
    if(response.ok()){
      prepared=body.data;
      await query("INSERT INTO execution_native_fixture_barriers(advice_attempt_id,scenario) VALUES($1,$2) ON CONFLICT DO NOTHING",[prepared!.attemptId,scenario]);
      if(lose){lose=false;await route.abort("failed");return;}
    }
    await route.fulfill({response});
  });
  const url=`/customers/${f.customerId}/engagements/${f.engagementId}/execution`;
  await signIn(page,"panel");await page.goto(url);await page.getByRole("tab",{name:"Turi",exact:true}).click();
  await page.getByLabel("Period start",{exact:true}).fill(f.date);await page.getByLabel("Period end",{exact:true}).fill(f.date);
  const calls=async()=>Number((await query("SELECT count(*)::int AS n FROM execution_native_fixture_calls")).rows[0].n);
  return {f,url,calls,prepared:()=>{if(!prepared)throw new Error("Preparation missing");return prepared;}};
}
async function audit(page:Page){
  expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>["serious","critical"].includes(v.impact??""))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
test("explains reviewed execution, resumes without sending again, and withholds withdrawn evidence",async({page},testInfo)=>{
  test.setTimeout(180000);const f=await open(page,"normal");
  await page.getByRole("button",{name:"Ask Turi to explain",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("heading",{name:"Explanation Complete",exact:true})).toBeVisible();
  await expect(page.getByText(/Synthetic reviewed execution explanation\./)).toBeVisible();expect(await f.calls()).toBe(2);
  await audit(page);await page.screenshot({path:testInfo.outputPath("execution-explanation.png"),fullPage:true});
  await page.reload();await page.getByRole("tab",{name:"Turi",exact:true}).click();
  await expect(page.getByText(/Synthetic reviewed execution explanation\./)).toBeVisible();expect(await f.calls()).toBe(2);
  const row=(await readExecutionRecords(f.f.reviewer,f.f.engagementId,{recordId:f.f.activity.id})).records[0];await reviewRegister(f.f,row,"record.retract");
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Synthetic reviewed execution explanation\./)).toHaveCount(0);
  await expect(page.getByText("Current evidence or access has changed. Output is withheld.",{exact:true})).toBeVisible();
  expect((await page.request.get(`/api/conversations/${f.prepared().conversationId}`)).status()).toBe(409);expect(await f.calls()).toBe(2);
  await page.screenshot({path:testInfo.outputPath("execution-withheld.png"),fullPage:true});await audit(page);
});
test("stops a pending explanation and retains the stop on reload without redispatch",async({page},testInfo)=>{
  test.setTimeout(180000);const f=await open(page,"barrier");await page.getByRole("button",{name:"Ask Turi to explain",exact:true}).click();
  await expect.poll(f.calls).toBe(1);await expect(page.getByRole("heading",{name:"Preparing Your Explanation",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Stop explanation",exact:true}).click();await expect(page.getByRole("heading",{name:"Explanation Stopped",exact:true})).toBeVisible();
  await query("UPDATE execution_native_fixture_barriers SET released=true WHERE advice_attempt_id=$1",[f.prepared().attemptId]);
  await page.reload();await page.getByRole("tab",{name:"Turi",exact:true}).click();await expect(page.getByRole("heading",{name:"Explanation Stopped",exact:true})).toBeVisible();
  await expect(page.getByText(/Synthetic reviewed execution explanation\./)).toHaveCount(0);expect(await f.calls()).toBe(1);
  const denied=await page.request.get(`/api/conversations/${f.prepared().conversationId}`);
  expect(denied.status()).toBe(404);expect(await denied.text()).not.toContain("Synthetic reviewed execution explanation");
  await page.screenshot({path:testInfo.outputPath("execution-stopped.png"),fullPage:true});await audit(page);
});
test("recovers a lost preparation acknowledgement without sending and preserves an unconfirmed native result",async({page},testInfo)=>{
  test.setTimeout(180000);const f=await open(page,"barrier",true);await page.getByRole("button",{name:"Ask Turi to explain",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Preparation Unconfirmed",exact:true})).toBeVisible();expect(await f.calls()).toBe(0);
  await page.reload();await page.getByRole("tab",{name:"Turi",exact:true}).click();await page.getByRole("button",{name:"Check preparation",exact:true}).click();
  await expect(page.getByRole("button",{name:"Send prepared explanation",exact:true})).toBeVisible();expect(await f.calls()).toBe(0);
  await page.getByRole("button",{name:"Send prepared explanation",exact:true}).click();await expect.poll(f.calls).toBe(1);
  // Advance only the owned metadata deadline for this UI projection. The real
  // 120-second provider/restart timing is tested in execution-native.test.ts.
  await query("UPDATE execution_advice_attempts SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.prepared().attemptId]);
  await settleDueExecutionAdvisories();await page.getByRole("button",{name:"Check saved status",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Completion Unconfirmed",exact:true})).toBeVisible();
  await page.getByText("Request Details",{exact:true}).click();await expect(page.getByText("Reported input tokens: Unknown. Reported output tokens: Unknown.",{exact:true})).toBeVisible();
  expect(await f.calls()).toBe(1);await expect(page.getByRole("button",{name:"Send prepared explanation",exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("execution-unconfirmed.png"),fullPage:true});await audit(page);
});
