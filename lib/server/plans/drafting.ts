import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { buildStoredPlanContent,planDraftContentSchema } from "../../contracts/plan-content";
import { planDraftStartSchema,planLimits,planSha256,
  type PlanDraftStartInput } from "../../contracts/plans";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { withTransaction } from "../db/client";
import { assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { originalCurrent } from "../retrieval/fences";
import { createFreshPlanConversation } from "./context";
import { latestPlanRevision,loadPlan } from "./repository";
import { lockPlanActor,requireActivePlanWorkload,requirePlanCapability,
  type PlanActor } from "./policy";
import { currentPlanSourceDigest } from "./sources";
import { persistPlanSources,verifyPlanSources } from "./sources";

export type DraftingReceipt={attemptId:string;planId:string;baseRevisionId:string;
  baseAggregateVersion:number;conversationId:string;operationId:string;
  requestKey:string;
  state:string;deadlineAt:string;resultRevisionId:string|null;
  stepsAdmitted:number;retrievalCalls:number;contextBytes:number;
  safeErrorCode:string|null;instructions:string};

type AttemptRow={id:string;plan_id:string;base_revision_id:string;
  base_aggregate_version:string;conversation_id:string;state:string;deadline_at:Date;
  result_revision_id:string|null;steps_admitted:number;retrieval_calls:number;
  context_bytes:number;safe_error_code:string|null;request_digest:string;
  actor_membership_id:string;actor_session_id:string;instructions:string|null;
  request_key:string};

function receipt(row:AttemptRow,operationId:string):DraftingReceipt {
  return {attemptId:row.id,planId:row.plan_id,
    baseRevisionId:row.base_revision_id,
    baseAggregateVersion:Number(row.base_aggregate_version),
    conversationId:row.conversation_id,operationId,requestKey:row.request_key,
    state:row.state,
    deadlineAt:row.deadline_at.toISOString(),resultRevisionId:row.result_revision_id,
    stepsAdmitted:row.steps_admitted,retrievalCalls:row.retrieval_calls,
    contextBytes:row.context_bytes,safeErrorCode:row.safe_error_code,
    instructions:row.instructions ?? ""};
}

/** Reserve the scope and fresh conversation before any native session exists. */
export async function startPlanDraft(actor:PlanActor,raw:unknown,
  existingClient?:PoolClient):Promise<DraftingReceipt> {
  const parsed=planDraftStartSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422,"invalid_draft_request",
    "Invalid drafting request");
  const input:PlanDraftStartInput=parsed.data;
  const digest=planSha256(input);
  const run=async (client:PoolClient) => {
    const plan=await loadPlan(client,actor,input.planId);
    await lockPlanActor(client,actor,plan.customer_id,true);
    requirePlanCapability(actor,plan,"draft");
    await requireActivePlanWorkload(client,actor,plan.customer_id,plan.workload_id);
    const prior=await client.query<AttemptRow & {operation_id:string}>(`
      SELECT drafting.*,conversation.creation_operation_id AS operation_id,
        payload.instructions
      FROM plan_drafting_attempts drafting
      JOIN conversations conversation ON conversation.id=drafting.conversation_id
      LEFT JOIN plan_drafting_instruction_payloads payload ON payload.attempt_id=drafting.id
      WHERE drafting.actor_membership_id=$1 AND drafting.request_key=$2`,
    [actor.membershipId,input.requestKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_digest!==digest ||
          prior.rows[0].actor_session_id!==actor.sessionId) {
        throw new HttpFailure(409,"request_key_conflict","Request key already used");
      }
      return receipt(prior.rows[0],prior.rows[0].operation_id);
    }
    const locked=await loadPlan(client,actor,plan.id,true);
    await client.query(`UPDATE plan_drafting_attempts SET
      state=CASE WHEN response_attempt_id IS NULL THEN 'expired' ELSE 'unconfirmed' END,
      safe_error_code='draft_deadline',updated_at=now()
      WHERE plan_id=$1 AND state IN ('prepared','running') AND deadline_at<=now()`,
    [plan.id]);
    if (locked.working_revision_id!==input.baseRevisionId ||
        Number(locked.aggregate_version)!==input.expectedAggregateVersion) {
      throw new HttpFailure(409,"stale_plan","Plan changed; reload before drafting");
    }
    const revision=await latestPlanRevision(client,plan.id,input.baseRevisionId);
    if (actor.kind==="partner" && revision.author_membership_id!==actor.membershipId) {
      throw hiddenRecord();
    }
    const payload=await client.query(`SELECT 1 FROM plan_revision_payloads
      WHERE revision_id=$1 AND content IS NOT NULL`,[revision.id]);
    if (!payload.rowCount) throw new HttpFailure(409,"plan_purged",
      "Plan content unavailable");
    await currentPlanSourceDigest(client,actor,revision.id,plan.customer_id,
      plan.workload_id,plan.audience,true);
    const count=await client.query<{total:string}>(`SELECT count(*)::text AS total
      FROM plan_drafting_attempts WHERE actor_membership_id=$1
        AND created_at>now()-interval '1 hour'`,[actor.membershipId]);
    if (Number(count.rows[0]?.total ?? 0)>=planLimits.draftsPerHour) {
      throw new HttpFailure(429,"draft_rate_limit","Drafting limit reached",3600);
    }
    const bound=await createFreshPlanConversation(client,actor,locked);
    const attemptId=randomUUID();
    const deadline=new Date(Date.now()+planLimits.draftDeadlineMs);
    const inserted=await client.query<AttemptRow>(`INSERT INTO plan_drafting_attempts
      (id,environment_id,workspace_id,customer_id,plan_id,base_revision_id,
       base_aggregate_version,conversation_id,actor_membership_id,actor_session_id,
       request_key,request_digest,state,deadline_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'prepared',$13)
      RETURNING *`,
    [attemptId,plan.environment_id,plan.workspace_id,plan.customer_id,
      plan.id,revision.id,locked.aggregate_version,bound.conversationId,
      actor.membershipId,actor.sessionId,input.requestKey,digest,deadline]);
    await client.query(`INSERT INTO plan_drafting_instruction_payloads
      (attempt_id,instructions) VALUES($1,$2)`,[attemptId,input.instructions]);
    return receipt({...inserted.rows[0],instructions:input.instructions},bound.operationId);
  };
  return existingClient ? run(existingClient):withTransaction(run);
}

