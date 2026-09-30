import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { createRetrievedPlanEvidence,createReviewedPlanWorkload } from "../fixtures/plans/journey";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";
import { sanitizedScreenshot,signIn,signOut } from "../fixtures/ui";

test("reviewed evidence reaches an exact accepted plan and canonical engagement",
  async({page},testInfo)=>{
    test.setTimeout(240_000);
    test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
      "Use the isolated 006 app and database clone");
    const actors=await withTransaction(async(db)=>({
      author:await createProfileTestSession(db,"panel"),
      reviewer:await createProfileTestSession(db,"mcteer"),
    }));
    const workloadId=await withTransaction((db)=>createReviewedPlanWorkload(db,
      actors.author,actors.reviewer,PLAN_FIXTURE_SCOPE.customerId));
    const evidence=await createRetrievedPlanEvidence(actors.author,actors.reviewer,
      PLAN_FIXTURE_SCOPE.customerId,workloadId);
    const content=syntheticPlanContent() as PlanDraftContent;
    content.title=`Synthetic reviewed context ${testInfo.project.name}`;
    content.sourceDependencies=[evidence.reference];
    content.assertions=[{key:"reviewed_web_use",kind:"accepted_fact",
      text:"The reviewed synthetic public web workload serves requests.",
      sourceDependencyIds:[evidence.reference.id],decisionCritical:false}];
    await signIn(page,"panel");
    const created=await page.evaluate(async({customerId,workloadId,content})=>{
      const session=await (await fetch("/api/auth/session",{cache:"no-store"})).json();
      const actor=session.data as {csrfToken:string;workspace:{id:string};membership:{id:string}};
      const post=async(path:string,body:unknown)=>{
        const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json",
          "x-csrf-token":actor.csrfToken},body:JSON.stringify(body)});
        const envelope=await response.json();
        if(!response.ok)throw new Error(envelope.error?.message ?? "Plan request failed");
        return envelope.data;
      };
      const draft=await post("/api/plans",{requestKey:crypto.randomUUID(),
        workspaceId:actor.workspace.id,customerId,workloadId,audience:"delivery",
        ownerMembershipId:actor.membership.id,content});
      const submitted=await post(`/api/plans/${draft.planId}/submit`,{
        requestKey:crypto.randomUUID(),expectedAggregateVersion:draft.aggregateVersion,
        revisionId:draft.revisionId,contentDigest:draft.contentDigest});
      return {planId:draft.planId,revisionId:submitted.revisionId};
    },{customerId:PLAN_FIXTURE_SCOPE.customerId,
      workloadId,content});
    if(testInfo.project.name.includes("mobile"))
      await page.getByRole("button",{name:"Open navigation"}).click();
    await signOut(page);
    await signIn(page,"mcteer");
    await page.goto(`/customers/${PLAN_FIXTURE_SCOPE.customerId}/plans/${created.planId}`);
    await expect(page.getByRole("heading",{name:content.title})).toBeVisible({timeout:30_000});
    const review=page.getByRole("region",{name:"Exact plan review"});
    await review.getByRole("button",{name:"Inspect exact revision"}).click();
    await expect(review.getByRole("heading",{name:content.title})).toBeVisible();
    await review.getByLabel("Decision rationale").fill("Reviewed synthetic source and delivery scope");
    await review.getByLabel("I reviewed this exact content for delivery suitability").check();
    await review.getByRole("button",{name:"Accept baseline"}).click();
    await expect(review.getByRole("status")).toContainText("Decision recorded",{timeout:30_000});
    await expect(page.getByRole("link",{name:"Accepted engagement"})).toBeVisible();
    await withTransaction(async(db)=>{
      const stored=await db.query<{source_revision_id:string;decision_id:string;
        engagement_id:string;baseline_id:string;body:unknown}>(`
        SELECT dependency.source_revision_id,decision.id AS decision_id,
          engagement.id AS engagement_id,baseline.id AS baseline_id,
          payload.content AS body
        FROM plan_source_dependencies dependency
        JOIN plan_revisions revision ON revision.id=dependency.revision_id
        JOIN plan_decisions decision ON decision.revision_id=revision.id
        JOIN engagements engagement ON engagement.plan_id=revision.plan_id
        JOIN milestone_baselines baseline ON baseline.decision_id=decision.id
        JOIN plan_revision_payloads payload ON payload.revision_id=revision.id
        WHERE revision.plan_id=$1 AND revision.id=$2`,
      [created.planId,created.revisionId]);
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].source_revision_id).toBe(evidence.reviewedRevisionId);
      expect(stored.rows[0].decision_id).toBeTruthy();
      expect(stored.rows[0].engagement_id).toBeTruthy();
      expect(stored.rows[0].baseline_id).toBeTruthy();
      expect(JSON.stringify(stored.rows[0].body)).not.toContain(evidence.reference.citationId);
    });
    await page.getByRole("link",{name:"Accepted engagement"}).click();
    await page.reload();
    await expect(page.getByRole("heading",{name:content.title})).toBeVisible();
    await expect(page).toHaveTitle("Turas");
    const axe=await new AxeBuilder({page}).analyze();
    expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
      .toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      .toBe(true);
    mkdirSync("local-artifacts/006",{recursive:true});
    await sanitizedScreenshot(page,`local-artifacts/006/plan-trusted-${testInfo.project.name}.png`);
    if(testInfo.project.name.includes("mobile"))
      await page.getByRole("button",{name:"Open navigation"}).click();
    await signOut(page);
    await signIn(page,"partner");
    await page.goto(`/customers/${PLAN_FIXTURE_SCOPE.customerId}/plans/${created.planId}`);
    await expect(page.getByRole("heading",{name:content.title})).toBeVisible();
  });
