import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { currentPlanSourceDigest } from "../plans/sources";
import type { ExecutionActor } from "./policy";
import type { ExecutionCommand } from "./schema";
export type ExecutionHead = { id:string; current_baseline_id:string; version:string; generation:string; state:string; closeout_revision_id:string|null };
export type Baseline = { id:string; revision_id:string; plan_id:string; baseline_number:string; content_digest:string; aggregate_version:string;
  workload_id:string|null; active_baseline_id:string; accepted_revision_id:string; audience:"internal"|"delivery" };
export async function executionBaseline(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,lock=false) {
  const row = (await db.query<Baseline>(`SELECT b.id,b.revision_id,b.plan_id,b.baseline_number,b.content_digest,p.aggregate_version,
    p.accepted_revision_id,e.workload_id,e.active_baseline_id,e.audience FROM milestone_baselines b
    JOIN engagements e ON e.id=b.engagement_id JOIN delivery_plans p ON p.id=b.plan_id
    WHERE b.id=$1 AND b.engagement_id=$2 AND b.environment_id=$3 AND b.workspace_id=$4 AND b.customer_id=$5
      AND (e.audience='delivery' OR $6='internal') ${lock ? "FOR UPDATE OF p" : ""}`,
    [baselineId,engagementId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.kind==='partner'?'delivery':'internal'])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}
export async function verifyBaseline(db:PoolClient,actor:ExecutionActor,customerId:string,baseline:Baseline,lock=false) {
  await currentPlanSourceDigest(db,actor,baseline.revision_id,customerId,baseline.workload_id,
    actor.kind==='partner'?'delivery':'internal',lock,true);
}
export async function lockExecutionHead(db:PoolClient,actor:ExecutionActor,engagementId:string,expectedVersion?:number):Promise<ExecutionHead> {
  const row=(await db.query<ExecutionHead>(`SELECT id,current_baseline_id,version,generation,state,closeout_revision_id FROM execution_workspaces
    WHERE environment_id=$1 AND workspace_id=$2 AND engagement_id=$3 FOR UPDATE`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,engagementId])).rows[0];
  if (!row) throw hiddenRecord();
  if (expectedVersion!==undefined && Number(row.version)!==expectedVersion) throw new HttpFailure(409,'stale_version','Execution changed; refresh');
  return row;
}
export async function advanceExecution(db:PoolClient,head:ExecutionHead,invalidateCloseout=false) {
  const row=(await db.query<{version:string;generation:string}>(`UPDATE execution_workspaces SET version=version+1,generation=generation+1,
    state=CASE WHEN $2 AND closeout_revision_id IS NOT NULL THEN 'review_required' ELSE state END WHERE id=$1 RETURNING version,generation`,[head.id,invalidateCloseout])).rows[0];
  return {version:Number(row.version),generation:Number(row.generation)};
}
export async function bindExecutionBaseline(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,executionId:string,baseline:Baseline) {
  const payload=(await db.query<{content:{milestones:Array<{key:string}>;workPackages:Array<{key:string}>}}>("SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1",[baseline.id])).rows[0];
  if (!payload) throw new HttpFailure(409,'source_changed','Baseline content unavailable');
  const binding=randomUUID(),env=getServerConfig().TURAS_ENVIRONMENT_ID;
  await db.query(`INSERT INTO execution_baseline_bindings(id,environment_id,workspace_id,customer_id,engagement_id,execution_id,baseline_id,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[binding,env,actor.workspaceId,customerId,engagementId,executionId,baseline.id,actor.membershipId]);
  for (const [kind,items] of [["work_package",payload.content.workPackages],["milestone",payload.content.milestones]] as const) {
    for (const item of items) {
      await db.query(`INSERT INTO execution_baseline_items(id,environment_id,workspace_id,customer_id,engagement_id,binding_id,baseline_id,item_kind,item_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),env,actor.workspaceId,customerId,engagementId,binding,baseline.id,kind,item.key]);
      if (kind==='milestone') await db.query(`INSERT INTO execution_milestone_heads(id,environment_id,workspace_id,customer_id,engagement_id,baseline_id,milestone_key)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),env,actor.workspaceId,customerId,engagementId,baseline.id,item.key]);
    }
  }
}
export async function setupExecution(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:Extract<ExecutionCommand,{action:'setup'}>) {
  const baseline=await executionBaseline(db,actor,customerId,engagementId,command.payload.baselineId,true);
  if (baseline.active_baseline_id!==baseline.id || baseline.accepted_revision_id!==baseline.revision_id ||
    Number(baseline.baseline_number)!==command.expectedVersions.baseline || Number(baseline.aggregate_version)!==command.expectedVersions.plan)
    throw new HttpFailure(409,'stale_version','Accepted baseline changed; refresh');
  await verifyBaseline(db,actor,customerId,baseline,true);
  await db.query("SELECT id FROM engagements WHERE id=$1 FOR UPDATE",[engagementId]);
  const existing=(await db.query<ExecutionHead>('SELECT * FROM execution_workspaces WHERE engagement_id=$1 FOR UPDATE',[engagementId])).rows[0];
  if (existing) {
    if (existing.current_baseline_id!==baseline.id) throw new HttpFailure(409,'source_changed','Baseline reconciliation required');
    return {state:'committed' as const,executionGeneration:Number(existing.generation),changed:[{id:existing.id,version:Number(existing.version)}]};
  }
  const id=randomUUID();
  await db.query(`INSERT INTO execution_workspaces(id,environment_id,workspace_id,customer_id,engagement_id,current_baseline_id)
    VALUES($1,$2,$3,$4,$5,$6)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,baseline.id]);
  await bindExecutionBaseline(db,actor,customerId,engagementId,id,baseline);
  return {state:'committed' as const,executionGeneration:1,changed:[{id,version:1}]};
}
