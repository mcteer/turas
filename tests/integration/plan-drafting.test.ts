import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { prepareAttempt } from "../../lib/server/conversations/dispatch";
import { requestCancellation } from "../../lib/server/conversations/cancel";
import { projectNativeEventInTransaction } from "../../lib/server/conversations/projection";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createFreshPlanConversation } from "../../lib/server/plans/context";
import { cancelPlanDraft,getPlanDraft,recordPlanRead,savePlanDraft,
  reservePlanRetrievalCall,startPlanDraft } from "../../lib/server/plans/drafting";
import { admitPlanModelStep,reconcilePlanModelEvent } from "../../lib/server/plans/model-budget";
import { assertPlanConversationFence } from "../../lib/server/plans/fences";
import { loadPlan } from "../../lib/server/plans/repository";
import { createProfileTestSession } from "../fixtures/profiles";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected=process.env.DATABASE_URL;
  if (!selected || selected!==process.env.TURAS_TEST_DATABASE_URL ||
      selected!==process.env.DATABASE_URL_UNPOOLED ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 drafting tests require the owned disposable clone");
  }
}

describe("bounded plan model admission",()=>{
  it("permits a final provider step only against the exact saved head",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT plan_saved_step_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const content=syntheticPlanContent();
        content.assertions=[];content.sourceDependencies=[];
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,
          content},db);
        const plan=await loadPlan(db,admin,created.planId);
        const conversation=await createFreshPlanConversation(db,admin,plan);
        const nativeSessionId=`wrun_${randomUUID().replaceAll("-","")}`;
        await db.query(`UPDATE conversations SET eve_session_id=$2,binding_state='bound'
          WHERE id=$1`,[conversation.conversationId,nativeSessionId]);
        const messageId=randomUUID(),responseAttemptId=randomUUID(),attemptId=randomUUID();
        await db.query(`INSERT INTO submitted_messages
          (id,conversation_id,request_key,body_digest,text)
          VALUES($1,$2,$3,$4,'Synthetic final acknowledgement')`,
        [messageId,conversation.conversationId,randomUUID(),"a".repeat(64)]);
        await db.query(`INSERT INTO response_attempts
          (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
          VALUES($1,$2,$3,$4,'admitted','running')`,
        [responseAttemptId,conversation.conversationId,messageId,"a".repeat(64)]);
        await db.query(`INSERT INTO plan_drafting_attempts
          (id,environment_id,workspace_id,customer_id,plan_id,base_revision_id,
           base_aggregate_version,request_key,conversation_id,actor_membership_id,
           actor_session_id,response_attempt_id,request_digest,state,deadline_at)
          VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,'running',
            now()+interval '2 minutes')`,
        [attemptId,plan.environment_id,plan.workspace_id,plan.customer_id,
          plan.id,created.revisionId,randomUUID(),conversation.conversationId,
          admin.membershipId,admin.sessionId,responseAttemptId,"b".repeat(64)]);
        await db.query(`INSERT INTO plan_drafting_instruction_payloads
          (attempt_id,instructions) VALUES($1,'Synthetic final acknowledgement')`,[attemptId]);
        const saved=await savePlanDraft(admin,attemptId,{content,
          changeReason:"Synthetic saved proposal"},db);
        await admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
          turnId:"synthetic-final",stepIndex:0});
        await reconcilePlanModelEvent(db,responseAttemptId,"step.completed",{
          turnId:"synthetic-final",stepIndex:0,
          usage:{inputTokens:10,outputTokens:5}});
        await reconcilePlanModelEvent(db,responseAttemptId,"turn.completed",{
          turnId:"synthetic-final"});
        expect((await getPlanDraft(admin,attemptId,db)).resultRevisionId)
          .toBe(saved.revisionId);
        expect((await getPlanDraft(admin,attemptId,db)).state).toBe("saved");
        await expect(admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
          turnId:"synthetic-final",stepIndex:0}))
          .rejects.toMatchObject({code:"plan_step_uncertain"});
        await db.query(`UPDATE delivery_plans SET aggregate_version=aggregate_version+1
          WHERE id=$1`,[created.planId]);
        await expect(admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
          turnId:"synthetic-final",stepIndex:1}))
          .rejects.toMatchObject({code:"plan_draft_changed"});
        await db.query(`UPDATE delivery_plans SET aggregate_version=aggregate_version-1
          WHERE id=$1`,[created.planId]);
        await assertPlanConversationFence(db,admin,conversation.conversationId);
        await db.query(`UPDATE response_attempts SET native_turn_id='turn_cancel'
          WHERE id=$1`,[responseAttemptId]);
        await requestCancellation(admin,nativeSessionId,"turn_cancel",db);
        expect((await getPlanDraft(admin,attemptId,db)).state).toBe("saved");
        await expect(assertPlanConversationFence(db,admin,conversation.conversationId))
          .rejects.toMatchObject({status:404});
      } finally {await db.query("ROLLBACK TO SAVEPOINT plan_saved_step_fixture");}
    });
  },90_000);

  it("reserves one fresh scoped attempt and keeps cancellation ahead of model admission",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT plan_start_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const content=syntheticPlanContent();
        content.assertions=[];content.sourceDependencies=[];
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,
          content},db);
        const input={requestKey:randomUUID(),planId:created.planId,
          baseRevisionId:created.revisionId,expectedAggregateVersion:1,
          instructions:"Draft a scoped proposal from accepted evidence."};
        const first=await startPlanDraft(admin,input,db);
        expect(first.state).toBe("prepared");
        expect((await startPlanDraft(admin,input,db)).attemptId).toBe(first.attemptId);
        const bound=await db.query<{audience:string;plan_id:string}>(
          "SELECT audience,plan_id FROM planning_conversation_bindings WHERE conversation_id=$1",
          [first.conversationId]);
        expect(bound.rows[0]).toMatchObject({audience:"delivery",plan_id:created.planId});
        const nativeSessionId=`wrun_${randomUUID().replaceAll("-","")}`;
        await db.query(`UPDATE conversations SET eve_session_id=$2,binding_state='bound'
          WHERE id=$1`,[first.conversationId,nativeSessionId]);
        await db.query(`INSERT INTO maintenance_workers
          (environment_id,worker_id,last_seen_at) VALUES($1,$2,now())
          ON CONFLICT (environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,
        [process.env.TURAS_TEST_ENVIRONMENT_ID,randomUUID()]);
        await expect(prepareAttempt(admin,first.conversationId,
          nativeSessionId,input.requestKey,input.instructions,[{
            versionId:randomUUID(),runId:randomUUID(),lifecycleGeneration:1,
            ranges:[{unitId:randomUUID(),start:0,end:1}],
          }],db)).rejects.toMatchObject({code:"planning_selections_denied"});
        const prepared=await prepareAttempt(admin,first.conversationId,
          nativeSessionId,input.requestKey,input.instructions,[],db);
        expect(prepared.created).toBe(true);
        expect((await getPlanDraft(admin,first.attemptId,db)).state).toBe("running");
        expect((await prepareAttempt(admin,first.conversationId,
          nativeSessionId,input.requestKey,input.instructions,[],db)).attemptId)
          .toBe(prepared.attemptId);
        await db.query(`UPDATE response_attempts SET native_turn_id='turn_0'
          WHERE id=$1`,[prepared.attemptId]);
        await requestCancellation(admin,nativeSessionId,"turn_0",db);
        expect((await cancelPlanDraft(admin,first.attemptId,db)).state).toBe("cancelled");
        const stopping=await db.query<{response_state:string}>(
          "SELECT response_state FROM response_attempts WHERE id=$1",
          [prepared.attemptId]);
        expect(stopping.rows[0]?.response_state).toBe("stopping");
        expect((await getPlanDraft(admin,first.attemptId,db)).state).toBe("cancelled");
        await reconcilePlanModelEvent(db,prepared.attemptId,"turn.completed",{
          turnId:"synthetic-late-turn"});
        expect((await getPlanDraft(admin,first.attemptId,db)).state).toBe("cancelled");
        await expect(savePlanDraft(admin,first.attemptId,{content,
          changeReason:"Late synthetic result"},db))
          .rejects.toMatchObject({code:"draft_not_running"});
        expect((await startPlanDraft(admin,input,db)).state).toBe("cancelled");
      } finally {await db.query("ROLLBACK TO SAVEPOINT plan_start_fixture");}
    });
  },90_000);

  it("denies a seventh or replayed provider call using durable receipts",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT plan_model_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const content=syntheticPlanContent();
        content.assertions=[];content.sourceDependencies=[];
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,
          content},db);
        const plan=await loadPlan(db,admin,created.planId);
        const conversation=await createFreshPlanConversation(db,admin,plan);
        const nativeSessionId=`wrun_${randomUUID().replaceAll("-","")}`;
        await db.query(`UPDATE conversations SET eve_session_id=$2,binding_state='bound'
          WHERE id=$1`,[conversation.conversationId,nativeSessionId]);
        const messageId=randomUUID(),responseAttemptId=randomUUID(),attemptId=randomUUID();
        await db.query(`INSERT INTO submitted_messages
          (id,conversation_id,request_key,body_digest,text)
          VALUES($1,$2,$3,$4,'Synthetic bounded draft')`,
        [messageId,conversation.conversationId,randomUUID(),"a".repeat(64)]);
        await db.query(`INSERT INTO response_attempts
          (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
          VALUES($1,$2,$3,$4,'admitted','running')`,
        [responseAttemptId,conversation.conversationId,messageId,"a".repeat(64)]);
        await db.query(`INSERT INTO plan_drafting_attempts
          (id,environment_id,workspace_id,customer_id,plan_id,base_revision_id,
           base_aggregate_version,request_key,
           conversation_id,actor_membership_id,actor_session_id,response_attempt_id,
           request_digest,state,deadline_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'running',
            now()+interval '2 minutes')`,
        [attemptId,plan.environment_id,plan.workspace_id,plan.customer_id,
          plan.id,created.revisionId,1,randomUUID(),conversation.conversationId,
          admin.membershipId,admin.sessionId,responseAttemptId,"b".repeat(64)]);
        await db.query(`INSERT INTO plan_drafting_instruction_payloads
          (attempt_id,instructions) VALUES($1,'Synthetic bounded draft')`,[attemptId]);
        await db.query(`UPDATE response_attempts SET native_turn_id='synthetic-turn'
          WHERE id=$1`,[responseAttemptId]);
        const provider=vi.fn(async()=>"synthetic response");
        for (let stepIndex=0;stepIndex<6;stepIndex += 1) {
          await admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
            turnId:"synthetic-turn",stepIndex});
          await provider();
          const data={turnId:"synthetic-turn",stepIndex,
            usage:{inputTokens:300,outputTokens:20}};
          if(stepIndex===5){
            await projectNativeEventInTransaction(db,nativeSessionId,
              responseAttemptId,{type:"step.completed",data,
                meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()}});
            await projectNativeEventInTransaction(db,nativeSessionId,
              responseAttemptId,{type:"step.completed",data,
                meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()}});
          } else {
            await reconcilePlanModelEvent(db,responseAttemptId,"step.completed",data);
          }
        }
        const projectedUsage=await db.query<{output_tokens:number}>(
          "SELECT output_tokens FROM response_attempts WHERE id=$1",
          [responseAttemptId]);
        expect(projectedUsage.rows[0]?.output_tokens).toBe(20);
        await expect(admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
          turnId:"synthetic-turn",stepIndex:6}))
          .rejects.toMatchObject({code:"plan_step_budget"});
        await expect(admitPlanModelStep(db,admin,{nativeSessionId,responseAttemptId,
          turnId:"synthetic-turn",stepIndex:0}))
          .rejects.toMatchObject({code:"plan_step_uncertain"});
        expect(provider).toHaveBeenCalledTimes(6);
        const receipts=await db.query<{count:string;input_tokens:string;
          output_tokens:string}>(
          `SELECT count(*)::text AS count,
            sum(input_tokens)::text AS input_tokens,
            sum(output_tokens)::text AS output_tokens
            FROM plan_model_step_receipts WHERE attempt_id=$1
              AND provider_state='completed'`,
          [attemptId]);
        expect(receipts.rows[0].count).toBe("6");
        expect(receipts.rows[0].input_tokens).toBe("1800");
        expect(receipts.rows[0].output_tokens).toBe("120");
        await recordPlanRead(db,admin,attemptId,created.revisionId,"Exact base summary",[]);
        await recordPlanRead(db,admin,attemptId,created.revisionId,"Exact base summary",[]);
        const usage=await db.query<{context_bytes:number}>(
          "SELECT context_bytes FROM plan_drafting_attempts WHERE id=$1",[attemptId]);
        expect(usage.rows[0].context_bytes).toBe(Buffer.byteLength("Exact base summary"));
        for(let index=0;index<4;index += 1)
          await reservePlanRetrievalCall(db,admin,responseAttemptId,plan.id);
        await expect(reservePlanRetrievalCall(db,admin,responseAttemptId,plan.id))
          .rejects.toMatchObject({code:"plan_retrieval_budget"});
        const generated={content,changeReason:"Generated scoped revision for review"};
        const saved=await savePlanDraft(admin,attemptId,generated,db);
        expect(saved.aggregateVersion).toBe(2);
        expect((await savePlanDraft(admin,attemptId,generated,db)).revisionId)
          .toBe(saved.revisionId);
        expect((await cancelPlanDraft(admin,attemptId,db)).state).toBe("saved");
        const terminal={type:"turn.failed",data:{turnId:"synthetic-turn",
          code:"synthetic_lost_ack"},meta:{id:`evt_${randomUUID()}`,
          at:new Date().toISOString()}};
        await projectNativeEventInTransaction(db,nativeSessionId,responseAttemptId,terminal);
        await projectNativeEventInTransaction(db,nativeSessionId,responseAttemptId,terminal);
        const projected=await db.query<{count:string}>(`SELECT count(*)::text AS count
          FROM event_projections WHERE native_event_id=$1`,[terminal.meta.id]);
        expect(projected.rows[0]?.count).toBe("1");
        expect((await getPlanDraft(admin,attemptId,db)).resultRevisionId)
          .toBe(saved.revisionId);
        expect((await getPlanDraft(admin,attemptId,db)).state).toBe("saved");
        const counts=await db.query<{revisions:string;drafts:string}>(`
          SELECT (SELECT count(*) FROM plan_revisions WHERE plan_id=$1)::text AS revisions,
            (SELECT count(*) FROM plan_revisions WHERE drafting_attempt_id=$2)::text AS drafts`,
        [plan.id,attemptId]);
        expect(counts.rows[0]).toMatchObject({revisions:"2",drafts:"1"});
      } finally {await db.query("ROLLBACK TO SAVEPOINT plan_model_fixture");}
    });
  },90_000);
});
