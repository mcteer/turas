import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {hiddenRecord,HttpFailure} from '../../contracts/http';
import {learningCandidateReviewSchema,learningReasonSchema,learningId} from '../../contracts/learning';
import {readKnowledgeCandidate,readKnowledgeLineage} from '../knowledge/lineage';
import {learningCommand,learningRead} from './commands';
import {lockLearningPublisher,learningActorGeneration} from './policy';
import {learningSourceClosure,persistLearningDependencies} from './sources';
import {expectLearningVersion} from './repository';
import {scheduleLearningPayloadPurge} from './retention';
import {invalidateLearningReview} from './invalidation';
import {learningListSchema,serializedBytes,learningLimits} from '../../contracts/learning';
import {learningCursor,parseLearningCursor} from './cursors';
import {lockInternalLearningActor} from './policy';
import {learningEvaluationCatalogDigest} from './evaluation-context';
import {learningPublicationState} from './releases';

/** Metadata remains available for withdrawing the actual head when a newer draft is unreadable. */
export async function readLearningCandidateControl(actor:CurrentSession,id:string){
 learningId.parse(id);
 return learningRead(actor,undefined,async db=>{
  await lockLearningPublisher(db,actor);
  const candidate=(await db.query(`SELECT c.customer_id,r.id AS revision_id,r.revision_number,r.content_digest AS digest FROM knowledge_contributions c JOIN knowledge_revisions r ON r.contribution_id=c.id AND r.revision_number=c.current_revision_number WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
  if(!candidate)throw hiddenRecord();await lockLearningPublisher(db,actor,candidate.customer_id);
  const head=(await db.query(`SELECT p.id,p.state,p.head_generation,r.id AS revision_id,r.revision_number,r.content_digest AS digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.contribution_id=$1 AND p.environment_id=$2`,[id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  const gate=await learningPublicationState(db,actor.workspaceId);
  const history=(await db.query(`SELECT r.id,r.revision_number FROM knowledge_revisions r WHERE r.contribution_id=$1 AND EXISTS(SELECT 1 FROM knowledge_decisions d WHERE d.contribution_id=$1 AND d.revision_id=r.id AND d.action='publish') ORDER BY r.revision_number DESC LIMIT 21`,[id])).rows;
  return {id,customerId:String(candidate.customer_id),revisionId:String(candidate.revision_id),revision:Number(candidate.revision_number),digest:String(candidate.digest),activated:!!gate?.activatedAt,enabled:!!gate?.enabled,publication:head?{id:String(head.id),state:String(head.state),generation:Number(head.head_generation),revisionId:String(head.revision_id),revision:Number(head.revision_number),digest:String(head.digest)}:null,historicalRevisions:history.slice(0,20).map(row=>({id:String(row.id),revision:Number(row.revision_number)})),hasMoreHistoricalRevisions:history.length>20};
 });
}

/** The queue lists only candidates readable through the existing 005 author/admin fence. */
export async function listLearningCandidates(actor:CurrentSession,raw:unknown){
 const input=learningListSchema.parse(raw);
 return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);
  const scope={kind:'candidates',environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),search:input.search};
  const cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query<{id:string;created_at:Date}>(`SELECT c.id,c.created_at FROM knowledge_contributions c
   JOIN knowledge_revisions r ON r.contribution_id=c.id AND r.revision_number=c.current_revision_number
   JOIN knowledge_revision_payloads p ON p.revision_id=r.id
   WHERE c.environment_id=$1 AND c.workspace_id=$2 AND (c.author_membership_id=$3 OR $4::boolean)
   AND ($5::text='' OR strpos(lower(p.payload->>'title'),lower($5))>0)
   AND ($6::timestamptz IS NULL OR (c.created_at,c.id)<($6::timestamptz,$7::uuid))
   ORDER BY c.created_at DESC,c.id DESC LIMIT $8`,[scope.environment,actor.workspaceId,actor.membershipId,actor.role==='admin',input.search,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const items=[];
  for(const row of rows.slice(0,input.limit)){
   try{
    const candidate=await readKnowledgeCandidate(db,actor,row.id);
    const revision=(await db.query('SELECT id FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[row.id,candidate.revision])).rows[0];
    if(!revision)throw hiddenRecord();
    items.push({id:candidate.id,revisionId:String(revision.id),customerId:candidate.customerId,title:candidate.payload.title,state:candidate.state,revision:candidate.revision,digest:candidate.digest});
   }catch(error){if(!(error instanceof HttpFailure)||error.status!==404)throw error;}
  }
  const last=rows.slice(0,input.limit).at(-1);
  const result={contractVersion:'learning-v1' as const,items,cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
  if(serializedBytes(result)>learningLimits.pageBytes)throw new HttpFailure(413,'response_too_large','Read a smaller candidate page');
  return result;
 });
}
/** Separate original prose from the bounded candidate/queue projection. */
export async function readLearningCandidateOriginal(actor:CurrentSession,id:string,sourceId:string){
 learningId.parse(sourceId);
 return learningRead(actor,undefined,async db=>{
  const current=await exactCandidate(db,actor,id),source=current.closure.originals.find(s=>s.revisionId===sourceId);
  if(!source)throw hiddenRecord();
  const sql=source.kind==='accepted_profile'?'SELECT payload AS content FROM profile_revisions WHERE id=$1':source.kind==='verified_research'?'SELECT passage AS content FROM evidence_source_revisions WHERE id=$1':'SELECT excerpt AS content FROM artifact_evidence_selections WHERE id=$1';
  const row=(await db.query(sql,[sourceId])).rows[0];if(!row)throw hiddenRecord();
  const result={kind:source.kind,revisionId:source.revisionId,generation:source.generation,digest:source.digest,rights:source.rights,content:row.content};
  if(serializedBytes(result)>learningLimits.pageBytes)throw new HttpFailure(413,'response_too_large','Original evidence exceeds this review view');return result;
 });
}
async function exactCandidate(db:PoolClient,actor:CurrentSession,id:string){
 if(actor.kind!=='internal')throw hiddenRecord();
 learningId.parse(id);
 const header=(await db.query('SELECT customer_id,author_membership_id FROM knowledge_contributions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!header||header.author_membership_id!==actor.membershipId&&actor.role!=='admin')throw hiddenRecord();await lockInternalLearningActor(db,actor,header.customer_id);
 const candidate=await readKnowledgeCandidate(db,actor,id),lineage=await readKnowledgeLineage(db,actor,id);
 const revision=(await db.query('SELECT id FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[id,candidate.revision])).rows[0];if(!revision)throw hiddenRecord();
 const closure=await learningSourceClosure(db,actor,candidate.customerId,lineage);
 return {candidate,revisionId:revision.id as string,closure};
}
/** Preserve 005 author/admin private reads. Feedback links do not confer access. */
export async function readLearningCandidate(actor:CurrentSession,id:string){
 return learningRead(actor,undefined,async db=>{
  const current=await exactCandidate(db,actor,id);
  const rows=(await db.query(`SELECT r.id,r.decision,r.content_digest,r.closure_digest,r.rights_digest,s.version,s.revoked_at,r.created_at FROM learning_candidate_reviews r JOIN learning_review_states s ON s.review_id=r.id WHERE r.revision_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3 ORDER BY r.created_at DESC NULLS LAST,r.id DESC LIMIT 20`,[current.revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows;
  const canReview=actor.kind==='internal'&&actor.role==='admin';
  const evaluations=canReview?(await db.query(`SELECT id,state,revision_id,created_at FROM learning_evaluations WHERE contribution_id=$1 AND environment_id=$2 AND workspace_id=$3 ORDER BY created_at DESC,id DESC LIMIT 21`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows:[];
  const lineage=await readKnowledgeLineage(db,actor,id);
  return {...current.candidate,revisionId:current.revisionId,closureDigest:current.closure.closureDigest,rightsDigest:current.closure.rightsDigest,originals:lineage.map(s=>({kind:s.sourceKind,revisionId:s.sourceRevisionId,generation:s.sourceGeneration,digest:s.sourceDigest})),reviews:rows.map(r=>({id:r.id,decision:r.decision,version:Number(r.version),revoked:!!r.revoked_at,contentDigest:r.content_digest,closureDigest:r.closure_digest,rightsDigest:r.rights_digest})),canReview,
   ...(canReview?{evaluationCatalogDigest:learningEvaluationCatalogDigest(),baselineGeneration:current.candidate.publication?.state==='published'?current.candidate.publication.generation:null,evaluations:evaluations.slice(0,20).map(e=>({id:String(e.id),state:String(e.state),revisionId:String(e.revision_id)})),hasMoreEvaluations:evaluations.length>20}:{})};
 });
}
export async function reviewLearningCandidate(actor:CurrentSession,id:string,raw:unknown){
 const input=learningCandidateReviewSchema.parse(raw);
 return learningCommand(actor,{...input,contributionId:id},'candidate.review',{customerId:null,authorize:async db=>{const current=await exactCandidate(db,actor,id);await lockLearningPublisher(db,actor,current.candidate.customerId);expectLearningVersion(current.candidate.revision,input.expectedVersion);if(current.revisionId!==input.revisionId||current.candidate.digest!==input.contentDigest||current.closure.closureDigest!==input.closureDigest)throw new HttpFailure(409,'candidate_changed','Reload the exact candidate and originals before reviewing');}},async db=>{
  const current=await exactCandidate(db,actor,id);expectLearningVersion(current.candidate.revision,input.expectedVersion);
  if(current.revisionId!==input.revisionId||current.candidate.digest!==input.contentDigest||current.closure.closureDigest!==input.closureDigest)throw new HttpFailure(409,'candidate_changed','Reload the exact candidate and originals before reviewing');
  if(current.candidate.state!=='submitted')throw new HttpFailure(409,'candidate_not_submitted','Submit the candidate for independent review first');
  const reviewId=randomUUID();
  await db.query(`INSERT INTO learning_candidate_reviews(id,environment_id,workspace_id,customer_id,contribution_id,revision_id,revision_number,content_digest,closure_digest,rights_digest,reviewer_membership_id,reviewer_generation,decision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[reviewId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,current.candidate.customerId,id,current.revisionId,current.candidate.revision,current.candidate.digest,current.closure.closureDigest,current.closure.rightsDigest,actor.membershipId,await learningActorGeneration(db,actor),input.decision]);
  await db.query('INSERT INTO learning_review_states(review_id) VALUES($1)',[reviewId]);
  await db.query('INSERT INTO learning_review_payloads(review_id,content) VALUES($1,$2)',[reviewId,JSON.stringify({rationale:input.rationale,...(input.decision==='accept'?{rightsAttested:input.rightsAttested,checklist:input.checklist}:{})})]);
  await persistLearningDependencies(db,actor,current.candidate.customerId,'review',reviewId,current.closure.originals);
  return {targetId:reviewId,version:1};
 });
}
export async function revokeLearningReview(actor:CurrentSession,reviewId:string,raw:unknown){
 learningId.parse(reviewId);const input=learningReasonSchema.parse(raw);
 const scope=async(db:PoolClient)=>{
  const row=(await db.query(`SELECT r.*,s.version,s.revoked_at FROM learning_candidate_reviews r JOIN learning_review_states s ON s.review_id=r.id WHERE r.id=$1 AND r.environment_id=$2 AND r.workspace_id=$3 FOR UPDATE OF s`,[reviewId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();
  await lockLearningPublisher(db,actor,row.customer_id);return row;
 };
 return learningCommand(actor,{...input,reviewId},'review.revoke',{customerId:null,newWork:false,authorize:async db=>{await scope(db);}},async db=>{
  const row=await scope(db);expectLearningVersion(row.version,input.expectedVersion);if(row.revoked_at)throw new HttpFailure(409,'review_revoked','This rights grant is already revoked');
  const auditId=randomUUID();
  await db.query(`INSERT INTO learning_candidate_reviews(id,environment_id,workspace_id,customer_id,contribution_id,revision_id,revision_number,content_digest,closure_digest,rights_digest,reviewer_membership_id,reviewer_generation,decision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'reject')`,[auditId,row.environment_id,row.workspace_id,row.customer_id,row.contribution_id,row.revision_id,row.revision_number,row.content_digest,row.closure_digest,row.rights_digest,actor.membershipId,await learningActorGeneration(db,actor)]);
  await db.query('INSERT INTO learning_review_states(review_id) VALUES($1)',[auditId]);
  await db.query('INSERT INTO learning_review_payloads(review_id,content) VALUES($1,$2)',[auditId,JSON.stringify({rationale:input.rationale,revokedReviewId:reviewId})]);
  await scheduleLearningPayloadPurge(db,auditId,'review','obsolete');
  await invalidateLearningReview(db,actor.workspaceId,reviewId);await db.query('UPDATE learning_review_states SET revoker_membership_id=$2 WHERE review_id=$1',[reviewId,actor.membershipId]);
  return {targetId:reviewId,version:Number(row.version)+1};
 });
}
