import AxeBuilder from "@axe-core/playwright";
import { test, expect as baseExpect } from "@playwright/test";
import { signIn } from "../fixtures/ui";
import { requireOwnedExecutionClone } from "../../scripts/execution-eval-environment";
import { createAllocatedExecutionJourney } from "../fixtures/execution/journey";
import { withTransaction } from "../../lib/server/db/client";
const expect=baseExpect.configure({timeout:30000});
test.beforeEach(({page})=>{page.setDefaultTimeout(30000);requireOwnedExecutionClone();if(process.env.TURAS_EXECUTION_FIXTURE_READY!=="1")throw new Error("Use owned008 UI runner");});
test("reviewed allocation to private time, lost acknowledgement, correction, reversal and partner privacy",async({page},testInfo)=>{
  test.setTimeout(300000);const f=await createAllocatedExecutionJourney();
  const url=`/customers/${f.customerId}/engagements/${f.engagementId}/execution`;
  async function openTime(){
    await page.goto(url);await page.getByRole("tab",{name:"Time",exact:true}).click();
    // The UTC service date can differ from the browser-local default period.
    await page.getByLabel("Time to",{exact:true}).fill(f.date);
    await page.getByLabel("Time from",{exact:true}).fill(f.date);
  }
  await signIn(page,"panel");await openTime();
  await page.getByRole("combobox",{name:"Time subject",exact:true}).selectOption(f.resource.resourceId!);
  await page.getByLabel("Service date",{exact:true}).fill(f.date);
  await page.getByLabel("Time entry zone",{exact:true}).fill("UTC");
  await page.getByRole("combobox",{name:"Time work package",exact:true}).selectOption("proof");
  await page.getByRole("combobox",{name:"Reviewed activity",exact:true}).selectOption(f.activity.revisionId);
  await page.getByRole("combobox",{name:"Confirmed allocation",exact:true}).selectOption(f.allocationRevisionId);
  await page.getByLabel("Minutes worked",{exact:true}).fill("90");
  await page.getByLabel("Private time note",{exact:true}).fill("PRIVATE_BROWSER_TIME_NOTE");
  let posts=0;
  await page.route(`**/api/execution/engagements/${f.engagementId}/commands`,async route=>{
    if(route.request().postDataJSON().action==="time.create"&&!posts++){const response=await route.fetch();expect(response.status()).toBe(200);await response.dispose();await route.abort();return;}await route.continue();
  });
  await page.getByRole("button",{name:"Save time draft",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Check save receipt",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Check save receipt",exact:true}).click();
  await expect(page.getByRole("button",{name:"Check save receipt",exact:true})).toHaveCount(0);expect(posts).toBe(1);
  await page.getByRole("button",{name:"Submit time",exact:true}).click();
  await expect(page.getByRole("button",{name:"Submit time",exact:true})).toHaveCount(0);
  await signIn(page,"mcteer");await openTime();
  await page.getByRole("button",{name:"Review time",exact:true}).click();
  await expect(page.getByText("90 minutes · "+f.date,{exact:true})).toBeVisible();
  await page.getByRole("textbox",{name:"Review rationale",exact:true}).fill("Human verified the allocated work and exact private daily time");
  await page.getByRole("button",{name:"Confirm reviewed decision",exact:true}).focus();await page.keyboard.press("Enter");
  const entry=page.getByRole("article",{name:"Time entry 90 minutes",exact:true});
  await expect(entry.getByText("approved",{exact:true})).toBeVisible();
  await signIn(page,"partner");await openTime();await expect(page.getByRole("heading",{name:"Time and Actuals",exact:true})).toBeVisible();
  await expect(page.getByText("PRIVATE_BROWSER_TIME_NOTE",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("article",{name:"Time entry 90 minutes",exact:true})).toHaveCount(0);
  await signIn(page,"panel");await openTime();await page.getByRole("button",{name:"Correct time",exact:true}).click();
  await page.getByLabel("Minutes worked",{exact:true}).fill("60");await page.getByLabel("Private time note",{exact:true}).fill("Corrected private daily record");
  await page.getByRole("button",{name:"Save time draft",exact:true}).click();
  await expect(page.getByText("Prior approved revision remains counted while this correction is pending.",{exact:true})).toBeVisible();
  expect(await withTransaction(async db=>Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows[0].n))).toBe(90);
  await page.getByRole("button",{name:"Submit time",exact:true}).click();
  await expect(page.getByRole("button",{name:"Submit time",exact:true})).toHaveCount(0);
  await signIn(page,"mcteer");await openTime();await page.getByRole("button",{name:"Review time",exact:true}).click();
  await page.getByRole("textbox",{name:"Review rationale",exact:true}).fill("Human reviewed corrected minutes");await page.getByRole("button",{name:"Confirm reviewed decision",exact:true}).click();
  await expect(page.getByRole("article",{name:"Time entry 60 minutes",exact:true}).getByText("approved",{exact:true})).toBeVisible();
  expect(await withTransaction(async db=>Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows[0].n))).toBe(60);
  await page.screenshot({path:testInfo.outputPath("reviewed-time.png"),fullPage:true});
  await page.getByRole("button",{name:"Reverse approved time",exact:true}).click();await page.getByRole("textbox",{name:"Review rationale",exact:true}).fill("Human reverses a verified duplicate entry");
  await page.getByRole("button",{name:"Confirm reviewed decision",exact:true}).click();
  await expect(page.getByRole("article",{name:"Time entry 60 minutes",exact:true}).getByText("reversed",{exact:true})).toBeVisible();
  expect(await withTransaction(async db=>Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows[0].n))).toBe(0);
  const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>["serious","critical"].includes(v.impact??""))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Already-rendered private time is cleared by current session revocation.
  await signIn(page,"panel");await openTime();await expect(page.getByText("Corrected private daily record",{exact:true})).toBeVisible();
  await withTransaction(db=>db.query("UPDATE login_sessions SET revoked_at=now() WHERE principal_id=$1",[f.actors.author.principalId]));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Corrected private daily record",{exact:true})).toHaveCount(0,{timeout:15000});
  await expect(page.getByLabel("Private time note",{exact:true})).toHaveCount(0);
});

