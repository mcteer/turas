import {z} from 'zod';
import {withTransaction} from '../../db/client';
import type {PoolClient} from 'pg';
import type {AppIdentity} from '../../research/specialists/identity';
import {lockProfileActor,requireSteward} from '../../profiles/policy';
import {unsupportedProfileRevisionIds} from '../../profiles/eligibility';
import {HttpFailure} from '../../../contracts/http';
import {loadResearchContext} from '../../research/specialists/solution-research/context';
import {digest} from '../../research/specialists/research-cache/schema';
import {embedWorkspacePatternText} from '../../retrieval/embeddings';
import {embedQuery,embeddingModel,embeddingsConfigured} from '../../research/specialists/embeddings';
import {patternCommandSchema,applicationCommandSchema,patternSchema,patternText,validatePublication,validateApplication,
 type PatternCommand,type ApplicationCommand} from '../../../contracts/solution-patterns';

const unavailable=(message:string)=>new HttpFailure(409,'solution_knowledge_changed',message);
const publicRow=z.object({pattern_id:z.uuid(),version:z.number().int(),pattern:patternSchema});
const view=(row:z.infer<typeof publicRow>)=>({patternId:row.pattern_id,version:row.version,pattern:row.pattern});
// A derivative grants access to its reviewed, generalized text, never its source.
// Current source approval, steward identity and review expiry are checked before
// keyword/vector ranking, even when an old embedding still exists.
const eligible=`WITH latest AS(SELECT DISTINCT ON(pattern_id) * FROM workspace_solution_patterns
 WHERE environment_id=$1 AND workspace_id=$2 ORDER BY pattern_id,version DESC), eligible AS MATERIALIZED(
 SELECT p.* FROM latest p JOIN profile_revisions source ON source.id=p.source_record_id
 JOIN profile_records record ON record.id=source.record_id AND record.current_accepted_revision_id=source.id
 JOIN principals author ON author.id=p.actor_user_id AND author.active
 JOIN memberships member ON member.principal_id=author.id AND member.workspace_id=p.workspace_id AND member.active AND member.kind='internal'
 WHERE p.action='publish' AND source.workspace_id=p.workspace_id AND source.customer_id=p.account_id
  AND (p.pattern->>'reviewAfter')::date>current_date AND source.id=ANY($3::uuid[])
  AND (member.role='admin' OR EXISTS(SELECT 1 FROM customer_stewards steward WHERE steward.customer_id=p.account_id AND steward.membership_id=member.id AND steward.active)))`;
