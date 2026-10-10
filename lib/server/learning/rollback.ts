import {randomUUID} from 'node:crypto';
import type {CurrentSession} from '../auth/sessions';
import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
import {learningId,learningRollbackSchema} from '../../contracts/learning';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningCommand} from './commands';
import {lockLearningPublisher} from './policy';
import {learningSourceClosure} from './sources';
import {expectLearningVersion} from './repository';
import {reviseKnowledgeCandidate} from '../knowledge/service';
import {scheduleLearningPayloadPurge} from './retention';
export async function prepareLearningRollback(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningRollbackSchema.parse(raw);
 const scope=async(db:PoolClient)=>{
  const c=(await db.query('SELECT * FROM knowledge_contributions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!c)throw hiddenRecord();await lockLearningPublisher(db,actor,c.customer_id);
  const historical=(await db.query(`SELECT r.id,r.content_digest,p.payload FROM knowledge_revisions r JOIN knowledge_revision_payloads p ON p.revision_id=r.id WHERE r.id=$1 AND r.contribution_id=$2 AND EXISTS(SELECT 1 FROM knowledge_decisions d WHERE d.revision_id=r.id AND d.contribution_id=r.contribution_id AND d.action='publish')`,[input.historicalRevisionId,id])).rows[0];if(!historical)throw hiddenRecord();
  const originals=(await db.query('SELECT source_kind,source_revision_id,source_generation,source_digest,rights_basis FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal',[historical.id])).rows.map(r=>({sourceKind:r.source_kind,sourceRevisionId:r.source_revision_id,sourceGeneration:Number(r.source_generation),sourceDigest:r.source_digest,rightsBasis:r.rights_basis}));
  await learningSourceClosure(db,actor,c.customer_id,originals);await learningSourceClosure(db,actor,c.customer_id,input.lineage);
  return {c,historical};
 };
 return learningCommand(actor,{...input,contributionId:id},'candidate.rollback',{customerId:null,authorize:async db=>{await scope(db);}},async db=>{
  const {c,historical}=await scope(db);expectLearningVersion(c.current_revision_number,input.expectedVersion);
  const current=(await db.query('SELECT id,content_digest FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[id,c.current_revision_number])).rows[0];if(!current)throw hiddenRecord();
  const draft=await reviseKnowledgeCandidate(db,actor,id,{idempotencyKey:input.requestId,expectedRevision:input.expectedVersion,expectedDigest:current.content_digest,payload:historical.payload,lineage:input.lineage});
  const revision=(await db.query('SELECT id FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[id,draft.revision])).rows[0],rollback=randomUUID();
  if(!revision||revision.id===historical.id)throw new HttpFailure(409,'rollback_changed','Rollback must create a new immutable revision');
  await db.query(`INSERT INTO learning_rollback_records(id,environment_id,workspace_id,customer_id,contribution_id,revision_id,historical_revision_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[rollback,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,c.customer_id,id,revision.id,historical.id,actor.membershipId]);
  await db.query('INSERT INTO learning_rollback_payloads(rollback_id,content) VALUES($1,$2)',[rollback,JSON.stringify({rationale:input.rationale})]);await scheduleLearningPayloadPurge(db,rollback,'rollback','obsolete');
  return {targetId:id,version:draft.revision};
 });
}
