import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { syntheticPlanContent } from "../fixtures/plans/seed";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("scoped Turi draft shows recoverable dispatch and cancellation",async({page},testInfo)=>{
  test.setTimeout(120_000);
  test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
    "Use the isolated 006 app and database clone");
  await signIn(page,"mcteer");
  const content=syntheticPlanContent();
  content.title=`Synthetic Turi draft ${testInfo.project.name}`;
  content.assertions=[];content.sourceDependencies=[];
  const created=await page.evaluate(async({customerId,content})=>{
    const session=await (await fetch("/api/auth/session",{cache:"no-store"})).json();
    const actor=session.data as {csrfToken:string;workspace:{id:string};membership:{id:string}};
    const response=await fetch("/api/plans",{method:"POST",headers:{
      "content-type":"application/json","x-csrf-token":actor.csrfToken},
      body:JSON.stringify({requestKey:crypto.randomUUID(),workspaceId:actor.workspace.id,
        customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:actor.membership.id,content})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error?.message ?? "Plan create failed");
    return result.data as {planId:string;revisionId:string};
  },{customerId:DEMO_IDS.sharedCustomer,content});
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}/plans/${created.planId}`);
  await page.getByRole("button",{name:"Draft with Turi"}).click();
  const panel=page.getByRole("region",{name:"Turi plan drafting"});
  await expect(panel).toContainText(`Base revision ${created.revisionId}`);
  await expect(panel).toContainText("Audience: delivery");
  await expect(panel.getByLabel("Drafting request")).toBeVisible();
  await page.route("**/eve/v1/session/wrun_*",async(route)=>{
    if(route.request().method()!=="POST")return route.continue();
    await route.fulfill({status:503,contentType:"application/json",
      body:JSON.stringify({ok:false,code:"synthetic_dispatch_unavailable"})});
  });
  await panel.getByRole("button",{name:"Ask Turi to draft"}).click();
  await expect(panel.getByRole("button",{name:"Check saved status"}))
    .toBeVisible({timeout:30_000});
  await expect(panel).toContainText("Dispatch was not confirmed");
  await page.reload();
  await page.getByRole("button",{name:"Draft with Turi"}).click();
  const restored=page.getByRole("region",{name:"Turi plan drafting"});
  await expect(restored.getByRole("button",{name:/Check saved status|Retry status read/}))
    .toBeVisible({timeout:30_000});
  const retry=restored.getByRole("button",{name:"Retry status read"});
  if(await retry.isVisible()) await retry.click();
  await expect(restored.getByRole("button",{name:"Check saved status"}))
    .toBeVisible({timeout:30_000});
  await restored.getByRole("button",{name:"Cancel draft"}).click();
  await expect(restored).toContainText("cancelled",{timeout:20_000});
  const axe=await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("local-artifacts/006",{recursive:true});
  await sanitizedScreenshot(page,`local-artifacts/006/plan-drafting-${testInfo.project.name}.png`);
});