async function eligibleSources(db:PoolClient,identity:AppIdentity){
 const rows=(await db.query<{source_record_id:string}>(`SELECT DISTINCT p.source_record_id FROM workspace_solution_patterns p
  JOIN profile_records record ON record.current_accepted_revision_id=p.source_record_id
  WHERE p.environment_id=$1 AND p.workspace_id=$2 AND p.action='publish' LIMIT 1001`,[identity.environmentId,identity.workspaceId])).rows;
 if(rows.length>1000)throw new HttpFailure(503,'solution_library_limit','Narrow the solution library');
 const ids=rows.map(row=>row.source_record_id),unsupported=await unsupportedProfileRevisionIds(db,ids,true);
  const conflicts=(await db.query(`SELECT first_revision_id,second_revision_id FROM evidence_conflict_targets
  WHERE environment_id=$1 AND workspace_id=$2 AND state='confirmed'
    AND ((first_kind='accepted_profile' AND first_revision_id=ANY($3::uuid[]))
      OR (second_kind='accepted_profile' AND second_revision_id=ANY($3::uuid[])))`,[identity.environmentId,identity.workspaceId,ids])).rows;
 for(const conflict of conflicts){unsupported.add(conflict.first_revision_id);unsupported.add(conflict.second_revision_id);}
 return ids.filter(id=>!unsupported.has(id));
}
async function lockAccount(db:PoolClient,identity:AppIdentity,accountId:string,write=false){
 await lockProfileActor(db,identity,accountId,undefined,!write);
 if(write)await requireSteward(db,identity,accountId);
}
async function replay(db:PoolClient,identity:AppIdentity,accountId:string,requestId:string,hash:string,table:'workspace_solution_patterns'|'workspace_solution_applications'){
 const row=(await db.query(`SELECT version,action,request_hash FROM ${table} WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND request_id=$4`,[identity.environmentId,identity.workspaceId,accountId,requestId])).rows[0];
 if(row && row.request_hash!==hash)throw unavailable('This request ID was used for different content');
 return row;
}
export async function reviewSolutionPattern(identity:AppIdentity,accountId:string,input:PatternCommand,signal?:AbortSignal){
 const command=patternCommandSchema.parse(input),hash=digest(JSON.stringify(command));signal?.throwIfAborted();
 const result=await withTransaction(async db=>{
  await lockAccount(db,identity,accountId,true);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${identity.workspaceId}:pattern:${command.patternId}`]);
  const prior=await replay(db,identity,accountId,command.requestId,hash,'workspace_solution_patterns');
  if(prior)return {patternId:command.patternId,version:Number(prior.version),action:prior.action};
  const head=(await db.query('SELECT version,account_id FROM workspace_solution_patterns WHERE environment_id=$1 AND workspace_id=$2 AND pattern_id=$3 ORDER BY version DESC LIMIT 1',[identity.environmentId,identity.workspaceId,command.patternId])).rows[0];
  if(Number(head?.version??0)!==command.expectedVersion || head && head.account_id!==accountId)throw unavailable('Inspect the current pattern version before reviewing it');
  if(command.action==='publish'){
   const source=(await db.query(`SELECT revision.payload FROM profile_revisions revision
    JOIN profile_records record ON record.current_accepted_revision_id=revision.id
    WHERE revision.id=$1 AND revision.workspace_id=$2 AND revision.customer_id=$3`,[command.sourceRecordId,identity.workspaceId,accountId])).rows[0];
   if(!source || (await unsupportedProfileRevisionIds(db,[command.sourceRecordId],true)).size)throw unavailable('A current approved source record is required');
   if(command.pattern.outcome.basis==='measured' && source.payload?.legacyJourney?.impact?.basis!=='measured')throw unavailable('Measured outcomes require a reviewed measured impact in the source record');
   const customer=(await db.query('SELECT display_name FROM customer_references WHERE id=$1',[accountId])).rows[0];
   validatePublication(command.pattern,customer.display_name);
  }else if(!head)throw unavailable('Inspect an existing pattern before withdrawing it');
  await db.query(`INSERT INTO workspace_solution_patterns(environment_id,workspace_id,account_id,pattern_id,version,request_id,request_hash,action,source_record_id,pattern,attestation,actor_user_id,rationale,search_text)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,to_tsvector('english',$14))`,
   [identity.environmentId,identity.workspaceId,accountId,command.patternId,command.expectedVersion+1,command.requestId,hash,command.action,
    command.action==='publish'?command.sourceRecordId:null,command.action==='publish'?JSON.stringify(command.pattern):null,
    JSON.stringify(command.action==='publish'?command.attestation:{}),identity.principalId,command.rationale,command.action==='publish'?patternText(command.pattern):'']);
  return {patternId:command.patternId,version:command.expectedVersion+1,action:command.action};
 });
 if(command.action==='publish' && embeddingsConfigured() && !signal?.aborted){
  try{const vector=await embedWorkspacePatternText(patternText(command.pattern));
   await withTransaction(db=>db.query(`UPDATE workspace_solution_patterns SET embedding=$5::vector,embedding_model=$6 WHERE environment_id=$1 AND workspace_id=$2 AND pattern_id=$3 AND version=$4`,[identity.environmentId,identity.workspaceId,command.patternId,result.version,JSON.stringify(vector),embeddingModel]));
  }catch{signal?.throwIfAborted();console.warn(JSON.stringify({event:'solution_patterns.index_failed',patternId:command.patternId}));}
 }
 return result;
}
export async function searchSolutionPatterns(identity:AppIdentity,accountId:string,query:string,signal?:AbortSignal){
 const context=await loadResearchContext(identity,accountId,signal);
 let vector:number[]|null=null;
 const present=await withTransaction(async db=>{await lockAccount(db,identity,accountId);return (await db.query(eligible+' SELECT 1 FROM eligible LIMIT 1',[identity.environmentId,identity.workspaceId,await eligibleSources(db,identity)])).rowCount;});
 if(present && embeddingsConfigured()){try{vector=await embedQuery(query,signal);}catch{signal?.throwIfAborted();}}
 return withTransaction(async db=>{
  await lockAccount(db,identity,accountId);const sources=await eligibleSources(db,identity);
  const rows=await db.query(eligible+`, text_hits AS(
   SELECT pattern_id,row_number() OVER(ORDER BY ts_rank_cd(search_text,websearch_to_tsquery('english',$4)) DESC,pattern_id) AS rank FROM eligible WHERE search_text @@ websearch_to_tsquery('english',$4) LIMIT 30), vector_hits AS(
   SELECT pattern_id,row_number() OVER(ORDER BY embedding <=> $5::vector,pattern_id) AS rank FROM eligible WHERE $5::vector IS NOT NULL AND embedding IS NOT NULL AND embedding_model=$6 AND embedding <=> $5::vector<0.75 LIMIT 30), ranked AS(
   SELECT coalesce(t.pattern_id,v.pattern_id) AS id,coalesce(1.0/(60+t.rank),0)+coalesce(1.0/(60+v.rank),0) AS score FROM text_hits t FULL JOIN vector_hits v ON t.pattern_id=v.pattern_id)
   SELECT p.pattern_id,p.version,p.pattern FROM eligible p JOIN ranked r ON r.id=p.pattern_id ORDER BY r.score DESC,p.pattern_id LIMIT 5`,[identity.environmentId,identity.workspaceId,sources,query,vector?JSON.stringify(vector):null,embeddingModel]);
  signal?.throwIfAborted();return {targetContextHash:digest(JSON.stringify(context)),patterns:z.array(publicRow).parse(rows.rows).map(view),retrieval:vector?'hybrid' as const:'keyword' as const};
 });
}
export async function inspectSolutionKnowledge(identity:AppIdentity,accountId:string,signal?:AbortSignal){
 const context=await loadResearchContext(identity,accountId,signal),contextHash=digest(JSON.stringify(context));
 return withTransaction(async db=>{
  await lockAccount(db,identity,accountId);let canWrite=true;try{await requireSteward(db,identity,accountId);}catch{canWrite=false;}
  const contributions=canWrite?(await db.query(`SELECT DISTINCT ON(pattern_id) pattern_id,version,action,source_record_id,pattern FROM workspace_solution_patterns WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 ORDER BY pattern_id,version DESC LIMIT 50`,[identity.environmentId,identity.workspaceId,accountId])).rows:[];
  const applications=(await db.query(eligible+`, applications AS(SELECT DISTINCT ON(application_id) application_id,version,action,pattern_id,pattern_version,context_hash,assessment FROM workspace_solution_applications WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$4 ORDER BY application_id,version DESC)
   SELECT a.*,CASE WHEN a.action='withdraw' THEN 'withdrawn' WHEN p.pattern_id IS NULL THEN 'pattern_unavailable' WHEN a.context_hash<>$5 THEN 'context_changed' ELSE 'current' END AS eligibility FROM applications a LEFT JOIN eligible p ON p.pattern_id=a.pattern_id AND p.version=a.pattern_version ORDER BY a.application_id LIMIT 50`,[identity.environmentId,identity.workspaceId,await eligibleSources(db,identity),accountId,contextHash])).rows;
  signal?.throwIfAborted();return {targetContextHash:contextHash,contributions,applications};
 });
}
export async function reviewSolutionApplication(identity:AppIdentity,accountId:string,input:ApplicationCommand,signal?:AbortSignal){
 const command=applicationCommandSchema.parse(input);validateApplication(command);signal?.throwIfAborted();
 // Read before the write lock and reject any intervening target update.
 const generation=await withTransaction(async db=>{await lockAccount(db,identity,accountId);return (await db.query('SELECT version FROM customer_profile_state WHERE customer_id=$1',[accountId])).rows[0].version;});
 const context=await loadResearchContext(identity,accountId,signal),hash=digest(JSON.stringify(command));
 return withTransaction(async db=>{
  await lockAccount(db,identity,accountId,true);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${identity.workspaceId}:application:${command.applicationId}`]);
  const prior=await replay(db,identity,accountId,command.requestId,hash,'workspace_solution_applications');if(prior)return {applicationId:command.applicationId,version:Number(prior.version),action:prior.action};
  const current=(await db.query('SELECT version FROM customer_profile_state WHERE customer_id=$1',[accountId])).rows[0].version;
  if(command.action==='approve' && (context.journalStatus!=='available'||digest(JSON.stringify(context))!==command.targetContextHash||String(current)!==String(generation)))throw unavailable('Target context changed or lacks approved evidence; reassess before approval');
  const head=(await db.query('SELECT version,pattern_id,pattern_version FROM workspace_solution_applications WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND application_id=$4 ORDER BY version DESC LIMIT 1',[identity.environmentId,identity.workspaceId,accountId,command.applicationId])).rows[0];
  if(Number(head?.version??0)!==command.expectedVersion)throw unavailable('Inspect the current application version');
  if(command.action==='approve'){
   const found=await db.query(eligible+' SELECT 1 FROM eligible WHERE pattern_id=$4 AND version=$5',[identity.environmentId,identity.workspaceId,await eligibleSources(db,identity),command.pattern.patternId,command.pattern.version]);
   if(!found.rowCount)throw unavailable('The reviewed source pattern is no longer eligible');
  }else if(!head || head.pattern_id!==command.pattern.patternId || Number(head.pattern_version)!==command.pattern.version)throw unavailable('Inspect this existing application before withdrawing it');
  await db.query(`INSERT INTO workspace_solution_applications(environment_id,workspace_id,account_id,application_id,version,request_id,request_hash,action,pattern_id,pattern_version,context_hash,assessment,actor_user_id,rationale) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[identity.environmentId,identity.workspaceId,accountId,command.applicationId,command.expectedVersion+1,command.requestId,hash,command.action,command.pattern.patternId,command.pattern.version,command.targetContextHash,JSON.stringify({fit:command.fit,validationPlan:command.validationPlan}),identity.principalId,command.rationale]);
  return {applicationId:command.applicationId,version:command.expectedVersion+1,action:command.action};
 });
}

export async function workspaceSolutionLibraryVersion(db:PoolClient,identity:AppIdentity){
 const sources=await eligibleSources(db,identity);
 const rows=(await db.query(eligible+' SELECT pattern_id,version FROM eligible ORDER BY pattern_id',[identity.environmentId,identity.workspaceId,sources])).rows;
 return digest(JSON.stringify(rows));
}
