import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z,ZodError } from "zod";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { buildStoredPlanContent,
  type PlanDraftContent } from "../../contracts/plan-content";
import { planCreateSchema,planSaveRevisionSchema,planSubmitSchema,planSha256,
  type PlanCreateInput,type PlanSaveRevisionInput,type PlanSubmitInput } from "../../contracts/plans";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import type { PlanActor,PlanScope } from "./policy";
import { lockPlanActor,requireActivePlanWorkload,requireCreateAudience,
  requirePlanCapability } from "./policy";
import { loadPlan,latestPlanRevision } from "./repository";
import { persistPlanSources,verifyPlanSources,currentPlanSourceDigest } from "./sources";
import { planSubmitReadiness } from "./validation";
import { recordPlanMetric } from "./telemetry";

const createSchema = z.object({...planCreateSchema.shape,action:z.literal("create")}).strict();
const saveSchema = z.object({...planSaveRevisionSchema.shape,action:z.literal("save"),
  planId:z.uuid()}).strict();
const submitSchema = z.object({...planSubmitSchema.shape,action:z.literal("submit"),
  planId:z.uuid()}).strict();
type Command = z.infer<typeof createSchema>|z.infer<typeof saveSchema>|z.infer<typeof submitSchema>;
export type PlanCommandResult = {planId:string;revisionId:string;
  aggregateVersion:number;contentDigest:string;reviewState:"draft"|"in_review"};

function parseCommand(raw:unknown):Command {
  try { return z.discriminatedUnion("action",[createSchema,saveSchema,submitSchema]).parse(raw); }
  catch (error) {
    if (error instanceof ZodError) throw new HttpFailure(422,"invalid_plan_command",
      "Invalid delivery plan command");
    throw error;
  }
}

async function priorReceipt(client:PoolClient,actor:PlanActor,command:Command,
  requestDigest:string):Promise<PlanCommandResult|null> {
  const prior = await client.query<{request_digest:string;result_ids:PlanCommandResult}>(
    `SELECT request_digest,result_ids FROM plan_command_receipts
      WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3
        AND request_key=$4`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,
      command.requestKey]);
  const row = prior.rows[0];
  if (!row) return null;
  if (row.request_digest !== requestDigest) throw new HttpFailure(409,"request_key_conflict",
    "Request key already used");
  return row.result_ids;
}

async function saveReceipt(client:PoolClient,actor:PlanActor,command:Command,
  requestDigest:string,result:PlanCommandResult):Promise<void> {
  await client.query(`INSERT INTO plan_command_receipts
    (id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,
     action,request_digest,plan_id,result_ids,result_version,outcome_code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed')`,
  [randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,
    command.action === "create" ? command.customerId : (await loadPlan(client,actor,command.planId)).customer_id,
    actor.membershipId,command.requestKey,command.action,requestDigest,result.planId,
    JSON.stringify(result),result.aggregateVersion]);
  recordPlanMetric("transition_count",1);
}

async function appendDraft(client:PoolClient,actor:PlanActor,plan:PlanScope,
  content:PlanDraftContent,revisionNumber:number,parentRevisionId:string|null,
  baseAcceptedRevisionId:string|null,changeReason:string|null,operationId:string) {
  const sourceStateDigest = await verifyPlanSources(client,actor,plan.customer_id,
    plan.workload_id,plan.audience,content.sourceDependencies,true);
  const body = buildStoredPlanContent(content);
  const bodyJson = JSON.stringify(body);
  if (new TextEncoder().encode(bodyJson).length > 131_072) {
    throw new HttpFailure(413,"plan_content_too_large","Delivery plan is too large");
  }
  const revisionId = randomUUID();
  const contentDigest = planSha256(body);
  await client.query(`INSERT INTO plan_revisions
    (id,plan_id,environment_id,workspace_id,customer_id,revision_number,
     parent_revision_id,base_accepted_revision_id,author_membership_id,
     template_version,content_schema_version,content_digest,context_digest,
     evidence_quality_version,as_of,origin)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'delivery-plan-v1','plan-content-v1',
      $10,$11,'evidence-quality-v1',$12,'manual')`,
  [revisionId,plan.id,plan.environment_id,plan.workspace_id,plan.customer_id,
    revisionNumber,parentRevisionId,baseAcceptedRevisionId,actor.membershipId,
    contentDigest,sourceStateDigest,content.asOf]);
  await client.query(`INSERT INTO plan_revision_payloads
    (revision_id,title,content,change_reason) VALUES($1,$2,$3,$4)`,
  [revisionId,content.title,bodyJson,changeReason]);
  await persistPlanSources(client,revisionId,content.sourceDependencies);
  await client.query(`INSERT INTO plan_revision_events
    (id,plan_id,revision_id,state,actor_membership_id,operation_id)
    VALUES($1,$2,$3,'draft',$4,$5)`,
  [randomUUID(),plan.id,revisionId,actor.membershipId,operationId]);
  return {revisionId,contentDigest};
}

