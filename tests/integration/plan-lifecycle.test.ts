import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";
import { withTransaction } from "../../lib/server/db/client";
import { getServerConfig } from "../../lib/server/config";
import { claimDispatch,prepareAttempt } from "../../lib/server/conversations/dispatch";
import { assertNativeContextCurrent } from "../../lib/server/conversations/context-fence";
import { setPartnerGrant } from "../../lib/server/access/service";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import { resolveRetrievalCitation } from "../../lib/server/retrieval/citations";
import { createPlanReviewPreview,decidePlan } from "../../lib/server/plans/decisions";
import { createFreshPlanConversation } from "../../lib/server/plans/context";
import { getPlanDraft,startPlanDraft } from "../../lib/server/plans/drafting";
import { runPlanCleanupTick } from "../../lib/server/plans/cleanup";
import { listPlans,readPlan,readPlanHistory } from "../../lib/server/plans/read";
import { readPlanDiff } from "../../lib/server/plans/diff";
import { readEngagement } from "../../lib/server/engagements/read";
import { loadPlan } from "../../lib/server/plans/repository";
import { readPlanSource } from "../../lib/server/plans/sources";
import { createProfileTestSession } from "../fixtures/profiles";
import { createPublishedPlanPractice } from "../fixtures/plans/journey";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected=process.env.DATABASE_URL;
  if (!selected || selected!==process.env.TURAS_TEST_DATABASE_URL ||
      selected!==process.env.DATABASE_URL_UNPOOLED ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 lifecycle tests require the owned disposable clone");
  }
}

