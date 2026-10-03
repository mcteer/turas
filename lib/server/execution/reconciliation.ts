import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import {requireExecutionCapability,type ExecutionActor} from "./policy";
import type {ExecutionCommand} from "./schema";
import type {ReconciliationItem} from "./change-schema";
import {executionBaseline,verifyBaseline,lockExecutionHead,bindExecutionBaseline,advanceExecution} from "./baselines";
import {lockExecutionOriginalSources} from "./sources";
import {executionDigest} from "./commands";
import {assertExecutionPreview} from "./previews";
type Reconcile=Extract<ExecutionCommand,{action:"baseline.reconcile"}>;
type Item={kind:"work_package"|"milestone";key:string};
export function validateReconciliation(items:ReconciliationItem[],oldItems:Item[],newItems:Item[]){
  const old=new Set(oldItems.map(i=>`${i.kind}/${i.key}`)),next=new Set(newItems.map(i=>`${i.kind}/${i.key}`));
  const oldSeen=new Set<string>(),newSeen=new Set<string>();
  const invalid=()=>new HttpFailure(422,"approval_blocked","Map every old and new item exactly once, or explicitly retire or add it");
  for(const item of items){
    if(!(item.disposition==="mapped"&&item.oldKey!==null&&item.newKey!==null || item.disposition==="retired"&&item.oldKey!==null&&item.newKey===null ||
      item.disposition==="added"&&item.oldKey===null&&item.newKey!==null))throw invalid();
    if(item.oldKey!==null){const key=`${item.kind}/${item.oldKey}`;if(!old.has(key)||oldSeen.has(key))throw invalid();oldSeen.add(key);}
    if(item.newKey!==null){const key=`${item.kind}/${item.newKey}`;if(!next.has(key)||newSeen.has(key))throw invalid();newSeen.add(key);}
  }
  if(oldSeen.size!==old.size||newSeen.size!==next.size)throw invalid();
}
export async function reconciliationInputs(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,
  command:Pick<Reconcile,"action"|"expectedVersions"|"payload">){
  requireExecutionCapability(actor,"review");
  let old=await executionBaseline(db,actor,customerId,engagementId,command.payload.oldBaselineId),next=await executionBaseline(db,actor,customerId,engagementId,command.payload.newBaselineId);
  await db.query("SELECT id FROM delivery_plans WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[...new Set([old.plan_id,next.plan_id])].sort()]);
  old=await executionBaseline(db,actor,customerId,engagementId,old.id);next=await executionBaseline(db,actor,customerId,engagementId,next.id);
  if(next.active_baseline_id!==next.id||next.accepted_revision_id!==next.revision_id||Number(old.baseline_number)!==command.expectedVersions.oldBaseline||
    Number(next.baseline_number)!==command.expectedVersions.newBaseline||Number(next.aggregate_version)!==command.expectedVersions.plan||Number(next.baseline_number)<=Number(old.baseline_number))
    throw new HttpFailure(409,"stale_version","Accepted replacement changed; refresh exact baselines");
  await lockExecutionOriginalSources(db,actor,customerId,engagementId,[{kind:"milestone_baseline",sourceRevisionId:old.id},{kind:"milestone_baseline",sourceRevisionId:next.id}]);
  await db.query("SELECT id FROM engagements WHERE id=$1 FOR UPDATE",[engagementId]);
  await verifyBaseline(db,actor,customerId,next);
  let oldEligible=true;
  try{await verifyBaseline(db,actor,customerId,old);}catch(error){if(!(error instanceof HttpFailure)||![403,404,409].includes(error.status))throw error;oldEligible=false;}
  const execution=await lockExecutionHead(db,actor,engagementId,command.expectedVersions.execution);
  if(execution.current_baseline_id!==old.id)throw new HttpFailure(409,"stale_version","The bound execution baseline changed");
  const oldItems=(await db.query<{item_kind:Item["kind"];item_key:string}>("SELECT item_kind,item_key FROM execution_baseline_items WHERE baseline_id=$1 ORDER BY item_kind,item_key",[old.id])).rows.map(r=>({kind:r.item_kind,key:r.item_key}));
  const payload=(await db.query<{content:{workPackages:{key:string}[];milestones:{key:string}[]}}>("SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1 FOR SHARE",[next.id])).rows[0];
  if(!payload)throw new HttpFailure(409,"source_changed","Replacement content unavailable");
  const newItems:Item[]=[...payload.content.workPackages.map(w=>({kind:"work_package" as const,key:w.key})),...payload.content.milestones.map(m=>({kind:"milestone" as const,key:m.key}))];
  validateReconciliation(command.payload.items,oldItems,newItems);
  return {execution,old,next,inputs:{action:command.action,payload:command.payload,expectedVersions:command.expectedVersions,
    generation:Number(execution.generation),oldDigest:old.content_digest,newDigest:next.content_digest,oldEligible,oldItems,newItems}};
}
export async function reconcileBaseline(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:Reconcile){
  const context=await reconciliationInputs(db,actor,customerId,engagementId,command);assertExecutionPreview(actor,context.inputs,command);
  const id=randomUUID();
  await bindExecutionBaseline(db,actor,customerId,engagementId,context.execution.id,context.next);
  await db.query(`INSERT INTO execution_reconciliations(id,environment_id,workspace_id,customer_id,engagement_id,old_baseline_id,new_baseline_id,
    request_key,actor_membership_id,preview_digest,rationale_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,context.old.id,context.next.id,command.requestKey,actor.membershipId,command.previewDigest,executionDigest(command.rationale)]);
  await db.query("INSERT INTO execution_reconciliation_payloads(reconciliation_id,rationale) VALUES($1,$2)",[id,command.rationale]);
  for(const item of command.payload.items)await db.query(`INSERT INTO execution_reconciliation_items(id,environment_id,workspace_id,customer_id,engagement_id,
    reconciliation_id,item_kind,old_key,new_key,disposition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,id,item.kind,item.oldKey,item.newKey,item.disposition]);
  await db.query("UPDATE execution_workspaces SET current_baseline_id=$2 WHERE id=$1",[context.execution.id,context.next.id]);
  // Existing quantities keep original identities. Newly bound milestone heads start
  // unaccepted; old effort estimates retain their baseline and cannot become current.
  const changed=await advanceExecution(db,context.execution,true);
  return {state:"committed" as const,executionGeneration:changed.generation,changed:[{id:context.execution.id,version:changed.version}]};
}
/** Follow immutable reviewed links; neither historical quantities nor keys change. */
export async function mapExecutionItem(db:PoolClient,actor:ExecutionActor,engagementId:string,from:string,to:string,kind:Item["kind"],key:string){
  const seen=new Set<string>();let baseline=from,currentKey=key;
  while(baseline!==to){
    if(seen.has(baseline)||seen.size>=1000)throw new HttpFailure(422,"scope_too_large","Narrow the baseline history");seen.add(baseline);
    const row=(await db.query<{new_baseline_id:string;new_key:string|null;disposition:string}>(`SELECT r.new_baseline_id,i.new_key,i.disposition FROM execution_reconciliations r
      JOIN execution_reconciliation_items i ON i.reconciliation_id=r.id WHERE r.engagement_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3
      AND r.old_baseline_id=$4 AND i.item_kind=$5 AND i.old_key=$6`,[engagementId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,baseline,kind,currentKey])).rows[0];
    if(!row)return {state:"unmapped" as const,key:null};
    if(row.disposition==="retired")return {state:"retired" as const,key:null};
    if(!row.new_key)throw hiddenRecord();baseline=row.new_baseline_id;currentKey=row.new_key;
  }
  return {state:from===to?"current" as const:"mapped" as const,key:currentKey};
}
