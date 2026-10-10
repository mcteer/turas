import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { learningId,learningDraftSaveSchema,learningDraftOutputSchema,type LearningDraftOutput } from '../../contracts/learning';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { createKnowledgeCandidate,reviseKnowledgeCandidate } from '../knowledge/service';
import { learningCommand,learningRead } from './commands';
import { authorizeLearningDraftReceipt } from './advisory';
import { learningHash,expectLearningVersion } from './repository';

async function retainedDraft(db:PoolClient,actor:CurrentSession,id:string):Promise<{id:string;customer_id:string;version:string;output_digest:string;state:string;output:LearningDraftOutput}>{
 await authorizeLearningDraftReceipt(db,actor,id);
 const row=(await db.query(`SELECT a.*,p.content,p.content_digest FROM learning_attempts a JOIN learning_attempt_payloads p ON p.attempt_id=a.id AND p.kind='output'
 WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.actor_membership_id=$4 FOR UPDATE OF a`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];
 if(!row)throw hiddenRecord();
 if(row.state!=='completed'||Number(row.model_steps)<1||Number(row.output_tokens)>8192||row.output_digest!==row.content_digest||learningHash(row.content)!==row.content_digest)throw new HttpFailure(409,'draft_unavailable','A completed confirmed draft is required');
 if(!(await db.query('SELECT 1 FROM learning_model_dispatches d JOIN learning_budget_reservations r ON r.id=d.reservation_id WHERE r.attempt_id=$1 LIMIT 1',[id])).rowCount)throw new HttpFailure(409,'draft_unavailable','Confirmed model dispatch required');
 const unknown=(await db.query(`SELECT 1 FROM learning_budget_reservations r WHERE r.attempt_id=$1 AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id) LIMIT 1`,[id])).rowCount;
 if(unknown)throw new HttpFailure(409,'accounting_unknown','Resolve model accounting before saving');
 const budget=(await db.query('SELECT state FROM learning_budget_accounts WHERE id=$1',[row.budget_id])).rows[0];
 if(!budget||budget.state==='blocked')throw new HttpFailure(409,'draft_unavailable','Model budget accounting is blocked');
 return {...row,output:learningDraftOutputSchema.parse(row.content)};
}
export async function readLearningDraft(actor:CurrentSession,id:string){
 learningId.parse(id);
 return learningRead(actor,undefined,async db=>{
  const draft=await retainedDraft(db,actor,id);
  return {contractVersion:'learning-v1' as const,id,version:Number(draft.version),outputDigest:draft.output_digest as string,output:draft.output};
 });
}
/** Saving creates a private 005 candidate only. Editing factual content requires
 * the ordinary candidate authoring path and newly selected accepted originals. */
export async function saveLearningDraft(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningDraftSaveSchema.parse(raw);
 const scope=await learningRead(actor,undefined,db=>retainedDraft(db,actor,id));
 return learningCommand(actor,{...input,attemptId:id},'draft.save',{customerId:scope.customer_id,authorize:async db=>{await retainedDraft(db,actor,id);}},async db=>{
  const draft=await retainedDraft(db,actor,id);expectLearningVersion(draft.version,input.expectedVersion);
  if(input.outputDigest!==draft.output_digest||learningHash(input.payload)!==learningHash(draft.output.proposal))throw new HttpFailure(409,'draft_changed','Save the exact captured proposal');
  const context=(await db.query("SELECT content FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='context'",[id])).rows[0]?.content;
  if(!context)throw hiddenRecord();
  const sourceMap=(await db.query("SELECT content FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='source_map'",[id])).rows[0]?.content;
  if(!Array.isArray(sourceMap)||draft.output.citationKeys.some((key:string)=>!sourceMap.some(s=>s.key===key)))throw new HttpFailure(409,'draft_citations_invalid','Draft citations must identify selected originals');
  if(context.input.publicationId&&!context.targetCandidate)throw hiddenRecord();
  const candidate=context.targetCandidate?await reviseKnowledgeCandidate(db,actor,context.targetCandidate.id,{idempotencyKey:id,expectedRevision:context.targetCandidate.revision,expectedDigest:context.targetCandidate.digest,payload:draft.output.proposal,lineage:context.input.lineage}):await createKnowledgeCandidate(db,actor,{idempotencyKey:id,customerId:draft.customer_id,payload:draft.output.proposal,lineage:context.input.lineage});
  return {targetId:candidate.id,version:Number(candidate.revision)};
 });
}