export async function getPlanDraft(actor:PlanActor,attemptId:string,
  existingClient?:PoolClient):Promise<DraftingReceipt> {
  const run=async (client:PoolClient) => {
    const found=await client.query<AttemptRow & {operation_id:string}>(`
      SELECT drafting.*,conversation.creation_operation_id AS operation_id,
        payload.instructions
      FROM plan_drafting_attempts drafting
      JOIN conversations conversation ON conversation.id=drafting.conversation_id
      LEFT JOIN plan_drafting_instruction_payloads payload ON payload.attempt_id=drafting.id
      WHERE drafting.id=$1 AND drafting.actor_membership_id=$2
        AND drafting.actor_session_id=$3`,
    [attemptId,actor.membershipId,actor.sessionId]);
    const row=found.rows[0];
    if (!row) throw hiddenRecord();
    await lockPlanActor(client,actor,(await loadPlan(client,actor,row.plan_id)).customer_id,false);
    const plan=await loadPlan(client,actor,row.plan_id);
    requirePlanCapability(actor,plan,"read");
    return receipt(row,row.operation_id);
  };
  return existingClient ? run(existingClient):withTransaction(run);
}

export async function cancelPlanDraft(actor:PlanActor,attemptId:string,
  existingClient?:PoolClient):Promise<DraftingReceipt> {
  const run=async (client:PoolClient) => {
    const planId=await client.query<{plan_id:string}>(
      "SELECT plan_id FROM plan_drafting_attempts WHERE id=$1",
      [attemptId]);
    if (!planId.rows[0]) throw hiddenRecord();
    const plan=await loadPlan(client,actor,planId.rows[0].plan_id);
    await lockPlanActor(client,actor,plan.customer_id,true);
    requirePlanCapability(actor,plan,"draft");
    const found=await client.query<AttemptRow & {operation_id:string}>(`
      SELECT drafting.*,conversation.creation_operation_id AS operation_id,
        payload.instructions
      FROM plan_drafting_attempts drafting
      JOIN conversations conversation ON conversation.id=drafting.conversation_id
      LEFT JOIN plan_drafting_instruction_payloads payload ON payload.attempt_id=drafting.id
      WHERE drafting.id=$1 FOR UPDATE OF drafting`,[attemptId]);
    const row=found.rows[0];
    if (!row || row.actor_membership_id!==actor.membershipId ||
        row.actor_session_id!==actor.sessionId) throw hiddenRecord();
    if (["prepared","running"].includes(row.state)) {
      await client.query(`UPDATE plan_drafting_attempts SET state='cancelled',
        safe_error_code='cancelled',updated_at=now() WHERE id=$1`,[attemptId]);
      row.state="cancelled";row.safe_error_code="cancelled";
    }
    return receipt(row,row.operation_id);
  };
  return existingClient ? run(existingClient):withTransaction(run);
}

