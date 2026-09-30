import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";
import { withTransaction } from "../../lib/server/db/client";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../../lib/server/plans/decisions";
import { readPlan } from "../../lib/server/plans/read";
import { readPlanHistory } from "../../lib/server/plans/read";
import { readPlanDiff } from "../../lib/server/plans/diff";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected=process.env.DATABASE_URL;
  if (!selected || selected!==process.env.TURAS_TEST_DATABASE_URL ||
      selected!==process.env.DATABASE_URL_UNPOOLED ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 acceptance tests require the owned disposable clone");
  }
}
function content() {
  const result=syntheticPlanContent();
  result.assertions=[];
  result.sourceDependencies=[];
  return result;
}

describe("exact plan acceptance",()=>{
  it("rolls back the whole decision and replays only a committed receipt",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:content()},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
      return {admin,created,submitted,preview};
    });
    const {admin,created,submitted,preview}=prepared;
    const decision={action:"accept" as const,requestKey:`plan_${randomUUID()}`,
      expectedAggregateVersion:submitted.aggregateVersion,
      revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
      reviewPreviewId:preview.previewId,
      rationale:"Reviewed synthetic rollback and lost response",
      deliverySuitabilityConfirmed:true};
    await expect(withTransaction(async(db)=>{
      await decidePlan(admin,created.planId,decision,db);
      throw new Error("synthetic transaction abort");
    })).rejects.toThrow("synthetic transaction abort");
    await withTransaction(async(db)=>{
      const row=await db.query<{decisions:string;engagements:string;
        baselines:string;accepted_revision_id:string|null}>(`SELECT
        (SELECT count(*)::text FROM plan_decisions WHERE plan_id=$1) AS decisions,
        (SELECT count(*)::text FROM engagements WHERE plan_id=$1) AS engagements,
        (SELECT count(*)::text FROM milestone_baselines WHERE plan_id=$1) AS baselines,
        accepted_revision_id FROM delivery_plans WHERE id=$1`,[created.planId]);
      expect(row.rows[0]).toEqual({decisions:"0",engagements:"0",
        baselines:"0",accepted_revision_id:null});
    });
    // The committed response may be lost to the caller; the same key must
    // resolve to the one durable decision and baseline without another write.
    const committed=await decidePlan(admin,created.planId,decision);
    const replay=await decidePlan(admin,created.planId,decision);
    expect(replay).toEqual(committed);
    await withTransaction(async(db)=>{
      const count=await db.query<{decisions:string;engagements:string;
        baselines:string}>(`SELECT
        (SELECT count(*)::text FROM plan_decisions WHERE plan_id=$1) AS decisions,
        (SELECT count(*)::text FROM engagements WHERE plan_id=$1) AS engagements,
        (SELECT count(*)::text FROM milestone_baselines WHERE plan_id=$1) AS baselines`,
      [created.planId]);
      expect(count.rows[0]).toEqual({decisions:"1",engagements:"1",baselines:"1"});
    });
  },120_000);

  it("serializes acceptance with original-source withdrawal",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const marker=randomUUID().slice(0,8);
      const source=await ingestVerifiedResearch({
        workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,
        trustedIdentity:"synthetic-fixture-v1",
        location:`https://example.com/plan-decision-race-${marker}`,
        title:"Synthetic decision race source",
        passage:`Synthetic delivery capability ${marker}`,
        supportedClaim:`Synthetic delivery capability ${marker}`,
        publicationAt:"2026-09-28T12:00:00Z",retrievalAt:"2026-09-29T12:00:00Z",
        rights:"Synthetic public fixture",audience:"delivery",
        qualityInput:{rubricVersion:"evidence-quality-v1",R:3,D:4,C:1,
          reliabilityRationale:"Named synthetic source",
          directnessRationale:"Direct synthetic passage",
          corroborationRationale:"Single synthetic source",
          informationType:"product_capability",dateBasis:"publication"},
        checks:{identity:true,scope:true,integrity:true,content:true,
          rationale:"Synthetic source checked",checkVersion:"research-check-v1"},
      },db);
      const sourceId=await materializeCurrentProjection(db,"verified_research",
        source.sourceRevisionId,"delivery");
      if(!sourceId)throw new Error("Synthetic race source unavailable");
      const projection=await db.query<{source_generation:string;content_digest:string;
        locators:unknown[]}>(`SELECT source.source_generation,source.content_digest,
          passage.locators FROM retrieval_sources source
          JOIN retrieval_passages passage ON passage.source_id=source.id
          WHERE source.id=$1 ORDER BY passage.ordinal LIMIT 1`,[sourceId]);
      const body=content() as PlanDraftContent;
      const dependencyId=randomUUID();
      body.sourceDependencies=[{id:dependencyId,kind:"verified_research",
        sourceRevisionId:source.sourceRevisionId,
        generation:Number(projection.rows[0].source_generation),
        contentDigest:projection.rows[0].content_digest,
        locator:projection.rows[0].locators[0] as typeof body.sourceDependencies[0]["locator"]}];
      body.assertions=[{key:"race_research",kind:"attributed_research",
        text:`Synthetic delivery capability ${marker}`,
        sourceDependencyIds:[dependencyId],decisionCritical:false}];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:body},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      return {admin,sourceRevisionId:source.sourceRevisionId,created,submitted,preview};
    });
    const decision={action:"accept" as const,requestKey:`plan_${randomUUID()}`,
      expectedAggregateVersion:prepared.submitted.aggregateVersion,
      revisionId:prepared.created.revisionId,
      contentDigest:prepared.created.contentDigest,
      reviewPreviewId:prepared.preview.previewId,
      rationale:"Reviewed synthetic source race",
      deliverySuitabilityConfirmed:true};
    const [accepted,withdrawn]=await Promise.allSettled([
      decidePlan(prepared.admin,prepared.created.planId,decision),
      withTransaction((db)=>submitProfileCommand(prepared.admin,
        PLAN_FIXTURE_SCOPE.customerId,{action:"withdraw_source",
          requestKey:randomUUID(),sourceRevisionId:prepared.sourceRevisionId,
          expectedLifecycleVersion:0,rationale:"Synthetic concurrent withdrawal"},db)),
    ]);
    expect(withdrawn.status).toBe("fulfilled");
    if(accepted.status==="rejected") {
      expect(accepted.reason).toMatchObject({status:409});
    }
    const withheld=await readPlan(prepared.admin,prepared.created.planId);
    expect(withheld.contentAvailability).toBe("withheld");
    expect(withheld.title).toBe("Review required");
    await withTransaction(async(db)=>{
      const counts=await db.query<{decisions:string;engagements:string;
        baselines:string}>(`SELECT
          (SELECT count(*) FROM plan_decisions WHERE plan_id=$1)::text AS decisions,
          (SELECT count(*) FROM engagements WHERE plan_id=$1)::text AS engagements,
          (SELECT count(*) FROM milestone_baselines WHERE plan_id=$1)::text AS baselines`,
      [prepared.created.planId]);
      const expected=accepted.status==="fulfilled" ? "1":"0";
      expect(counts.rows[0]).toEqual({decisions:expected,
        engagements:expected,baselines:expected});
    });
  },120_000);

  it("permits concurrent authorized detail, history and comparison reads",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:content()},db);
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
        reviewPreviewId:preview.previewId,rationale:"Reviewed concurrent read baseline",
        deliverySuitabilityConfirmed:true},db);
      const replacement=content();
      replacement.milestones[0].title="Revised concurrent proof";
      const saved=await submitPlanCommand(admin,{action:"save",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:first.aggregateVersion,
        parentRevisionId:created.revisionId,
        baseAcceptedRevisionId:created.revisionId,
        changeReason:"Revised proof",content:replacement},db);
      return {admin,created,saved};
    });
    const [detail,history,diff]=await Promise.all([
      readPlan(prepared.admin,prepared.created.planId),
      readPlanHistory(prepared.admin,prepared.created.planId),
      readPlanDiff(prepared.admin,prepared.created.planId,
        prepared.created.revisionId,prepared.saved.revisionId),
    ]);
    expect(detail.revisionId).toBe(prepared.saved.revisionId);
    expect(history.items.map((item)=>item.revisionId)).toEqual([
      prepared.saved.revisionId,prepared.created.revisionId]);
    expect(diff.changes.some((item)=>item.area==="milestones")).toBe(true);
  },90_000);

  it("accepts one exact revision into one canonical engagement and baseline",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT acceptance_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
          ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:content()},db);
        const submitted=await submitPlanCommand(admin,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:created.planId,
          expectedAggregateVersion:created.aggregateVersion,
          revisionId:created.revisionId,contentDigest:created.contentDigest},db);
        const member=await createProfileTestSession(db,"panel");
        await expect(createPlanReviewPreview(admin,created.planId,{
          requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:"0".repeat(64)},db))
          .rejects.toMatchObject({status:409});
        await expect(createPlanReviewPreview(member,created.planId,{
          requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db))
          .rejects.toMatchObject({status:403});
        const previewKey=`plan_${randomUUID()}`;
        const firstPreview=await createPlanReviewPreview(admin,created.planId,{
          requestKey:previewKey,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
        await db.query(`UPDATE plan_review_previews
          SET created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute'
          WHERE id=$1`,
          [firstPreview.previewId]);
        await expect(createPlanReviewPreview(admin,created.planId,{
          requestKey:previewKey,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db))
          .rejects.toMatchObject({status:409,code:"stale_review"});
        await expect(decidePlan(admin,created.planId,{action:"accept",
          requestKey:`plan_${randomUUID()}`,revisionId:submitted.revisionId,
          contentDigest:submitted.contentDigest,
          expectedAggregateVersion:submitted.aggregateVersion,
          reviewPreviewId:firstPreview.previewId,rationale:"Expired preview must fail",
          deliverySuitabilityConfirmed:true},db))
          .rejects.toMatchObject({status:409,code:"stale_review"});
        const preview=await createPlanReviewPreview(admin,created.planId,{
          requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
        expect(preview.readiness.ready).toBe(true);
        const key=`plan_${randomUUID()}`;
        const decision={action:"accept" as const,requestKey:key,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
          expectedAggregateVersion:submitted.aggregateVersion,
          reviewPreviewId:preview.previewId,rationale:"Reviewed synthetic plan and scope",
          deliverySuitabilityConfirmed:true};
        const accepted=await decidePlan(admin,created.planId,decision,db);
        expect(accepted.engagementId).toBeTruthy();
        expect(accepted.baselineId).toBeTruthy();
        expect(await decidePlan(admin,created.planId,decision,db)).toEqual(accepted);
        await expect(decidePlan(admin,created.planId,{...decision,
          requestKey:`plan_${randomUUID()}`},db)).rejects.toMatchObject({status:409});
        const counts=await db.query<{engagements:string;baselines:string;decisions:string}>(
          `SELECT (SELECT count(*) FROM engagements WHERE plan_id=$1)::text AS engagements,
            (SELECT count(*) FROM milestone_baselines WHERE plan_id=$1)::text AS baselines,
            (SELECT count(*) FROM plan_decisions WHERE plan_id=$1)::text AS decisions`,
          [created.planId]);
        expect(counts.rows[0]).toEqual({engagements:"1",baselines:"1",decisions:"1"});
        await db.query("UPDATE memberships SET role='member' WHERE id=$1",
          [admin.membershipId]);
        await expect(decidePlan(admin,created.planId,decision,db))
          .rejects.toMatchObject({status:401});
      } finally {await db.query("ROLLBACK TO SAVEPOINT acceptance_fixture");}
    });
  },60_000);

  it("serializes twenty competing keys and replays one committed key",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:content()},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
      return {admin,created,submitted,preview};
    });
    const {admin,created,submitted,preview}=prepared;
    const decision={action:"accept" as const,
      revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
      expectedAggregateVersion:submitted.aggregateVersion,
      reviewPreviewId:preview.previewId,rationale:"Reviewed synthetic race plan",
      deliverySuitabilityConfirmed:true};
    const keys=Array.from({length:20},()=>`plan_${randomUUID()}`);
    const results=await Promise.allSettled(keys.map((requestKey)=>
      decidePlan(admin,created.planId,{...decision,requestKey})));
    const winners=results.filter((result)=>result.status==="fulfilled");
    expect(winners).toHaveLength(1);
    const failures=results.filter((result):result is PromiseRejectedResult=>
      result.status==="rejected");
    const failureCodes=failures.reduce<Record<string,number>>((counts,result)=>{
      const reason=result.reason as {status?:number;code?:string;message?:string};
      const label=reason.message?.includes("timeout exceeded when trying to connect") ?
        "pool_connect_timeout":`${reason.status ?? "unknown"}:${reason.code ?? "unknown"}`;
      counts[label]=(counts[label] ?? 0)+1;
      return counts;
    },{});
    expect(failures).toHaveLength(19);
    expect(Object.keys(failureCodes).filter((code)=>
      !["409:stale_review","409:decision_conflict"].includes(code))).toEqual([]);
    const winnerIndex=results.findIndex((result)=>result.status==="fulfilled");
    const winner=results[winnerIndex] as PromiseFulfilledResult<Awaited<ReturnType<typeof decidePlan>>>;
    const replayAttempts=await Promise.allSettled(Array.from({length:20},()=>
      decidePlan(admin,created.planId,{...decision,requestKey:keys[winnerIndex]})));
    for (const attempt of replayAttempts) {
      const result=attempt.status==="fulfilled" ? attempt.value :
        await decidePlan(admin,created.planId,{...decision,requestKey:keys[winnerIndex]});
      expect(result.decisionId).toBe(winner.value.decisionId);
    }
    await withTransaction(async(db)=>{
      const counts=await db.query<{engagements:string;baselines:string;decisions:string}>(
        `SELECT (SELECT count(*) FROM engagements WHERE plan_id=$1)::text AS engagements,
          (SELECT count(*) FROM milestone_baselines WHERE plan_id=$1)::text AS baselines,
          (SELECT count(*) FROM plan_decisions WHERE plan_id=$1)::text AS decisions`,
        [created.planId]);
      expect(counts.rows[0]).toEqual({engagements:"1",baselines:"1",decisions:"1"});
    });
  },120_000);

  it("versions an accepted milestone baseline without replacing its engagement",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT replacement_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const initial=content();
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
          ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:initial},db);
        const submitted=await submitPlanCommand(admin,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:created.planId,
          expectedAggregateVersion:created.aggregateVersion,
          revisionId:created.revisionId,contentDigest:created.contentDigest},db);
        const firstPreview=await createPlanReviewPreview(admin,created.planId,{
          requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
        const first=await decidePlan(admin,created.planId,{action:"accept",
          requestKey:`plan_${randomUUID()}`,revisionId:submitted.revisionId,
          contentDigest:submitted.contentDigest,
          expectedAggregateVersion:submitted.aggregateVersion,
          reviewPreviewId:firstPreview.previewId,rationale:"Reviewed first baseline",
          deliverySuitabilityConfirmed:true},db);
        const replacement=content();
        replacement.title="Synthetic revised delivery baseline";
        replacement.milestones[0].title="Revised proof reviewed";
        const saved=await submitPlanCommand(admin,{action:"save",
          requestKey:`plan_${randomUUID()}`,planId:created.planId,
          expectedAggregateVersion:first.aggregateVersion,
          parentRevisionId:created.revisionId,
          baseAcceptedRevisionId:created.revisionId,
          changeReason:"Updated the proof exit evidence",content:replacement},db);
        const draft=await db.query<{base_accepted_revision_id:string;
          change_reason:string}>(`SELECT revision.base_accepted_revision_id,payload.change_reason
          FROM plan_revisions revision JOIN plan_revision_payloads payload
            ON payload.revision_id=revision.id WHERE revision.id=$1`,[saved.revisionId]);
        expect(draft.rows[0]).toEqual({base_accepted_revision_id:created.revisionId,
          change_reason:"Updated the proof exit evidence"});
        expect((await readPlan(admin,created.planId,undefined,db)).changeReason)
          .toBe("Updated the proof exit evidence");
        const before=await db.query<{active_baseline_id:string}>(
          "SELECT active_baseline_id FROM engagements WHERE id=$1",[first.engagementId]);
        expect(before.rows[0].active_baseline_id).toBe(first.baselineId);
        const secondSubmit=await submitPlanCommand(admin,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:created.planId,
          expectedAggregateVersion:saved.aggregateVersion,
          revisionId:saved.revisionId,contentDigest:saved.contentDigest},db);
        const secondPreview=await createPlanReviewPreview(admin,created.planId,{
          requestKey:`plan_${randomUUID()}`,
          expectedAggregateVersion:secondSubmit.aggregateVersion,
          revisionId:secondSubmit.revisionId,
          contentDigest:secondSubmit.contentDigest},db);
        const second=await decidePlan(admin,created.planId,{action:"accept",
          requestKey:`plan_${randomUUID()}`,revisionId:secondSubmit.revisionId,
          contentDigest:secondSubmit.contentDigest,
          expectedAggregateVersion:secondSubmit.aggregateVersion,
          reviewPreviewId:secondPreview.previewId,
          rationale:"Reviewed replacement baseline",engagementId:first.engagementId!,
          deliverySuitabilityConfirmed:true},db);
        expect(second.engagementId).toBe(first.engagementId);
        expect(second.baselineId).not.toBe(first.baselineId);
        const baselines=await db.query<{id:string;baseline_number:number;
          revision_id:string;content:{milestones:{title:string}[]}}>(`
          SELECT baseline.id,baseline.baseline_number,baseline.revision_id,payload.content
          FROM milestone_baselines baseline JOIN milestone_baseline_payloads payload
            ON payload.baseline_id=baseline.id
          WHERE baseline.engagement_id=$1 ORDER BY baseline.baseline_number`,
        [first.engagementId]);
        expect(baselines.rows).toHaveLength(2);
        expect(baselines.rows.map((row)=>Number(row.baseline_number))).toEqual([1,2]);
        expect(baselines.rows[0].revision_id).toBe(created.revisionId);
        expect(baselines.rows[0].content.milestones[0].title).toBe(initial.milestones[0].title);
        expect(baselines.rows[1].revision_id).toBe(saved.revisionId);
        expect(baselines.rows[1].content.milestones[0].title).toBe(replacement.milestones[0].title);
        const head=await db.query<{accepted_revision_id:string;
          working_revision_id:string;engagement_id:string}>(
          "SELECT accepted_revision_id,working_revision_id,engagement_id FROM delivery_plans WHERE id=$1",
          [created.planId]);
        expect(head.rows[0]).toMatchObject({accepted_revision_id:saved.revisionId,
          working_revision_id:saved.revisionId,engagement_id:first.engagementId});
        const states=await db.query<{state:string}>(`SELECT state FROM plan_revision_events
          WHERE revision_id=$1 ORDER BY event_order DESC LIMIT 1`,[created.revisionId]);
        expect(states.rows[0].state).toBe("superseded");
      } finally {await db.query("ROLLBACK TO SAVEPOINT replacement_fixture");}
    });
  },90_000);
});
