import { createHash,randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { getServerConfig } from "../../lib/server/config";
import { claimDispatch,prepareAttempt } from "../../lib/server/conversations/dispatch";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import customerContextTool from "../../agent/tools/customer_context";
import searchEvidenceTool from "../../agent/tools/search_evidence";
import readDeliveryPlanTool from "../../agent/tools/read_delivery_plan";
import proposeCustomerContextTool from "../../agent/tools/propose_customer_context";
import proposeArtifactClaimTool from "../../agent/tools/propose_artifact_claim";
import proposeResearchTool from "../../agent/tools/propose_research";
import artifactContextTool from "../../agent/tools/artifact_context";
import readResearchTool from "../../agent/tools/read_research";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createFreshPlanConversation,requirePlanningConversation } from
  "../../lib/server/plans/context";
import { loadPlan } from "../../lib/server/plans/repository";
import { recordPlanSnapshotSources,startPlanDraft } from "../../lib/server/plans/drafting";
import { createProfileTestSession } from "../fixtures/profiles";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected=process.env.DATABASE_URL;
  if (!selected || selected!==process.env.TURAS_TEST_DATABASE_URL ||
      selected!==process.env.DATABASE_URL_UNPOOLED ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 context tests require the owned disposable clone");
  }
}

describe("planning audience binding",()=>{
  it("gives an internal delivery author the delivery projection from the first context",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT plan_context_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const marker=randomUUID().slice(0,8);
        async function acceptedClaim(audience:"internal"|"delivery",text:string,
          workloadId?:string) {
          const proposed=await submitProfileCommand(admin,PLAN_FIXTURE_SCOPE.customerId,{
            action:"propose_record",requestKey:randomUUID(),requestedAudience:audience,
            dataCategory:audience==="delivery" ? "delivery_context":"other_internal",
            ...(workloadId ? {workloadId}:{}),
            payload:{kind:"claim",text,sourceType:"manual"},
          },db) as {revisionId:string};
          const digest=await db.query<{content_digest:string}>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1",[proposed.revisionId]);
          await submitProfileCommand(admin,PLAN_FIXTURE_SCOPE.customerId,{
            action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,
            digest:digest.rows[0].content_digest,expectedRecordVersion:0,
            expectedAcceptedRevisionId:null,rationale:"Reviewed synthetic planning context",
          },db);
          return proposed.revisionId;
        }
        const internal=await acceptedClaim("internal",`Internal sentinel ${marker}`);
        const delivery=await acceptedClaim("delivery",`Delivery sentinel ${marker}`);
        const planContent=syntheticPlanContent();
        planContent.assertions=[];planContent.sourceDependencies=[];
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
          ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content:planContent},db);
        const plan=await loadPlan(db,admin,created.planId);
        const conversation=await createFreshPlanConversation(db,admin,plan);
        const binding=await requirePlanningConversation(db,conversation.conversationId,admin);
        expect(binding).toMatchObject({planId:created.planId,audience:"delivery",
          workloadId:null});
        const normal=await readEligibleContext(admin,PLAN_FIXTURE_SCOPE.customerId,
          {query:marker},db) as {entries:{citationId:string}[]};
        const planning=await readEligibleContext(admin,PLAN_FIXTURE_SCOPE.customerId,
          {query:marker,audience:binding.audience},db) as {entries:{citationId:string}[]};
        expect(normal.entries.map((entry)=>entry.citationId)).toContain(internal);
        expect(planning.entries.map((entry)=>entry.citationId)).toContain(delivery);
        expect(planning.entries.map((entry)=>entry.citationId)).not.toContain(internal);
        async function acceptedWorkload(label:string):Promise<string> {
          const payload={kind:"workload_details" as const,name:`${label} ${marker}`,
            purpose:"Synthetic planning scope check"};
          // A synthetic pre-reviewed delivery identity is needed here: current
          // profile commands create workload identities internal-only and correctly
          // forbid widening an accepted internal revision by correction.
          const workloadId=randomUUID(),recordId=randomUUID(),revisionId=randomUUID();
          await db.query(`INSERT INTO customer_workloads
            (id,workspace_id,customer_id,display_name)
            VALUES($1,$2,$3,$4)`,[workloadId,PLAN_FIXTURE_SCOPE.workspaceId,
              PLAN_FIXTURE_SCOPE.customerId,payload.name]);
          await db.query(`INSERT INTO profile_records
            (id,workspace_id,customer_id,workload_id,kind,canonical_key,created_by)
            VALUES($1,$2,$3,$4,'workload_details',$4::uuid::text,$5)`,
          [recordId,PLAN_FIXTURE_SCOPE.workspaceId,PLAN_FIXTURE_SCOPE.customerId,
            workloadId,admin.membershipId]);
          await db.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,
             content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,$6,$7,'manual','delivery',
              'delivery_context',$8)`,
          [revisionId,recordId,PLAN_FIXTURE_SCOPE.workspaceId,PLAN_FIXTURE_SCOPE.customerId,
            JSON.stringify(payload),JSON.stringify({rubricVersion:"evidence-quality-v1",
              R:4,D:4,C:0,reliabilityRationale:"Synthetic reviewed identity",
              directnessRationale:"Direct synthetic identity",
              corroborationRationale:"Single fixture",informationType:"account_status",
              dateBasis:"observation"}),admin.membershipId,
            createHash("sha256").update(JSON.stringify(payload)).digest("hex")]);
          await db.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic fixture review',$3)`,
          [revisionId,admin.membershipId,randomUUID()]);
          await db.query(`UPDATE profile_records SET current_accepted_revision_id=$2,
            version=1 WHERE id=$1`,[recordId,revisionId]);
          return workloadId;
        }
        const firstWorkload=await acceptedWorkload("First");
        const otherWorkload=await acceptedWorkload("Other");
        const firstFact=await acceptedClaim("delivery",`First workload ${marker}`,firstWorkload);
        const otherFact=await acceptedClaim("delivery",`Other workload ${marker}`,otherWorkload);
        const customerWide=await readEligibleContext(admin,PLAN_FIXTURE_SCOPE.customerId,
          {query:marker,audience:binding.audience,customerWideOnly:true},db) as
          {entries:{citationId:string}[]};
        const wideIds=customerWide.entries.map((entry)=>entry.citationId);
        expect(wideIds).toContain(delivery);
        expect(wideIds).not.toContain(firstFact);
        expect(wideIds).not.toContain(otherFact);
        const reserved=await startPlanDraft(admin,{requestKey:randomUUID(),
          planId:created.planId,baseRevisionId:created.revisionId,
          expectedAggregateVersion:created.aggregateVersion,
          instructions:"Synthetic customer-wide planning evidence"},db);
        await recordPlanSnapshotSources(db,admin,reserved.attemptId,
          PLAN_FIXTURE_SCOPE.customerId,null,"delivery",
          customerWide.entries as {citationId:string;type?:string}[]);
        const recorded=await db.query<{source_revision_id:string}>(`
          SELECT source_revision_id FROM plan_drafting_source_dependencies
          WHERE attempt_id=$1`,[reserved.attemptId]);
        expect(recorded.rows.map((row)=>row.source_revision_id)).toContain(delivery);
        expect(recorded.rows.map((row)=>row.source_revision_id)).not.toContain(firstFact);
        const scopedPlan=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:firstWorkload,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,
          content:planContent},db);
        const scoped=await loadPlan(db,admin,scopedPlan.planId);
        const fresh=await createFreshPlanConversation(db,admin,scoped);
        const scope=await requirePlanningConversation(db,fresh.conversationId,admin);
        expect(scope.workloadId).toBe(firstWorkload);
        const scopedContext=await readEligibleContext(admin,PLAN_FIXTURE_SCOPE.customerId,
          {query:marker,audience:scope.audience,workloadId:scope.workloadId ?? undefined},db) as
          {entries:{citationId:string}[]};
        const ids=scopedContext.entries.map((entry)=>entry.citationId);
        expect(ids).toContain(delivery);
        expect(ids).toContain(firstFact);
        expect(ids).not.toContain(otherFact);
        expect(ids).not.toContain(internal);
      } finally {await db.query("ROLLBACK TO SAVEPOINT plan_context_fixture");}
    });
  },120_000);

  it("keeps tool reads delivery scoped and blocks planning mutations",async()=>{
    requireOwnedClone();
    const marker=randomUUID().slice(0,8);
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      async function acceptedClaim(audience:"internal"|"delivery") {
        const proposed=await submitProfileCommand(admin,PLAN_FIXTURE_SCOPE.customerId,{
          action:"propose_record",requestKey:randomUUID(),requestedAudience:audience,
          dataCategory:audience==="delivery" ? "delivery_context":"other_internal",
          payload:{kind:"claim",text:`${audience} tool sentinel ${marker}`,
            sourceType:"manual"}},db) as {revisionId:string};
        const revision=await db.query<{content_digest:string}>(
          "SELECT content_digest FROM profile_revisions WHERE id=$1",[proposed.revisionId]);
        await submitProfileCommand(admin,PLAN_FIXTURE_SCOPE.customerId,{
          action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,
          digest:revision.rows[0].content_digest,expectedRecordVersion:0,
          expectedAcceptedRevisionId:null,rationale:"Reviewed synthetic tool scope"},db);
        await materializeCurrentProjection(db,"accepted_profile",proposed.revisionId,
          audience);
        return proposed.revisionId;
      }
      const internal=await acceptedClaim("internal");
      const delivery=await acceptedClaim("delivery");
      const content=syntheticPlanContent();
      content.assertions=[];content.sourceDependencies=[];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:admin.membershipId,content},db);
      const attempt=await startPlanDraft(admin,{requestKey:randomUUID(),
        planId:created.planId,baseRevisionId:created.revisionId,
        expectedAggregateVersion:created.aggregateVersion,
        instructions:"Inspect scoped evidence for a synthetic plan"},db);
      const nativeSessionId=`wrun_${randomUUID().replaceAll("-","")}`;
      await db.query(`UPDATE conversations SET eve_session_id=$2,binding_state='bound'
        WHERE id=$1`,[attempt.conversationId,nativeSessionId]);
      await db.query(`INSERT INTO maintenance_workers
        (environment_id,worker_id,last_seen_at) VALUES($1,$2,clock_timestamp())
        ON CONFLICT (environment_id,worker_id) DO UPDATE
          SET last_seen_at=clock_timestamp()`,
      [getServerConfig().TURAS_ENVIRONMENT_ID,randomUUID()]);
      const response=await prepareAttempt(admin,attempt.conversationId,
        nativeSessionId,attempt.requestKey,attempt.instructions,[],db);
      return {admin,internal,delivery,responseAttemptId:response.attemptId,
        planId:created.planId,conversationId:attempt.conversationId};
    });
    await claimDispatch(prepared.admin,prepared.conversationId,
      prepared.responseAttemptId,0);
    const ctx={session:{auth:{current:{principalId:prepared.admin.principalId,
      attributes:{turasAttemptId:prepared.responseAttemptId}}}}} as never;
    const context=await customerContextTool.execute({query:marker,page:1,limit:20},ctx) as unknown as
      {entries:{citationId:string}[]};
    expect(context.entries.map((entry)=>entry.citationId)).toContain(prepared.delivery);
    expect(context.entries.map((entry)=>entry.citationId)).not.toContain(prepared.internal);
    await expect(customerContextTool.execute({query:marker,page:1,limit:20,
      workloadId:randomUUID()},ctx)).rejects.toMatchObject({code:"context_changed"});
    const priorKey=process.env.AI_GATEWAY_API_KEY;
    try {
      delete process.env.AI_GATEWAY_API_KEY;
      const search=await searchEvidenceTool.execute({query:marker,scope:"customer",
        use:"discovery",limit:5},ctx) as unknown as
        {results:{sourceRevisionId:string}[]};
      expect(search.results.map((item)=>item.sourceRevisionId))
        .toContain(prepared.delivery);
      expect(search.results.map((item)=>item.sourceRevisionId))
        .not.toContain(prepared.internal);
      expect(JSON.stringify(search)).not.toContain(`internal tool sentinel ${marker}`);
    } finally {
      if(priorKey===undefined)delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY=priorKey;
    }
    const base=await readDeliveryPlanTool.execute({part:"complete",offset:0,
      sourceOffset:0},ctx) as {planId:string};
    expect(base.planId).toBe(prepared.planId);
    await expect(artifactContextTool.execute({sourceNumber:1},ctx))
      .rejects.toMatchObject({code:"artifact_context_absent"});
    await expect(readResearchTool.execute({runId:randomUUID()},ctx))
      .rejects.toMatchObject({status:404});
    for(const tool of [proposeCustomerContextTool,proposeArtifactClaimTool,
      proposeResearchTool]) {
      await expect((tool.execute as (input:unknown,context:unknown)=>Promise<unknown>)(
        {},ctx)).rejects.toMatchObject({code:"planning_tool_denied"});
    }
  },120_000);
});