const generatedDraftSchema=z.object({
  content:planDraftContentSchema,
  changeReason:z.string().trim().min(1).max(2_000),
}).strict();

export type SavedPlanDraft={attemptId:string;planId:string;revisionId:string;
  aggregateVersion:number;contentDigest:string;reviewState:"draft"};

/** The attempt, not model arguments, determines plan scope and revision authority. */
export async function savePlanDraft(actor:PlanActor,draftingAttemptId:string,raw:unknown,
  existingClient?:PoolClient):Promise<SavedPlanDraft> {
  const parsed=generatedDraftSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422,"invalid_plan_draft",
    "Invalid generated plan draft");
  const input=parsed.data;
  const body=buildStoredPlanContent(input.content);
  const bodyJson=JSON.stringify(body);
  if (Buffer.byteLength(bodyJson,"utf8")>131_072) throw new HttpFailure(413,
    "plan_content_too_large","Delivery plan is too large");
  const contentDigest=planSha256(body);
  const run=async(client:PoolClient) => {
    const selected=await client.query<{plan_id:string}>(
      "SELECT plan_id FROM plan_drafting_attempts WHERE id=$1",
      [draftingAttemptId]);
    if (!selected.rows[0]) throw hiddenRecord();
    const initial=await loadPlan(client,actor,selected.rows[0].plan_id);
    await lockPlanActor(client,actor,initial.customer_id,true,undefined,true);
    await client.query("SET LOCAL lock_timeout = '10000ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const plan=await loadPlan(client,actor,initial.id,true);
    requirePlanCapability(actor,plan,"draft");
    await requireActivePlanWorkload(client,actor,plan.customer_id,plan.workload_id);
    const found=await client.query<AttemptRow & {response_attempt_id:string|null;
      response_state:string|null;response_deadline_at:Date|null}>(`
      SELECT drafting.*,response.response_state,
        response.deadline_at AS response_deadline_at
      FROM plan_drafting_attempts drafting
      LEFT JOIN response_attempts response ON response.id=drafting.response_attempt_id
      WHERE drafting.id=$1 AND drafting.plan_id=$2 FOR UPDATE OF drafting`,
    [draftingAttemptId,plan.id]);
    const attempt=found.rows[0];
    if (!attempt || attempt.actor_membership_id!==actor.membershipId ||
        attempt.actor_session_id!==actor.sessionId) throw hiddenRecord();
    if (attempt.state==="saved" && attempt.result_revision_id) {
      const saved=await latestPlanRevision(client,plan.id,attempt.result_revision_id);
      const payload=await client.query<{change_reason:string|null}>(
        "SELECT change_reason FROM plan_revision_payloads WHERE revision_id=$1",
        [attempt.result_revision_id]);
      if (saved.content_digest!==contentDigest ||
          payload.rows[0]?.change_reason!==input.changeReason) {
        throw new HttpFailure(409,"draft_already_saved","Draft already saved");
      }
      return {attemptId:attempt.id,planId:plan.id,revisionId:saved.id,
        aggregateVersion:Number(attempt.base_aggregate_version)+1,
        contentDigest,reviewState:"draft" as const};
    }
    if (attempt.state!=="running" || !attempt.response_attempt_id ||
        !["pending","running"].includes(attempt.response_state ?? "") ||
        attempt.deadline_at.getTime()<=Date.now() ||
        (attempt.response_deadline_at &&
          attempt.response_deadline_at.getTime()<=Date.now())) {
      throw new HttpFailure(409,"draft_not_running","Draft is no longer active");
    }
    if (plan.aggregate_version!==attempt.base_aggregate_version ||
        plan.working_revision_id!==attempt.base_revision_id) {
      throw new HttpFailure(409,"stale_plan","Plan changed; reload before saving");
    }
    await currentPlanSourceDigest(client,actor,attempt.base_revision_id,
      plan.customer_id,plan.workload_id,plan.audience,true);
    await assertArtifactDependenciesCurrent(client,attempt.conversation_id);
    await assertRetrievalDependenciesCurrent(client,attempt.conversation_id);
    const sourceStateDigest=await verifyPlanSources(client,actor,plan.customer_id,
      plan.workload_id,plan.audience,input.content.sourceDependencies,true);
    const parent=await latestPlanRevision(client,plan.id,attempt.base_revision_id);
    const revisionId=randomUUID();
    await client.query(`INSERT INTO plan_revisions
      (id,plan_id,environment_id,workspace_id,customer_id,revision_number,
       parent_revision_id,base_accepted_revision_id,author_membership_id,
       template_version,content_schema_version,content_digest,context_digest,
       evidence_quality_version,as_of,origin,drafting_attempt_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'delivery-plan-v1',
        'plan-content-v1',$10,$11,'evidence-quality-v1',$12,'agent',$13)`,
    [revisionId,plan.id,plan.environment_id,plan.workspace_id,plan.customer_id,
      Number(parent.revision_number)+1,parent.id,plan.accepted_revision_id,
      actor.membershipId,contentDigest,sourceStateDigest,input.content.asOf,
      attempt.id]);
    await client.query(`INSERT INTO plan_revision_payloads
      (revision_id,title,content,change_reason) VALUES($1,$2,$3,$4)`,
    [revisionId,input.content.title,bodyJson,input.changeReason]);
    await persistPlanSources(client,revisionId,input.content.sourceDependencies,true);
    await client.query(`INSERT INTO plan_private_dependencies
      (revision_id,source_kind,source_revision_id,source_generation,source_digest)
      SELECT $2,CASE WHEN source_kind='shared_knowledge'
        THEN 'published_shared' ELSE source_kind END,
        source_revision_id,source_generation,source_digest
      FROM plan_drafting_source_dependencies WHERE attempt_id=$1
      ON CONFLICT DO NOTHING`,[attempt.id,revisionId]);
    await client.query(`INSERT INTO plan_private_dependencies
      (revision_id,source_kind,source_revision_id,source_generation,source_digest)
      SELECT $2,source_kind,source_revision_id,source_generation,source_digest
      FROM session_evidence_dependencies WHERE conversation_id=$1
      ON CONFLICT DO NOTHING`,[attempt.conversation_id,revisionId]);
    await client.query(`INSERT INTO plan_revision_events
      (id,plan_id,revision_id,state,actor_membership_id,operation_id)
      VALUES($1,$2,$3,'draft',$4,$5)`,
    [randomUUID(),plan.id,revisionId,actor.membershipId,randomUUID()]);
    const aggregateVersion=Number(plan.aggregate_version)+1;
    await client.query(`UPDATE delivery_plans SET working_revision_id=$2,
      aggregate_version=$3,updated_at=now() WHERE id=$1`,
    [plan.id,revisionId,aggregateVersion]);
    await client.query(`UPDATE plan_drafting_attempts SET state='saved',
      result_revision_id=$2,safe_error_code=NULL,updated_at=now() WHERE id=$1`,
    [attempt.id,revisionId]);
    return {attemptId:attempt.id,planId:plan.id,revisionId,
      aggregateVersion,contentDigest,reviewState:"draft" as const};
  };
  return existingClient ? run(existingClient):withTransaction(run);
}