async function createPlan(client:PoolClient,actor:PlanActor,
  command:PlanCreateInput,requestDigest:string):Promise<PlanCommandResult> {
  await lockPlanActor(client,actor,command.customerId,true,command.ownerMembershipId);
  requireCreateAudience(actor,command.audience);
  if (command.workspaceId !== actor.workspaceId ||
      (actor.kind === "partner" && command.ownerMembershipId !== actor.membershipId)) {
    throw hiddenRecord();
  }
  await requireActivePlanWorkload(client,actor,command.customerId,command.workloadId);
  const replay = await priorReceipt(client,actor,{...command,action:"create"},requestDigest);
  if (replay) return replay;
  const planId = randomUUID();
  const plan:PlanScope = {id:planId,environment_id:getServerConfig().TURAS_ENVIRONMENT_ID,
    workspace_id:actor.workspaceId,customer_id:command.customerId,
    workload_id:command.workloadId,audience:command.audience,
    owner_membership_id:command.ownerMembershipId,
    created_by_membership_id:actor.membershipId,aggregate_version:"1",
    working_revision_id:null,accepted_revision_id:null,engagement_id:null};
  await client.query(`INSERT INTO delivery_plans
    (id,environment_id,workspace_id,customer_id,workload_id,audience,
     owner_membership_id,created_by_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
  [plan.id,plan.environment_id,plan.workspace_id,plan.customer_id,plan.workload_id,
    plan.audience,plan.owner_membership_id,plan.created_by_membership_id]);
  const written = await appendDraft(client,actor,plan,command.content,1,null,null,null,randomUUID());
  await client.query("UPDATE delivery_plans SET working_revision_id=$2 WHERE id=$1",
    [plan.id,written.revisionId]);
  const result:PlanCommandResult = {planId,revisionId:written.revisionId,
    aggregateVersion:1,contentDigest:written.contentDigest,reviewState:"draft"};
  await saveReceipt(client,actor,{...command,action:"create"},requestDigest,result);
  return result;
}

async function savePlan(client:PoolClient,actor:PlanActor,
  command:PlanSaveRevisionInput & {planId:string},requestDigest:string):Promise<PlanCommandResult> {
  const plan = await loadPlan(client,actor,command.planId);
  await lockPlanActor(client,actor,plan.customer_id,true);
  requirePlanCapability(actor,plan,"revise");
  await requireActivePlanWorkload(client,actor,plan.customer_id,plan.workload_id);
  const replay = await priorReceipt(client,actor,{...command,action:"save"},requestDigest);
  if (replay) return replay;
  const locked = await loadPlan(client,actor,plan.id,true);
  if (Number(locked.aggregate_version) !== command.expectedAggregateVersion ||
      locked.working_revision_id !== command.parentRevisionId ||
      locked.accepted_revision_id !== command.baseAcceptedRevisionId) {
    throw new HttpFailure(409,"stale_plan","Plan changed; reload before saving");
  }
  if (actor.kind === "partner") {
    const head = await latestPlanRevision(client,plan.id,command.parentRevisionId);
    if (head.author_membership_id !== actor.membershipId) throw hiddenRecord();
  }
  const parent = await latestPlanRevision(client,plan.id,command.parentRevisionId);
  const written = await appendDraft(client,actor,locked,command.content,
    Number(parent.revision_number)+1,command.parentRevisionId,
    command.baseAcceptedRevisionId,command.changeReason,randomUUID());
  const version = Number(locked.aggregate_version)+1;
  await client.query(`UPDATE delivery_plans SET working_revision_id=$2,
    aggregate_version=$3,updated_at=now() WHERE id=$1`,
  [plan.id,written.revisionId,version]);
  const result:PlanCommandResult = {planId:plan.id,revisionId:written.revisionId,
    aggregateVersion:version,contentDigest:written.contentDigest,reviewState:"draft"};
  await saveReceipt(client,actor,{...command,action:"save"},requestDigest,result);
  return result;
}

async function submitPlan(client:PoolClient,actor:PlanActor,
  command:PlanSubmitInput & {planId:string},requestDigest:string):Promise<PlanCommandResult> {
  const plan = await loadPlan(client,actor,command.planId);
  await lockPlanActor(client,actor,plan.customer_id,true);
  requirePlanCapability(actor,plan,"submit");
  const replay = await priorReceipt(client,actor,{...command,action:"submit"},requestDigest);
  if (replay) return replay;
  const locked = await loadPlan(client,actor,plan.id,true);
  if (Number(locked.aggregate_version) !== command.expectedAggregateVersion ||
      locked.working_revision_id !== command.revisionId) {
    throw new HttpFailure(409,"stale_plan","Plan changed; reload before submitting");
  }
  const revision = await latestPlanRevision(client,plan.id,command.revisionId);
  if (revision.content_digest !== command.contentDigest) {
    throw new HttpFailure(409,"stale_plan","Plan changed; reload before submitting");
  }
  const state=await client.query<{state:string}>(`SELECT state FROM plan_revision_events
    WHERE revision_id=$1 ORDER BY event_order DESC LIMIT 1`,[revision.id]);
  if (state.rows[0]?.state!=="draft") {
    throw new HttpFailure(409,"stale_review","Only the current draft can be submitted");
  }
  const body = await client.query<{content:unknown}>(
    "SELECT content FROM plan_revision_payloads WHERE revision_id=$1",[revision.id]);
  if (!body.rows[0]) throw new HttpFailure(409,"plan_purged","Plan content unavailable");
  const editable = body.rows[0].content as {sections?:unknown[]};
  const input = {...editable,sections:editable.sections?.filter((section) =>
    typeof section === "object" && section !== null &&
    !["evidence","decision"].includes((section as {key?:string}).key ?? ""))};
  const issues = planSubmitReadiness(input).issues;
  if (issues.length) throw new HttpFailure(422,"plan_incomplete",
    `Plan needs review: ${issues[0].path}`);
  await currentPlanSourceDigest(client,actor,revision.id,plan.customer_id,
    plan.workload_id,plan.audience);
  const eventId = randomUUID();
  await client.query(`INSERT INTO plan_revision_events
    (id,plan_id,revision_id,state,actor_membership_id,operation_id)
    VALUES($1,$2,$3,'in_review',$4,$5)`,
  [eventId,plan.id,revision.id,actor.membershipId,randomUUID()]);
  const version = Number(locked.aggregate_version)+1;
  await client.query(`UPDATE delivery_plans SET aggregate_version=$2,updated_at=now()
    WHERE id=$1`,[plan.id,version]);
  const result:PlanCommandResult = {planId:plan.id,revisionId:revision.id,
    aggregateVersion:version,contentDigest:revision.content_digest,
    reviewState:"in_review"};
  await saveReceipt(client,actor,{...command,action:"submit"},requestDigest,result);
  return result;
}

export async function submitPlanCommand(actor:PlanActor,raw:unknown,
  existingClient?:PoolClient):Promise<PlanCommandResult> {
  const command = parseCommand(raw);
  const requestDigest = planSha256(command);
  const run = async (client:PoolClient) => {
    if (command.action === "create") return createPlan(client,actor,command,requestDigest);
    if (command.action === "save") return savePlan(client,actor,command,requestDigest);
    return submitPlan(client,actor,command,requestDigest);
  };
  if (!existingClient) {
    try {return await withTransaction(run);}
    catch(error) {
      if(error instanceof HttpFailure && error.status===409)
        recordPlanMetric("conflict_count",1);
      throw error;
    }
  }
  await existingClient.query("SAVEPOINT turas_plan_command");
  try {
    const result = await run(existingClient);
    await existingClient.query("RELEASE SAVEPOINT turas_plan_command");
    return result;
  } catch (error) {
    await existingClient.query("ROLLBACK TO SAVEPOINT turas_plan_command");
    await existingClient.query("RELEASE SAVEPOINT turas_plan_command");
    if(error instanceof HttpFailure && error.status===409)
      recordPlanMetric("conflict_count",1);
    throw error;
  }
}

export async function readPlanCommandReceipt(actor:PlanActor,requestKey:string,
  customerId:string,client:PoolClient):Promise<PlanCommandResult> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey) || !z.uuid().safeParse(customerId).success) {
    throw hiddenRecord();
  }
  await lockPlanActor(client,actor,customerId,false);
  const receipt=await client.query<{plan_id:string;action:string;
    result_ids:PlanCommandResult}>(`SELECT plan_id,action,result_ids
    FROM plan_command_receipts WHERE environment_id=$1 AND workspace_id=$2
      AND customer_id=$3 AND actor_membership_id=$4 AND request_key=$5`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,
    actor.membershipId,requestKey]);
  const row=receipt.rows[0];
  if (!row) throw hiddenRecord();
  const plan=await loadPlan(client,actor,row.plan_id);
  requirePlanCapability(actor,plan,row.action==="submit" ? "submit":
    row.action==="review_preview" || row.action.startsWith("decision_") ? "review":"revise");
  return row.result_ids;
}