describe("plan cleanup lifecycle",()=>{
  it("warns on stale but eligible research without withholding or cleanup",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const marker=randomUUID().slice(0,8);
      const source=await ingestVerifiedResearch({
        workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,
        trustedIdentity:"synthetic-fixture-v1",
        location:`https://example.com/plan-stale-${marker}`,
        title:"Historical synthetic research",passage:`Historical capability ${marker}`,
        supportedClaim:`Historical capability ${marker}`,
        publicationAt:"2021-01-01T12:00:00Z",retrievalAt:"2026-09-29T12:00:00Z",
        rights:"Synthetic public fixture",audience:"delivery",
        qualityInput:{rubricVersion:"evidence-quality-v1",R:3,D:4,C:1,
          reliabilityRationale:"Named synthetic source",
          directnessRationale:"Direct synthetic passage",
          corroborationRationale:"Single synthetic source",
          informationType:"product_capability",dateBasis:"publication"},
        checks:{identity:true,scope:true,integrity:true,content:true,
          rationale:"Historical source checked",checkVersion:"research-check-v1"},
      },db);
      const sourceId=await materializeCurrentProjection(db,"verified_research",
        source.sourceRevisionId,"delivery");
      const projection=await db.query<{source_id:string;passage_id:string;
        source_generation:string;content_digest:string;projection_contract:string;
        passage_digest:string;locators:unknown[]}>(`SELECT source.id AS source_id,
          passage.id AS passage_id,source.source_generation,source.content_digest,
          source.projection_contract,passage.passage_digest,passage.locators
          FROM retrieval_sources source
          JOIN retrieval_passages passage ON passage.source_id=source.id
          WHERE source.id=$1 ORDER BY passage.ordinal LIMIT 1`,[sourceId]);
      const content=syntheticPlanContent() as unknown as PlanDraftContent;
      const dependencyId=randomUUID();
      const receiptId=randomUUID(),citationId=randomUUID();
      await db.query(`INSERT INTO retrieval_receipts
        (id,environment_id,actor_membership_id,scope,workspace_id,customer_id,
         mode,citation_ids,as_of,valid_until)
        VALUES($1,$2,$3,'customer',$4,$5,'lexical_degraded',$6,
          clock_timestamp(),clock_timestamp()+interval '3 seconds')`,
      [receiptId,getServerConfig().TURAS_ENVIRONMENT_ID,admin.membershipId,
        admin.workspaceId,PLAN_FIXTURE_SCOPE.customerId,JSON.stringify([citationId])]);
      await db.query(`INSERT INTO retrieval_receipt_sources
        (id,receipt_id,ordinal,source_id,passage_id,source_kind,
         source_revision_id,source_generation,passage_digest,projection_contract,
         locators,valid_until)
        VALUES($1,$2,1,$3,$4,'verified_research',$5,$6,$7,$8,$9,
          clock_timestamp()+interval '3 seconds')`,
      [citationId,receiptId,projection.rows[0].source_id,
        projection.rows[0].passage_id,source.sourceRevisionId,
        projection.rows[0].source_generation,projection.rows[0].passage_digest,
        projection.rows[0].projection_contract,
        JSON.stringify(projection.rows[0].locators)]);
      content.sourceDependencies=[{id:dependencyId,kind:"verified_research",
        sourceRevisionId:source.sourceRevisionId,
        generation:Number(projection.rows[0].source_generation),
        contentDigest:projection.rows[0].content_digest,
        locator:projection.rows[0].locators[0] as
          typeof content.sourceDependencies[0]["locator"],citationId}];
      content.assertions=[{key:"historical_capability",kind:"attributed_research",
        text:`Historical capability ${marker}`,sourceDependencyIds:[dependencyId],
        decisionCritical:false}];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:admin.membershipId,content},db);
      return {admin,created,citationId};
    });
    await new Promise((done)=>setTimeout(done,4_000));
    await expect(withTransaction((db)=>resolveRetrievalCitation(db,prepared.admin,
      prepared.citationId))).rejects.toMatchObject({status:404});
    const detail=await readPlan(prepared.admin,prepared.created.planId);
    expect(detail.contentAvailability).toBe("historical_warning");
    expect(detail.content).not.toBeNull();
    const listed=(await listPlans(prepared.admin,PLAN_FIXTURE_SCOPE.customerId))
      .items.find((item)=>item.planId===prepared.created.planId);
    expect(listed?.contentAvailability).toBe("historical_warning");
    const jobs=await withTransaction((db)=>db.query(`SELECT 1 FROM plan_cleanup_jobs
      WHERE revision_id=$1`,[prepared.created.revisionId]));
    expect(jobs.rowCount).toBe(0);
  },90_000);

  it("withholds shared guidance immediately when private lineage is retracted",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const author=await createProfileTestSession(db,"panel");
      const partner=await createProfileTestSession(db,"partner");
      const practice=await createPublishedPlanPractice(db,author,admin,
        PLAN_FIXTURE_SCOPE.workspaceId);
      const body=syntheticPlanContent() as PlanDraftContent;
      body.sourceDependencies=[practice.reference];
      body.assertions=[{key:"reused_practice",kind:"shared_practice",
        text:"Published synthetic practice suggests measuring build stages, " +
          "subject to workload-specific validation.",
        sourceDependencyIds:[practice.reference.id],decisionCritical:false}];
      const created=await submitPlanCommand(partner,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
        audience:"delivery",ownerMembershipId:partner.membershipId,content:body},db);
      const submitted=await submitPlanCommand(partner,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
      const accepted=await decidePlan(admin,created.planId,{
        action:"accept",requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
        reviewPreviewId:preview.previewId,
        rationale:"Reviewed synthetic shared practice with private lineage",
        deliverySuitabilityConfirmed:true},db);
      const privateRow=await db.query(`SELECT 1 FROM plan_private_dependencies
        WHERE revision_id=$1 AND source_kind='accepted_profile'
          AND source_revision_id=$2`,
      [created.revisionId,practice.originRevisionId]);
      expect(privateRow.rowCount).toBe(1);
      return {admin,partner,practice,created,engagementId:accepted.engagementId!};
    });
    const before=await readPlan(prepared.partner,prepared.created.planId);
    expect(["readable","historical_warning"]).toContain(before.contentAvailability);
    expect(JSON.stringify(before)).not.toContain(prepared.practice.privateOriginName);
    const grantRevision=await withTransaction(async(db)=>{
      const found=await db.query<{revision:string}>(`SELECT revision FROM customer_grants
        WHERE membership_id=$1 AND customer_id=$2`,
      [prepared.partner.membershipId,PLAN_FIXTURE_SCOPE.customerId]);
      return Number(found.rows[0].revision);
    });
    const revoked=await setPartnerGrant({actorPrincipalId:prepared.admin.principalId,
      actorSessionId:prepared.admin.sessionId,
      membershipId:prepared.partner.membershipId,
      customerId:PLAN_FIXTURE_SCOPE.customerId,requestKey:randomUUID(),
      expectedRevision:grantRevision,state:"revoked"});
    await expect(readPlan(prepared.partner,prepared.created.planId))
      .rejects.toMatchObject({status:404});
    await expect(listPlans(prepared.partner,PLAN_FIXTURE_SCOPE.customerId))
      .rejects.toMatchObject({status:404});
    await setPartnerGrant({actorPrincipalId:prepared.admin.principalId,
      actorSessionId:prepared.admin.sessionId,
      membershipId:prepared.partner.membershipId,
      customerId:PLAN_FIXTURE_SCOPE.customerId,requestKey:randomUUID(),
      expectedRevision:revoked.revision,state:"active"});
    await withTransaction(async(db)=>{
      const record=await db.query<{version:string}>(`SELECT record.version
        FROM profile_revisions revision JOIN profile_records record
          ON record.id=revision.record_id WHERE revision.id=$1`,
      [prepared.practice.originRevisionId]);
      await submitProfileCommand(prepared.admin,prepared.practice.originCustomerId,{
        action:"retract_revision",requestKey:randomUUID(),
        revisionId:prepared.practice.originRevisionId,
        expectedRecordVersion:Number(record.rows[0].version),
        rationale:"Synthetic private origin withdrawn"},db);
      const queued=await db.query(`SELECT 1 FROM plan_cleanup_jobs
        WHERE revision_id=$1 AND state='queued'`,[prepared.created.revisionId]);
      expect(queued.rowCount).toBeGreaterThan(0);
    });
    // Maintenance is intentionally paused; every read must honor the private
    // source closure before asynchronous suspension and payload cleanup.
    const hidden=await readPlan(prepared.partner,prepared.created.planId);
    expect(hidden.contentAvailability).toBe("withheld");
    expect(hidden.title).toBe("Review required");
    expect(hidden.content).toBeNull();
    const listed=(await listPlans(prepared.partner,PLAN_FIXTURE_SCOPE.customerId))
      .items.find((item)=>item.planId===prepared.created.planId);
    expect(listed).toMatchObject({title:"Review required",
      contentAvailability:"withheld"});
    const history=await readPlanHistory(prepared.partner,prepared.created.planId);
    expect(history.items.find((item)=>item.revisionId===prepared.created.revisionId))
      .toMatchObject({title:"Review required",contentAvailability:"withheld",
        content:null,changeReason:null});
    await expect(readPlanDiff(prepared.partner,prepared.created.planId,
      prepared.created.revisionId,prepared.created.revisionId))
      .rejects.toMatchObject({status:409,code:"plan_unavailable"});
    const engagement=await readEngagement(prepared.partner,prepared.engagementId);
    expect(engagement.title).toBe("Review required");
    expect(engagement.milestones).toBeNull();
    await expect(withTransaction((db)=>readPlanSource(db,prepared.partner,
      prepared.created.planId,prepared.created.revisionId,
      prepared.practice.reference.id))).rejects.toMatchObject({status:404});
    expect(JSON.stringify({hidden,listed,engagement})).not.toContain(
      prepared.practice.privateOriginName);
  },120_000);

  it("skips wrong-generation work, purges only the exact revision, and retains tombstones",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const content=syntheticPlanContent() as unknown as PlanDraftContent;
      content.assertions=[];content.sourceDependencies=[];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      await db.query(`UPDATE plan_review_previews
        SET created_at=now()-interval '25 hours',
          expires_at=now()-interval '25 hours'+interval '5 minutes'
        WHERE id=$1`,[preview.previewId]);
      const activePreview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const accepted=await decidePlan(admin,created.planId,{
        action:"accept",requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest,
        reviewPreviewId:activePreview.previewId,rationale:"Reviewed synthetic cleanup baseline",
        deliverySuitabilityConfirmed:true},db);
      const plan=await loadPlan(db,admin,created.planId);
      const conversation=await createFreshPlanConversation(db,admin,plan);
      const attemptId=randomUUID();
      await db.query(`INSERT INTO plan_drafting_attempts
        (id,environment_id,workspace_id,customer_id,plan_id,base_revision_id,
         base_aggregate_version,request_key,conversation_id,
         actor_membership_id,actor_session_id,request_digest,
         state,deadline_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'failed',
          now()-interval '31 days',now()-interval '31 days')`,
      [attemptId,plan.environment_id,plan.workspace_id,plan.customer_id,plan.id,
        created.revisionId,accepted.aggregateVersion,randomUUID(),
        conversation.conversationId,admin.membershipId,admin.sessionId,"a".repeat(64)]);
      await db.query(`INSERT INTO plan_drafting_instruction_payloads
        (attempt_id,instructions) VALUES($1,'Synthetic old draft')`,[attemptId]);
      const staleJob=randomUUID();
      await db.query(`INSERT INTO plan_cleanup_jobs
        (id,environment_id,revision_id,source_generation,reason_code,state)
        VALUES($1,$2,$3,999,'wrong_generation','queued')`,
      [staleJob,plan.environment_id,created.revisionId]);
      return {admin,created,attemptId,staleJob,previewId:preview.previewId,
        baselineId:accepted.baselineId,decisionId:accepted.decisionId,
        environmentId:plan.environment_id};
    });
    const first=await runPlanCleanupTick();
    // The worker drains all eligible jobs in this owned clone. Other suites
    // can enqueue independent invalidations before this test reaches its tick.
    expect(first.jobs).toBeGreaterThanOrEqual(1);
    expect(first.pruned).toBeGreaterThanOrEqual(2);
    expect((await readPlan(prepared.admin,prepared.created.planId)).contentAvailability)
      .toBe("readable");
    const retainedAttempt=await getPlanDraft(prepared.admin,prepared.attemptId);
    expect(retainedAttempt.state).toBe("failed");
    expect(retainedAttempt.instructions).toBe("");
    await withTransaction(async(db)=>{
      const stale=await db.query<{state:string}>(
        "SELECT state FROM plan_cleanup_jobs WHERE id=$1",[prepared.staleJob]);
      expect(stale.rows[0].state).toBe("completed");
      const instructions=await db.query(
        "SELECT 1 FROM plan_drafting_instruction_payloads WHERE attempt_id=$1",
        [prepared.attemptId]);
      expect(instructions.rowCount).toBe(0);
      const preview=await db.query("SELECT 1 FROM plan_review_previews WHERE id=$1",
        [prepared.previewId]);
      expect(preview.rowCount).toBe(0);
      const baselinePayload=await db.query(
        "SELECT 1 FROM milestone_baseline_payloads WHERE baseline_id=$1",
        [prepared.baselineId]);
      expect(baselinePayload.rowCount).toBe(1);
      await db.query(`INSERT INTO plan_cleanup_jobs
        (id,environment_id,revision_id,reason_code,state)
        VALUES($1,$2,$3,'source_withdrawn','queued')`,
      [randomUUID(),prepared.environmentId,prepared.created.revisionId]);
    });
    expect((await runPlanCleanupTick()).jobs).toBeGreaterThanOrEqual(1);
    expect((await readPlan(prepared.admin,prepared.created.planId)).contentAvailability)
      .toBe("purged");
    await withTransaction(async(db)=>{
      const state=await db.query<{state:string}>(`SELECT state FROM plan_cleanup_jobs
        WHERE revision_id=$1 ORDER BY reason_code`,[prepared.created.revisionId]);
      expect(state.rows.map((row)=>row.state)).toEqual(["completed","completed"]);
      const retained=await db.query(`SELECT 1 FROM milestone_baselines WHERE id=$1`,
        [prepared.baselineId]);
      const payload=await db.query(`SELECT 1 FROM milestone_baseline_payloads WHERE baseline_id=$1`,
        [prepared.baselineId]);
      const rationale=await db.query(`SELECT 1 FROM plan_decision_payloads WHERE decision_id=$1`,
        [prepared.decisionId]);
      expect(retained.rowCount).toBe(1);
      expect(payload.rowCount).toBe(0);
      expect(rationale.rowCount).toBe(0);
    });
  },90_000);

  it("withholds a plan immediately on source withdrawal and queues exact cleanup",async()=>{
    requireOwnedClone();
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const marker=randomUUID().slice(0,8);
      const source=await ingestVerifiedResearch({
        workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,
        trustedIdentity:"synthetic-fixture-v1",
        location:`https://example.com/plan-source-${marker}`,
        title:"Synthetic plan source",passage:`Synthetic delivery capability ${marker}`,
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
      expect(sourceId).toBeTruthy();
      const projection=await db.query<{source_generation:string;content_digest:string;
        locators:unknown[]}>(`SELECT source.source_generation,source.content_digest,
          passage.locators FROM retrieval_sources source
          JOIN retrieval_passages passage ON passage.source_id=source.id
          WHERE source.id=$1 ORDER BY passage.ordinal LIMIT 1`,[sourceId]);
      const content=syntheticPlanContent() as unknown as PlanDraftContent;
      const dependencyId=randomUUID();
      content.sourceDependencies=[{id:dependencyId,kind:"verified_research",
        sourceRevisionId:source.sourceRevisionId,
        generation:Number(projection.rows[0].source_generation),
        contentDigest:projection.rows[0].content_digest,
        locator:projection.rows[0].locators[0] as typeof content.sourceDependencies[0]["locator"]}];
      content.assertions=[{key:"synthetic_research",kind:"attributed_research",
        text:`Synthetic delivery capability ${marker}`,
        sourceDependencyIds:[dependencyId],decisionCritical:false}];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content},db);
      const submitted=await submitPlanCommand(admin,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(admin,created.planId,{
        requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const accepted=await decidePlan(admin,created.planId,{
        action:"accept",requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest,
        reviewPreviewId:preview.previewId,
        rationale:"Reviewed synthetic source-bound baseline",
        deliverySuitabilityConfirmed:true},db);
      const drafting=await startPlanDraft(admin,{requestKey:randomUUID(),
        planId:created.planId,baseRevisionId:created.revisionId,
        expectedAggregateVersion:accepted.aggregateVersion,
        instructions:"Inspect synthetic source-bound draft"},db);
      const nativeSessionId=`wrun_${randomUUID().replaceAll("-","")}`;
      await db.query(`UPDATE conversations SET eve_session_id=$2,binding_state='bound'
        WHERE id=$1`,[drafting.conversationId,nativeSessionId]);
      await db.query(`INSERT INTO maintenance_workers
        (environment_id,worker_id,last_seen_at) VALUES($1,$2,clock_timestamp())
        ON CONFLICT (environment_id,worker_id) DO UPDATE
          SET last_seen_at=clock_timestamp()`,
      [getServerConfig().TURAS_ENVIRONMENT_ID,randomUUID()]);
      const response=await prepareAttempt(admin,drafting.conversationId,
        nativeSessionId,drafting.requestKey,drafting.instructions,[],db);
      return {admin,source,created,engagementId:accepted.engagementId!,
        nativeSessionId,conversationId:drafting.conversationId,
        responseAttemptId:response.attemptId};
    });
    await claimDispatch(prepared.admin,prepared.conversationId,
      prepared.responseAttemptId,0);
    await assertNativeContextCurrent(prepared.admin,prepared.nativeSessionId);
    expect((await readPlan(prepared.admin,prepared.created.planId)).contentAvailability)
      .toBe("readable");
    await withTransaction(async(db)=>{
      await submitProfileCommand(prepared.admin,PLAN_FIXTURE_SCOPE.customerId,{
        action:"withdraw_source",requestKey:randomUUID(),
        sourceRevisionId:prepared.source.sourceRevisionId,
        expectedLifecycleVersion:0,rationale:"Synthetic source withdrawn"},db);
      const queued=await db.query<{state:string}>(`SELECT state FROM plan_cleanup_jobs
        WHERE revision_id=$1 AND reason_code='source_invalidated'`,
      [prepared.created.revisionId]);
      expect(queued.rows).toHaveLength(1);
      expect(queued.rows[0].state).toBe("queued");
    });
    const withheld=await readPlan(prepared.admin,prepared.created.planId);
    await expect(assertNativeContextCurrent(prepared.admin,prepared.nativeSessionId))
      .rejects.toMatchObject({status:409,code:"context_changed"});
    expect(withheld.contentAvailability).toBe("withheld");
    expect(withheld.title).toBe("Review required");
    expect(withheld.content).toBeNull();
    const summary=(await listPlans(prepared.admin,PLAN_FIXTURE_SCOPE.customerId))
      .items.find((item)=>item.planId===prepared.created.planId);
    expect(summary?.title).toBe("Review required");
    expect(summary?.contentAvailability).toBe("withheld");
    const engagement=await readEngagement(prepared.admin,prepared.engagementId);
    expect(engagement.title).toBe("Review required");
    expect(engagement.milestones).toBeNull();
    expect(engagement.workPackages).toBeNull();
    expect((await runPlanCleanupTick()).jobs).toBe(1);
    expect((await readPlan(prepared.admin,prepared.created.planId)).contentAvailability)
      .toBe("purged");
  },90_000);
});