/** Account for bytes once per exact tool result and retain every shown source. */
async function consumedOriginal(client:PoolClient,
  source:z.infer<typeof planDraftContentSchema>["sourceDependencies"][number]) {
  const kind=source.kind==="shared_knowledge" ? "published_shared":source.kind;
  const query=kind==="accepted_profile" ?
    "SELECT revision_number AS generation,content_digest AS digest FROM profile_revisions WHERE id=$1" :
    kind==="approved_excerpt" ?
    "SELECT lifecycle_generation AS generation,excerpt_digest AS digest FROM artifact_evidence_selections WHERE id=$1" :
    kind==="verified_research" ?
    "SELECT version AS generation,passage_digest AS digest FROM evidence_source_revisions WHERE id=$1" :
    `SELECT publication.head_generation AS generation,revision.content_digest AS digest
      FROM knowledge_publications publication JOIN knowledge_revisions revision
        ON revision.id=publication.revision_id WHERE publication.revision_id=$1`;
  const found=await client.query<{generation:string;digest:string}>(query,
    [source.sourceRevisionId]);
  const row=found.rows[0];
  const original={source_kind:kind,source_revision_id:source.sourceRevisionId,
    source_generation:row?.generation ?? "",source_digest:row?.digest ?? ""};
  if(!row || Number(row.generation)!==source.generation ||
      !await originalCurrent(client,original)){
    throw new HttpFailure(409,"plan_source_changed","Planning evidence changed");
  }
  return original;
}