test("reviewer attributes an inactive subject and approves a batch with separate exceptions",async({page})=>{
  test.setTimeout(180000);
  const {timeFixture}=await import("../fixtures/execution/time"),f=await timeFixture({linked:false});
  await withTransaction(db=>db.query("UPDATE workforce_resources SET active=false WHERE id=$1",[f.resourceId]));
  await signIn(page,"mcteer");await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);await page.getByRole("tab",{name:"Time",exact:true}).click();
  for(const minutes of [15,20]) {
    await page.getByRole("combobox",{name:"Time subject",exact:true}).selectOption(f.resourceId);
    await page.getByLabel("Service date",{exact:true}).fill(f.date);
    await page.getByLabel("Time entry zone",{exact:true}).fill("UTC");
    await page.getByRole("combobox",{name:"Time work package",exact:true}).selectOption("proof");
    await page.getByRole("combobox",{name:"Reviewed activity",exact:true}).selectOption(f.activity.revisionId);
    await page.getByLabel("Minutes worked",{exact:true}).fill(String(minutes));
    await page.getByLabel("On-behalf entry rationale",{exact:true}).fill("Reviewer transcribed documented prior effort");
    await page.getByLabel("Private time note",{exact:true}).fill("Synthetic historical effort");
    await page.getByRole("button",{name:"Save time draft",exact:true}).click();
    const entry=page.getByRole("article",{name:`Time entry ${minutes} minutes`,exact:true});
    await entry.getByRole("button",{name:"Submit time",exact:true}).click();
    await expect(entry.getByText("submitted",{exact:true})).toBeVisible();
  }
  const boxes=page.getByRole("checkbox",{name:"Select for time review",exact:true});
  await expect(boxes).toHaveCount(2);await boxes.nth(0).check();await boxes.nth(1).check();
  await page.getByRole("button",{name:"Review selected time (2)",exact:true}).click();
  const groups=page.getByRole("group",{name:/Entry \d+: Required Exceptions/});
  await expect(groups).toHaveCount(2);
  for(let i=0;i<2;i++) {
    await groups.nth(i).getByRole("textbox",{name:"On-behalf attribution",exact:true}).fill("Human checked the subject attribution");
    await groups.nth(i).getByRole("textbox",{name:"Unplanned work",exact:true}).fill("Historical work had no booking");
    await groups.nth(i).getByRole("textbox",{name:"Unknown capacity and confirmed time zone",exact:true}).fill("Human confirms the UTC date despite absent calendar");
  }
  await page.getByRole("textbox",{name:"Review rationale",exact:true}).fill("Human checked both numerical entries");
  await expect(page.getByRole("button",{name:"Confirm reviewed decision",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Review updated exceptions",exact:true}).click();
  await expect(page.getByRole("button",{name:"Review updated exceptions",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Confirm reviewed decision",exact:true}).click();
  for(const minutes of [15,20])await expect(page.getByRole("article",{name:`Time entry ${minutes} minutes`,exact:true}).getByText("approved",{exact:true})).toBeVisible();
  expect(await withTransaction(async db=>Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows[0].n))).toBe(35);
  // A numerical correction stays possible when its old activity is withdrawn;
  // the UI must not refill the withheld private note or invent eligible evidence.
  const {readExecutionOverview,readExecutionRecords,previewExecutionCommand,submitExecutionCommand}=await import("../../lib/server/execution/service");
  const activity=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records.find(r=>r.kind==="activity")!;
  const view=await readExecutionOverview(f.reviewer,f.engagementId);
  const retract={version:"execution-v1",action:"record.retract",expectedVersions:{execution:view.version,record:activity.version},
    payload:{recordId:activity.id,revisionId:activity.revisionId,contentDigest:activity.contentDigest}};
  await submitExecutionCommand(f.reviewer,f.engagementId,{...retract,...await previewExecutionCommand(f.reviewer,f.engagementId,retract),requestKey:crypto.randomUUID(),rationale:"Human withdraws the prior work evidence"});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Source or subject review required. Private notes are withheld; approved numerical history is retained.",{exact:true})).toHaveCount(2);
  await expect(page.getByRole("combobox",{name:"Reviewed activity",exact:true}).getByRole("option",{name:"Synthetic observed work",exact:true})).toHaveCount(0);
  await page.getByRole("article",{name:"Time entry 15 minutes",exact:true}).getByRole("button",{name:"Correct time",exact:true}).click();
  await expect(page.getByLabel("Private time note",{exact:true})).toHaveValue("");
  await page.getByLabel("Minutes worked",{exact:true}).fill("12");
  await page.getByLabel("On-behalf entry rationale",{exact:true}).fill("Reviewer corrects historical numerical effort");
  await page.getByLabel("Private time note",{exact:true}).fill("Fresh numerical correction rationale");
  await page.getByRole("button",{name:"Save time draft",exact:true}).click();
  const corrected=page.getByRole("article",{name:"Time entry 12 minutes",exact:true});
  await corrected.getByRole("button",{name:"Submit time",exact:true}).click();
  await corrected.getByRole("button",{name:"Review time",exact:true}).click();
  for(const name of ["On-behalf attribution","Unplanned work","Unknown capacity and confirmed time zone","Unavailable source — numerical effort only"])
    await page.getByRole("textbox",{name,exact:true}).fill("Human confirms historical UTC numerical work; source text remains withheld");
  await page.getByRole("button",{name:"Review updated exceptions",exact:true}).click();
  await expect(page.getByRole("button",{name:"Review updated exceptions",exact:true})).toHaveCount(0);
  await page.getByRole("textbox",{name:"Review rationale",exact:true}).fill("Human approves exact numerical correction only");
  await page.getByRole("button",{name:"Confirm reviewed decision",exact:true}).click();
  await expect(corrected.getByText("approved",{exact:true})).toBeVisible();
  await expect(page.getByText("Fresh numerical correction rationale",{exact:true})).toHaveCount(0);
  expect(await withTransaction(async db=>Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows[0].n))).toBe(32);
});
