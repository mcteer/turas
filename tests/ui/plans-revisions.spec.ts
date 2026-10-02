import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { withTransaction } from "../../lib/server/db/client";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../../lib/server/plans/decisions";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";
import { createProfileTestSession } from "../fixtures/profiles";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("compares a replacement and accepts a second baseline on the same engagement",
  async({page},testInfo)=>{
    test.setTimeout(150_000);
    test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
      "Use the isolated 006 app and database clone");
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const initial=syntheticPlanContent();
      initial.title=`Synthetic first baseline ${testInfo.project.name}`;
      initial.assertions=[];initial.sourceDependencies=[];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:initial},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
      const first=await decidePlan(admin,created.planId,{action:"accept",
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
        reviewPreviewId:preview.previewId,rationale:"Reviewed first synthetic baseline",
        deliverySuitabilityConfirmed:true},db);
      const replacement=syntheticPlanContent();
      replacement.title=`Synthetic replacement ${testInfo.project.name}`;
      replacement.milestones[0].title="Revised proof exit evidence";
      replacement.assertions=[];replacement.sourceDependencies=[];
      const saved=await submitPlanCommand(admin,{action:"save",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:first.aggregateVersion,
        parentRevisionId:created.revisionId,
        baseAcceptedRevisionId:created.revisionId,
        changeReason:"Updated proof exit evidence",content:replacement},db);
      return {planId:created.planId,firstRevisionId:created.revisionId,
        engagementId:first.engagementId,firstBaselineId:first.baselineId,
        saved,secondTitle:replacement.title};
    });
    await signIn(page,"mcteer");
    await page.goto(`/customers/${PLAN_FIXTURE_SCOPE.customerId}/plans/${prepared.planId}`);
    await expect(page.getByRole("heading",{name:prepared.secondTitle})).toBeVisible({timeout:30_000});
    const comparison=page.getByRole("region",{name:"Revision comparison"});
    await expect(comparison).toContainText("milestones",{timeout:30_000});
    await expect(page.locator("header").getByText("Change reason: Updated proof exit evidence"))
      .toBeVisible();
    await expect(page.getByRole("link",{name:"Accepted Engagement"})).toBeVisible();
    await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:prepared.planId,
        expectedAggregateVersion:prepared.saved.aggregateVersion,
        revisionId:prepared.saved.revisionId,
        contentDigest:prepared.saved.contentDigest},db);
    });
    await page.reload();
    await expect(page.getByRole("region",{name:"Revision comparison"}))
      .toContainText("milestones",{timeout:30_000});
    await expect(page.getByRole("button",{name:/Revision 1:/})).toBeVisible();
    const review=page.getByRole("region",{name:"Exact plan review"});
    await expect(review).toBeVisible({timeout:30_000});
    await review.getByRole("button",{name:"Inspect exact revision"}).click();
    await expect(review.getByRole("heading",{name:prepared.secondTitle})).toBeVisible({timeout:30_000});
    await review.getByLabel("Decision rationale").fill("Reviewed synthetic replacement");
    await review.getByLabel("I reviewed this exact content for delivery suitability").check();
    await review.getByRole("button",{name:"Accept baseline"}).click();
    await expect(review.getByRole("status")).toContainText("Decision recorded",{timeout:30_000});
    await expect(page.getByRole("region",{name:"Revision comparison"})).toHaveCount(0);
    const identity=await withTransaction(async(db)=>{
      const result=await db.query<{engagement_id:string;active_baseline_id:string;
        baseline_number:number;revision_id:string}>(`SELECT engagement.id AS engagement_id,
        engagement.active_baseline_id,baseline.baseline_number,baseline.revision_id
        FROM engagements engagement JOIN milestone_baselines baseline
          ON baseline.id=engagement.active_baseline_id
        WHERE engagement.plan_id=$1`,[prepared.planId]);
      return result.rows[0];
    });
    expect(identity.engagement_id).toBe(prepared.engagementId);
    expect(identity.active_baseline_id).not.toBe(prepared.firstBaselineId);
    expect(Number(identity.baseline_number)).toBe(2);
    expect(identity.revision_id).toBe(prepared.saved.revisionId);
    const history=page.getByRole("heading",{name:"Revision History"}).locator("..");
    await expect(history.getByRole("button",{name:/Revision 1:/})).toBeVisible();
    const axe=await new AxeBuilder({page}).analyze();
    expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
      .toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    mkdirSync("local-artifacts/006",{recursive:true});
    await sanitizedScreenshot(page,`local-artifacts/006/plan-revisions-${testInfo.project.name}.png`);
  });