export async function recordPlanRead(client:PoolClient,actor:PlanActor,
  draftingAttemptId:string,revisionId:string,visibleText:string,
  sourceDependencies:Readonly<z.infer<typeof planDraftContentSchema>["sourceDependencies"]>):
  Promise<void> {
  const bytes=Buffer.byteLength(visibleText,"utf8");
  if (bytes<1 || bytes>planLimits.evidenceContextBytes) {
    throw new HttpFailure(413,"plan_context_budget","Planning context limit reached");
  }
  const selected=await client.query<{plan_id:string;base_aggregate_version:string}>(
    "SELECT plan_id,base_aggregate_version FROM plan_drafting_attempts WHERE id=$1",
    [draftingAttemptId]);
  if (!selected.rows[0]) throw hiddenRecord();
  const plan=await client.query<{working_revision_id:string|null;
    aggregate_version:string}>(`SELECT working_revision_id,aggregate_version
      FROM delivery_plans WHERE id=$1 FOR SHARE`,[selected.rows[0].plan_id]);
  if (!plan.rows[0] || plan.rows[0].working_revision_id!==revisionId ||
      plan.rows[0].aggregate_version!==selected.rows[0].base_aggregate_version) {
    throw new HttpFailure(409,"stale_plan","Plan changed during drafting");
  }
  const found=await client.query<AttemptRow>(`SELECT * FROM plan_drafting_attempts
    WHERE id=$1 FOR UPDATE`,[draftingAttemptId]);
  const attempt=found.rows[0];
  if (!attempt || attempt.actor_membership_id!==actor.membershipId ||
      attempt.actor_session_id!==actor.sessionId ||
      attempt.base_revision_id!==revisionId || attempt.state!=="running" ||
      attempt.deadline_at.getTime()<=Date.now()) {
    throw new HttpFailure(409,"plan_draft_changed","Plan drafting context changed");
  }
  const digest=planSha256(visibleText);
  const inserted=await client.query(`INSERT INTO plan_drafting_context_chunks
    (attempt_id,content_digest,bytes) VALUES($1,$2,$3)
    ON CONFLICT DO NOTHING RETURNING content_digest`,
  [attempt.id,digest,bytes]);
  if (inserted.rowCount) {
    const updated=await client.query(`UPDATE plan_drafting_attempts
      SET context_bytes=context_bytes+$2,updated_at=now()
      WHERE id=$1 AND context_bytes+$2<=$3`,
    [attempt.id,bytes,planLimits.evidenceContextBytes]);
    if (!updated.rowCount) throw new HttpFailure(429,"plan_context_budget",
      "Planning context limit reached");
  }
  for (const source of sourceDependencies) {
    const original=await consumedOriginal(client,source);
    await client.query(`INSERT INTO plan_drafting_source_dependencies
      (attempt_id,source_kind,source_revision_id,source_generation,
       source_digest,consumed_bytes)
      VALUES($1,$2,$3,$4,$5,0) ON CONFLICT DO NOTHING`,
    [attempt.id,source.kind,original.source_revision_id,
      original.source_generation,original.source_digest]);
  }
  const count=await client.query<{count:string}>(
    "SELECT count(*)::text AS count FROM plan_drafting_source_dependencies WHERE attempt_id=$1",
    [attempt.id]);
  if(Number(count.rows[0]?.count ?? 0)>planLimits.sourceDependencies) {
    throw new HttpFailure(429,"plan_source_budget","Planning source limit reached");
  }
}

