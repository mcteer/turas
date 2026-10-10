import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningMeasurementSchema,learningMeasurementRevisionSchema,learningMeasurementReviewSchema,learningReasonSchema,learningId,learningListSchema} from '../../contracts/learning';
import {learningCommand,learningRead} from './commands';
import {lockInternalLearningActor,lockLearningPublisher,learningActorGeneration} from './policy';
import {learningHash,expectLearningVersion} from './repository';
import {captureLearningMeasurementSources,type LearningMeasurement} from './measurement-sources';
import {persistLearningDependencies} from './sources';
import {scheduleLearningPayloadPurge} from './retention';
import {getServerConfig} from '../config';
import {learningCursor,parseLearningCursor} from './cursors';
import {withholdLearningMeasurementFamilies} from './cohort-eligibility';
const env=()=>getServerConfig().TURAS_ENVIRONMENT_ID;
export async function learningMeasurementHeader(db:PoolClient,actor:CurrentSession,id:string,lock=false){
 learningId.parse(id);await lockInternalLearningActor(db,actor);
 const row=(await db.query(`SELECT c.*,r.revision_number,r.content_digest,r.closure_digest,r.protocol_version,customer.display_name AS customer_name FROM learning_measurement_contributions c JOIN learning_measurement_revisions r ON r.id=c.head_revision_id JOIN customer_references customer ON customer.id=c.customer_id AND customer.workspace_id=c.workspace_id WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3 ${lock?'FOR UPDATE OF c':''}`,[id,env(),actor.workspaceId])).rows[0];
 if(!row)throw hiddenRecord();await lockInternalLearningActor(db,actor,row.customer_id);return row;
}
export async function createLearningMeasurement(actor:CurrentSession,raw:unknown){
 const input=learningMeasurementSchema.parse(raw),contentDigest=learningHash(input);
 return learningCommand(actor,input,'measurement.create',{customerId:input.customerId,authorize:db=>lockInternalLearningActor(db,actor,input.customerId)},async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`learning-measurement:${env()}:${actor.workspaceId}:${input.customerId}:${input.metricId}:${input.quarter}`]);
  const captured=await captureLearningMeasurementSources(db,actor,input),prior=(await db.query(`SELECT c.id,c.version,p.content FROM learning_measurement_contributions c JOIN learning_measurement_payloads p ON p.revision_id=c.head_revision_id WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.customer_id=$3 AND c.metric_id=$4 AND c.quarter=$5 FOR UPDATE OF c`,[env(),actor.workspaceId,input.customerId,input.metricId,input.quarter])).rows[0];
  if(prior){const {requestId:_a,...before}=prior.content,{requestId:_b,...after}=input;if(learningHash(before)!==learningHash(after))throw new HttpFailure(409,'measurement_conflict','A canonical contribution already exists; review a versioned correction');return {targetId:String(prior.id),version:Number(prior.version)};}
  const id=randomUUID(),revision=randomUUID();
  await db.query(`INSERT INTO learning_measurement_contributions(id,environment_id,workspace_id,customer_id,metric_id,quarter,author_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,env(),actor.workspaceId,input.customerId,input.metricId,input.quarter,actor.membershipId]);
  await db.query(`INSERT INTO learning_measurement_revisions(id,contribution_id,revision_number,protocol_version,content_digest,closure_digest,author_membership_id) VALUES($1,$2,1,$3,$4,$5,$6)`,[revision,id,input.protocolVersion,contentDigest,captured.closureDigest,actor.membershipId]);
  await db.query('INSERT INTO learning_measurement_payloads(revision_id,content) VALUES($1,$2)',[revision,JSON.stringify(input)]);await db.query('UPDATE learning_measurement_contributions SET head_revision_id=$2 WHERE id=$1',[id,revision]);
  await persistLearningDependencies(db,actor,input.customerId,'measurement',revision,captured.originals);
  for(const outcome of captured.outcomes)await db.query(`INSERT INTO learning_dependencies(id,environment_id,workspace_id,customer_id,owner_kind,owner_id,source_kind,source_revision_id,source_generation,source_digest) VALUES($1,$2,$3,$4,'measurement',$5,'accepted_execution',$6,$7,$8)`,[randomUUID(),env(),actor.workspaceId,input.customerId,revision,outcome.id,outcome.generation,outcome.digest]);
  return {targetId:id,version:1};
 });
}
export async function readLearningMeasurement(actor:CurrentSession,id:string){
 return learningRead(actor,undefined,async db=>{
  const header=await learningMeasurementHeader(db,actor,id),payload=(await db.query('SELECT content FROM learning_measurement_payloads WHERE revision_id=$1',[header.head_revision_id])).rows[0],approval=(await db.query('SELECT id,decision,reuse_approved FROM learning_measurement_approvals WHERE revision_id=$1',[header.head_revision_id])).rows[0];
  let content:LearningMeasurement|null=null;
  const parsed=learningMeasurementSchema.safeParse(payload?.content);
  if(payload&&parsed.success&&learningHash(payload.content)===header.content_digest)try{const captured=await captureLearningMeasurementSources(db,actor,parsed.data);if(captured.closureDigest===header.closure_digest)content=parsed.data;}catch(error){if(!(error instanceof HttpFailure)||error.status>=500)throw error;}
  return {contractVersion:'learning-metrics-v1' as const,id,version:Number(header.version),revisionId:String(header.head_revision_id),customerName:String(header.customer_name),metricId:String(header.metric_id),quarter:String(header.quarter),state:String(header.state),closureDigest:String(header.closure_digest),content,approval:approval?{id:String(approval.id),decision:String(approval.decision),reuseApproved:!!approval.reuse_approved}:null,canReview:actor.role==='admin'&&content!==null&&header.state==='proposed'};
 });
}
export async function readLearningMeasurementOriginal(actor:CurrentSession,id:string,sourceId:string){
 learningId.parse(sourceId);return learningRead(actor,undefined,async db=>{
  const header=await learningMeasurementHeader(db,actor,id),payload=(await db.query('SELECT content FROM learning_measurement_payloads WHERE revision_id=$1',[header.head_revision_id])).rows[0];if(!payload||learningHash(payload.content)!==header.content_digest)throw hiddenRecord();
  const content=learningMeasurementSchema.parse(payload.content),captured=await captureLearningMeasurementSources(db,actor,content);if(captured.closureDigest!==header.closure_digest)throw hiddenRecord();
  const execution=captured.outcomes.find(source=>source.id===sourceId),original=captured.originals.find(source=>source.revisionId===sourceId);if(!execution&&!original)throw hiddenRecord();
  const kind=execution?'accepted_execution':original!.kind,sql=kind==='accepted_execution'?'SELECT content FROM execution_record_payloads WHERE revision_id=$1':kind==='accepted_profile'?'SELECT payload AS content FROM profile_revisions WHERE id=$1':kind==='verified_research'?'SELECT passage AS content FROM evidence_source_revisions WHERE id=$1':'SELECT excerpt AS content FROM artifact_evidence_selections WHERE id=$1';
  const row=(await db.query(sql,[sourceId])).rows[0];if(!row)throw hiddenRecord();return {kind,revisionId:sourceId,content:row.content};
 });
}
export async function reviseLearningMeasurement(actor:CurrentSession,id:string,raw:unknown){
 const input=learningMeasurementRevisionSchema.parse(raw),content=learningMeasurementSchema.parse({...input,expectedVersion:0});
 return learningCommand(actor,{...input,measurementId:id},'measurement.revise',{customerId:input.customerId,authorize:async db=>{const header=await learningMeasurementHeader(db,actor,id);if(header.author_membership_id!==actor.membershipId&&actor.role!=='admin')throw hiddenRecord();}},async db=>{
  const header=await learningMeasurementHeader(db,actor,id,true);expectLearningVersion(header.version,input.expectedVersion);
  if(header.customer_id!==input.customerId||header.metric_id!==input.metricId||header.quarter!==input.quarter)throw new HttpFailure(422,'immutable_target','A correction preserves its customer, metric and quarter');
  const captured=await captureLearningMeasurementSources(db,actor,content),revision=randomUUID(),number=Number(header.revision_number)+1;
  const previous=(await db.query('SELECT content FROM learning_measurement_payloads WHERE revision_id=$1',[header.head_revision_id])).rows[0];
  if(previous&&captured.closureDigest===header.closure_digest){const {requestId:_a,...before}=previous.content,{requestId:_b,...after}=content;if(learningHash(before)===learningHash(after))return {targetId:id,version:Number(header.version)};}
  await db.query(`INSERT INTO learning_measurement_revisions(id,contribution_id,revision_number,protocol_version,content_digest,closure_digest,author_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[revision,id,number,input.protocolVersion,learningHash(content),captured.closureDigest,actor.membershipId]);await db.query('INSERT INTO learning_measurement_payloads(revision_id,content) VALUES($1,$2)',[revision,JSON.stringify(content)]);
  await persistLearningDependencies(db,actor,input.customerId,'measurement',revision,captured.originals);
  for(const outcome of captured.outcomes)await db.query(`INSERT INTO learning_dependencies(id,environment_id,workspace_id,customer_id,owner_kind,owner_id,source_kind,source_revision_id,source_generation,source_digest) VALUES($1,$2,$3,$4,'measurement',$5,'accepted_execution',$6,$7,$8)`,[randomUUID(),env(),actor.workspaceId,input.customerId,revision,outcome.id,outcome.generation,outcome.digest]);
  await withholdLearningMeasurementFamilies(db,header.head_revision_id);await scheduleLearningPayloadPurge(db,header.head_revision_id,'measurement','obsolete');await db.query("UPDATE learning_measurement_contributions SET head_revision_id=$2,state='proposed',version=version+1 WHERE id=$1",[id,revision]);return {targetId:id,version:Number(header.version)+1};
 });
}
export async function listLearningMeasurements(actor:CurrentSession,raw:unknown){
 const input=learningListSchema.parse(raw);return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);const scope={kind:'measurements',environment:env(),workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),search:input.search},cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT id,metric_id,quarter,state,version,created_at FROM learning_measurement_contributions WHERE environment_id=$1 AND workspace_id=$2 AND($3::timestamptz IS NULL OR(created_at,id)<($3::timestamptz,$4::uuid)) AND($5::text='' OR strpos(metric_id||' '||quarter,$5)>0) ORDER BY created_at DESC,id DESC LIMIT $6`,[env(),actor.workspaceId,cursor?.at??null,cursor?.id??null,input.search,input.limit+1])).rows,last=rows.slice(0,input.limit).at(-1);
  return {items:rows.slice(0,input.limit).map(row=>({id:String(row.id),metricId:String(row.metric_id),quarter:String(row.quarter),state:String(row.state),version:Number(row.version)})),cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
 });
}
export async function reviewLearningMeasurement(actor:CurrentSession,id:string,raw:unknown){
 const input=learningMeasurementReviewSchema.parse(raw);
 return learningCommand(actor,{...input,measurementId:id},'measurement.review',{customerId:null,authorize:async db=>{const header=await learningMeasurementHeader(db,actor,id);await lockLearningPublisher(db,actor,header.customer_id);}},async db=>{
  const header=await learningMeasurementHeader(db,actor,id,true);expectLearningVersion(header.version,input.expectedVersion);
  if(header.head_revision_id!==input.revisionId||header.closure_digest!==input.closureDigest||header.state!=='proposed')throw new HttpFailure(409,'measurement_changed','Review the current exact proposed revision');
  const payload=(await db.query('SELECT content FROM learning_measurement_payloads WHERE revision_id=$1',[header.head_revision_id])).rows[0];if(!payload||learningHash(payload.content)!==header.content_digest)throw hiddenRecord();
  const captured=await captureLearningMeasurementSources(db,actor,learningMeasurementSchema.parse(payload.content));if(captured.closureDigest!==header.closure_digest)throw new HttpFailure(409,'measurement_changed','Accepted measurement sources changed');
  const review=randomUUID();await db.query(`INSERT INTO learning_measurement_approvals(id,revision_id,actor_membership_id,actor_generation,decision,closure_digest,reuse_approved) VALUES($1,$2,$3,$4,$5,$6,$7)`,[review,header.head_revision_id,actor.membershipId,await learningActorGeneration(db,actor),input.decision,input.closureDigest,input.reuseApproved]);await db.query('INSERT INTO learning_measurement_review_payloads(review_id,content) VALUES($1,$2)',[review,JSON.stringify({rationale:input.rationale})]);
  await db.query('UPDATE learning_measurement_contributions SET state=$2,version=version+1 WHERE id=$1',[id,input.decision==='approve'?'approved':'rejected']);await scheduleLearningPayloadPurge(db,review,'measurement_review','obsolete');return {targetId:id,version:Number(header.version)+1};
 });
}
export async function withdrawLearningMeasurement(actor:CurrentSession,id:string,raw:unknown){
 const input=learningReasonSchema.parse(raw);return learningCommand(actor,{...input,measurementId:id},'measurement.withdraw',{customerId:null,newWork:false,authorize:async db=>{const header=await learningMeasurementHeader(db,actor,id);await lockLearningPublisher(db,actor,header.customer_id);}},async db=>{
  const header=await learningMeasurementHeader(db,actor,id,true);expectLearningVersion(header.version,input.expectedVersion);if(header.state==='withdrawn')throw new HttpFailure(409,'measurement_withdrawn','This contribution is withdrawn');await withholdLearningMeasurementFamilies(db,header.head_revision_id);await db.query("UPDATE learning_measurement_contributions SET state='withdrawn',version=version+1 WHERE id=$1",[id]);await scheduleLearningPayloadPurge(db,header.head_revision_id,'measurement','global_invalidated');return {targetId:id,version:Number(header.version)+1};
 });
}
