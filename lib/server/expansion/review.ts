import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { HttpFailure, hiddenRecord } from '../../contracts/http';
import { getServerConfig } from '../config';
import { expansionTransaction } from './service';
import { lockExpansionActor, expansionAssignment, requireExpansionReviewer, requireExpansionEnvironment, type ExpansionActor } from './policy';
import { expansionCommandSchema, expansionPreviewSchema } from './schema';
import { expansionHash, lockExpansionCommandKey, expansionReceipt, saveExpansionReceipt, admitExpansionCommand, admitExpansionRequest } from './commands';
import { expansionScope, incrementExpansionScope } from './repository';
import { readExpansionRevision } from './projection';
import { expansionQualificationChecks } from './sources';
import { expansionAllowedDecisions } from '../../expansion/decisions';
export { expansionAllowedDecisions } from '../../expansion/decisions';
async function reviewMembers(db:PoolClient,actor:ExpansionActor,customerId:string,recordId:string,revisionId:string){
 const row=(await db.query(`SELECT p.content->'content'->'nextStep'->'owner' AS responsible,
  jsonb_path_query_array(p.content,'$.content.prerequisites[*].ownerMembershipId') AS owners
  FROM expansion_payloads p JOIN expansion_revisions r ON r.id=p.revision_id JOIN expansion_hypotheses h ON h.id=r.record_id
  WHERE h.id=$1 AND r.id=$2 AND h.environment_id=$3 AND h.workspace_id=$4 AND h.customer_id=$5`,
  [recordId,revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rows[0];
 return [...new Set([...(row?.owners??[]),...(row?.responsible?.kind==='membership'?[row.responsible.membershipId]:[])])].sort() as string[];
}
async function target(db: PoolClient, actor: ExpansionActor, customerId: string, workloadId: string | null, recordId: string, revisionId: string) {
 const row = (await db.query(`SELECT h.*,r.content_digest,r.source_digest FROM expansion_hypotheses h JOIN expansion_scopes s ON s.id=h.scope_id
  JOIN expansion_revisions r ON r.record_id=h.id AND r.id=$2 WHERE h.id=$1 AND h.environment_id=$3 AND h.workspace_id=$4
  AND h.customer_id=$5 AND s.workload_id IS NOT DISTINCT FROM $6::uuid`,[recordId,revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,workloadId])).rows[0];
 if(!row) throw hiddenRecord();if(row.working_revision_id!==revisionId)throw new HttpFailure(409,'revision_changed','Review the current working revision');return row;
}
async function state(db:PoolClient,actor:ExpansionActor,customerId:string,input:ReturnType<typeof expansionPreviewSchema.parse>,lock:boolean){
 const row=await target(db,actor,customerId,input.workloadId,input.recordId,input.revisionId);
 const revision=await readExpansionRevision(db,actor,customerId,input.workloadId,input.revisionId,lock,true);
 const checks=revision.payload?await expansionQualificationChecks(db,actor,customerId,input.workloadId,revision.payload.content,revision.payload.sourceRefs):{missing:['Fresh eligible content and evidence required'],knownUseIds:[]};
 const assignment=await expansionAssignment(db,actor,customerId,lock);requireExpansionReviewer(actor,assignment);
 const scope=await expansionScope(db,actor,customerId,input.workloadId,{lock});if(!scope)throw hiddenRecord();
 const exact=await target(db,actor,customerId,input.workloadId,input.recordId,input.revisionId);
 if(Number(exact.version)!==Number(row.version))throw new HttpFailure(409,'revision_changed','Hypothesis changed during review');
 const related=(await db.query('SELECT id,version,disposition FROM expansion_hypotheses WHERE scope_id=$1 AND duplicate_key=$2 ORDER BY id',[scope.id,row.duplicate_key])).rows;
 return {row,revision,assignment,scope,checks,digest:expansionHash({recordId:row.id,revisionId:input.revisionId,version:Number(row.version),contentDigest:row.content_digest,
  sourceDigest:row.source_digest,availability:revision.availability,assignment,scopeGeneration:scope.generation,related,checks,kind:input.kind})};
}
export async function createExpansionPreview(actor:ExpansionActor,customerId:string,raw:unknown){
 const input=expansionPreviewSchema.parse(raw);await admitExpansionRequest(actor,customerId,'write');return expansionTransaction(async db=>{
  const members=await reviewMembers(db,actor,customerId,input.recordId,input.revisionId);
  await lockExpansionActor(db,actor,customerId,members,false);requireExpansionReviewer(actor,await expansionAssignment(db,actor,customerId));await requireExpansionEnvironment(db,true);
  const current=await state(db,actor,customerId,input,true),digest=expansionHash({state:current.digest,nonce:randomUUID()}),expiresAt=new Date(Date.now()+300000);
  await db.query(`INSERT INTO expansion_review_previews(digest,environment_id,workspace_id,customer_id,actor_membership_id,record_id,revision_id,kind,state_digest,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[digest,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,input.recordId,input.revisionId,input.kind,current.digest,expiresAt]);
  return {previewDigest:digest,expectedVersion:Number(current.row.version),expectedAssignmentVersion:current.assignment.version,expiresAt:expiresAt.toISOString(),
   kind:input.kind,availability:current.revision.availability,content:input.kind==='full'?current.revision.payload?.content??null:null,
   allowedActions:expansionAllowedDecisions(current.row.disposition),qualificationChecks:current.checks.missing};
 });
}
export async function decideExpansionHypothesis(actor:ExpansionActor,customerId:string,raw:unknown){
 const command=expansionCommandSchema.parse(raw);if(command.operation!=='decide_hypothesis')throw new HttpFailure(422,'unsupported_action','Exact expansion decision required');
 await admitExpansionCommand(actor,customerId,command.requestKey,expansionHash({customerId,command}));
 return expansionTransaction(async db=>{
  const members=await reviewMembers(db,actor,customerId,command.recordId,command.revisionId);
  await lockExpansionActor(db,actor,customerId,members,false);await lockExpansionCommandKey(db,actor,command.requestKey);
  const digest=expansionHash({customerId,command}),prior=await expansionReceipt(db,actor,customerId,command.requestKey,digest);if(prior)return prior;
  requireExpansionReviewer(actor,await expansionAssignment(db,actor,customerId));await requireExpansionEnvironment(db,true);
  const preview=(await db.query(`SELECT * FROM expansion_review_previews WHERE digest=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND actor_membership_id=$5 AND expires_at>now()`,
   [command.previewDigest,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId])).rows[0];
  if(!preview||preview.record_id!==command.recordId||preview.revision_id!==command.revisionId)throw new HttpFailure(409,'preview_changed','Refresh the exact decision preview');
  const current=await state(db,actor,customerId,{workloadId:command.workloadId,recordId:command.recordId,revisionId:command.revisionId,kind:preview.kind},true);
  if(current.digest!==preview.state_digest||Number(current.row.version)!==command.expectedVersion||current.assignment.version!==command.expectedAssignmentVersion)throw new HttpFailure(409,'preview_changed','Review inputs or account owner changed');
  if(!expansionAllowedDecisions(current.row.disposition).some(action=>action===command.decision))throw new HttpFailure(409,'invalid_transition','Explicit reopening is required before qualification');
  if(command.decision==='qualify'&&(preview.kind!=='full'||current.revision.availability!=='eligible'||current.checks.missing.length))throw new HttpFailure(409,'qualification_incomplete',current.checks.missing.join('; ')||'Full eligible review required');
  if(command.decision==='defer'){
   const today=new Date().toISOString().slice(0,10),max=new Date(Date.now()+366*86400000).toISOString().slice(0,10);
   if(!command.revisitDate||command.revisitDate<=today||command.revisitDate>max)throw new HttpFailure(422,'invalid_date','Defer requires a future revisit date within 366 days');
  }else if(command.revisitDate)throw new HttpFailure(422,'invalid_date','Revisit date belongs to a defer decision');
  const decisionId=randomUUID(),outcome=command.decision==='qualify'?'qualified':command.decision==='reopen'?'proposed':command.decision==='defer'?'deferred':'dismissed';
  await db.query(`INSERT INTO expansion_decisions(id,record_id,revision_id,reviewer_membership_id,assignment_version,action,rationale_digest,preview_digest,revisit_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
   [decisionId,command.recordId,command.revisionId,actor.membershipId,current.assignment.version,command.decision,expansionHash(command.rationale),command.previewDigest,command.revisitDate??null]);
  await db.query(`INSERT INTO expansion_payloads(id,decision_id,content,purge_at) VALUES($1,$2,$3,now()+interval '365 days')`,[randomUUID(),decisionId,{rationale:command.rationale,revisitDate:command.revisitDate??null}]);
  if(current.revision.availability!=='eligible')await db.query('SELECT turas_expansion_invalidate_revision($1,$2)',[getServerConfig().TURAS_ENVIRONMENT_ID,command.revisionId]);
  const updated=(await db.query(`UPDATE expansion_hypotheses SET disposition=$2,decided_revision_id=$3,last_decision_id=$4,version=version+1 WHERE id=$1 RETURNING version`,[command.recordId,outcome,command.revisionId,decisionId])).rows[0];
  await incrementExpansionScope(db,current.scope.id);
  return saveExpansionReceipt(db,actor,customerId,command.requestKey,digest,{operation:command.operation,recordId:command.recordId,revisionId:command.revisionId,decisionId,outcome,version:Number(updated.version)});
 });
}