/** Reserve the governed search allowance before the retrieval service runs. */
export async function reservePlanRetrievalCall(client:PoolClient,actor:PlanActor,
  responseAttemptId:string,planId:string):Promise<void> {
  const found=await client.query<AttemptRow>(`SELECT * FROM plan_drafting_attempts
    WHERE response_attempt_id=$1 AND plan_id=$2 FOR UPDATE`,
  [responseAttemptId,planId]);
  const attempt=found.rows[0];
  if (!attempt || attempt.actor_membership_id!==actor.membershipId ||
      attempt.actor_session_id!==actor.sessionId || attempt.state!=="running" ||
      attempt.deadline_at.getTime()<=Date.now()) {
    throw new HttpFailure(409,"plan_draft_changed","Plan drafting context changed");
  }
  if (attempt.retrieval_calls>=planLimits.retrievalCalls) {
    throw new HttpFailure(429,"plan_retrieval_budget","Planning search limit reached");
  }
  await client.query(`UPDATE plan_drafting_attempts SET
    retrieval_calls=retrieval_calls+1,updated_at=now() WHERE id=$1`,[attempt.id]);
}

/** Capture every factual source actually injected in the planning snapshot. */
export async function recordPlanSnapshotSources(client:PoolClient,actor:PlanActor,
  draftingAttemptId:string,customerId:string,workloadId:string|null,
  audience:"internal"|"delivery",entries:readonly {citationId:string;type?:string}[]):
  Promise<void> {
  if(entries.length>planLimits.sourceDependencies) throw new HttpFailure(429,
    "plan_source_budget","Planning source limit reached");
  for(const entry of entries){
    const kind=entry.type==="accepted_manual" ? "accepted_profile":
      entry.type==="attributed_research" ? "verified_research":null;
    if(!kind) throw new HttpFailure(409,"plan_source_changed",
      "Planning evidence changed");
    const found=kind==="accepted_profile" ? await client.query<{
      source_kind:string;source_revision_id:string;source_generation:string;
      source_digest:string}>(`SELECT 'accepted_profile' AS source_kind,
        revision.id AS source_revision_id,
        revision.revision_number AS source_generation,
        revision.content_digest AS source_digest
      FROM profile_revisions revision JOIN profile_records record
        ON record.id=revision.record_id
          AND record.current_accepted_revision_id=revision.id
      WHERE revision.id=$1 AND revision.workspace_id=$2
        AND revision.customer_id=$3
        AND (record.workload_id IS NULL OR record.workload_id=$4)
        AND (revision.audience='delivery' OR $5='internal')
        AND (revision.data_category='delivery_context' OR $5='internal')
      FOR SHARE OF record`,
    [entry.citationId,actor.workspaceId,customerId,workloadId,audience]) :
      await client.query<{source_kind:string;source_revision_id:string;
        source_generation:string;source_digest:string}>(`
      SELECT 'verified_research' AS source_kind,
        revision.id AS source_revision_id,revision.version AS source_generation,
        revision.passage_digest AS source_digest
      FROM evidence_source_revisions revision JOIN evidence_sources source
        ON source.id=revision.source_id AND source.origin='independent_research'
      JOIN research_checks checks ON checks.source_revision_id=revision.id
        AND checks.identity_result AND checks.scope_result
        AND checks.integrity_result AND checks.content_result
      WHERE revision.id=$1 AND revision.workspace_id=$2
        AND revision.customer_id=$3
        AND (revision.audience='delivery' OR $4='internal')
        AND NOT EXISTS (SELECT 1 FROM evidence_source_events event
          WHERE event.source_revision_id=revision.id
            AND event.event_type IN ('withdraw','supersede'))
      FOR SHARE OF source`,
    [entry.citationId,actor.workspaceId,customerId,audience]);
    const source=found.rows[0];
    if(!source || !await originalCurrent(client,source)) {
      throw new HttpFailure(409,"plan_source_changed",
        "Planning evidence changed");
    }
    await client.query(`INSERT INTO plan_drafting_source_dependencies
      (attempt_id,source_kind,source_revision_id,source_generation,
       source_digest,consumed_bytes)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [draftingAttemptId,kind,source.source_revision_id,
      source.source_generation,source.source_digest,
      Buffer.byteLength(JSON.stringify(entry),"utf8")]);
  }
  const count=await client.query<{count:string}>(
    "SELECT count(*)::text AS count FROM plan_drafting_source_dependencies WHERE attempt_id=$1",
    [draftingAttemptId]);
  if(Number(count.rows[0]?.count ?? 0)>planLimits.sourceDependencies) {
    throw new HttpFailure(429,"plan_source_budget","Planning source limit reached");
  }
}
