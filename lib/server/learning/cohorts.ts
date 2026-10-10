import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {learningCohortQuerySchema,learningCohortReleaseSchema,learningMeasurementSchema} from '../../contracts/learning';
import {learningMetricProtocols} from '../../learning/metric-protocols';
import {learningCustomerChange,learningRoundedMean} from '../../learning/calculations';
import {learningCommand,learningRead} from './commands';
import {lockInternalLearningActor,lockLearningPublisher} from './policy';
import {learningHash,learningDatabaseNow,expectLearningVersion} from './repository';
import {captureLearningMeasurementSources,learningMeasurementFrame,learningCompletedWindows} from './measurement-sources';
import {learningCohortIsCurrent,withholdLearningCohort} from './cohort-eligibility';
import {getServerConfig} from '../config';
import {learningWorkspaceState} from './schema';
const unavailable=()=>new HttpFailure(409,'cohort_unavailable','Comparable outcome summary unavailable');
const env=()=>getServerConfig().TURAS_ENVIRONMENT_ID;
export async function readLearningCohortOptions(actor:CurrentSession){
 return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);const now=await learningDatabaseNow(db),year=now.getUTCFullYear(),quarter=Math.floor(now.getUTCMonth()/3),quarters:string[]=[];
  for(let index=1;index<=8;index++){const offset=year*4+quarter-index,y=Math.floor(offset/4),q=offset%4+1;if(y>=2000&&y<=2099)quarters.push(`${y}-Q${q}`);}
  const eligible=(metric:'deployment_lead_time'|'change_failure_rate')=>quarters.filter(quarter=>{try{learningCompletedWindows(metric,quarter,now);return true;}catch{return false;}});
  const gate=await learningWorkspaceState(db,actor.workspaceId);return {quarters:{deployment_lead_time:eligible('deployment_lead_time'),change_failure_rate:eligible('change_failure_rate')},enabled:gate.enabled,protocols:learningMetricProtocols};
 });
}
async function familyLock(db:PoolClient,actor:CurrentSession,metricId:string,quarter:string){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`learning-family:${env()}:${actor.workspaceId}:${metricId}:${quarter}`]);
 return (await db.query(`SELECT f.*,r.id AS release_id,r.protocol_version,r.manifest_digest,r.rounded_mean_change FROM learning_cohort_families f LEFT JOIN learning_cohort_releases r ON r.family_id=f.id WHERE f.environment_id=$1 AND f.workspace_id=$2 AND f.metric_id=$3 AND f.quarter=$4 FOR UPDATE OF f`,[env(),actor.workspaceId,metricId,quarter])).rows[0];
}
export async function readLearningCohort(actor:CurrentSession,raw:unknown){
 const input=learningCohortQuerySchema.parse(raw);return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);const windows=learningCompletedWindows(input.metricId,input.quarter,await learningDatabaseNow(db)),family=await familyLock(db,actor,input.metricId,input.quarter);
  const withheld={contractVersion:'learning-metrics-v1' as const,metricId:input.metricId,quarter:input.quarter,windows:{baseline:windows.baseline,current:windows.current},status:'unavailable' as const};
  if(!family||family.state!=='released'||!family.release_id)return withheld;
  if(!await learningCohortIsCurrent(db,actor,family.release_id,family.manifest_digest)){await withholdLearningCohort(db,family.id);return withheld;}
  const protocol=learningMetricProtocols[input.metricId];return {...withheld,status:'released' as const,protocolVersion:String(family.protocol_version),unit:protocol.unit,definition:protocol.definition,meanChange:String(family.rounded_mean_change),limitation:'Equal customer weighting. Observed change does not establish causation.'};
 });
}
export async function releaseLearningCohort(actor:CurrentSession,raw:unknown){
 const input=learningCohortReleaseSchema.parse(raw);return learningCommand(actor,input,'cohort.release',{customerId:null,authorize:db=>lockLearningPublisher(db,actor)},async db=>{
  learningCompletedWindows(input.metricId,input.quarter,await learningDatabaseNow(db));if(learningMetricProtocols[input.metricId].version!==input.protocolVersion)throw new HttpFailure(422,'invalid_protocol','Use the fixed protocol for this metric');
  let family=await familyLock(db,actor,input.metricId,input.quarter);
  if(family?.state==='withheld')throw unavailable();
  expectLearningVersion(family?.version??0,input.expectedVersion);
  if(family?.state==='released'){
   if(!family.release_id||!await learningCohortIsCurrent(db,actor,family.release_id,family.manifest_digest))throw unavailable();return {targetId:String(family.id),version:Number(family.version)};
  }
  if(!family){const id=randomUUID();await db.query(`INSERT INTO learning_cohort_families(id,environment_id,workspace_id,metric_id,quarter) VALUES($1,$2,$3,$4,$5)`,[id,env(),actor.workspaceId,input.metricId,input.quarter]);family=await familyLock(db,actor,input.metricId,input.quarter);}
  const rows=(await db.query(`SELECT c.customer_id,c.head_revision_id,r.content_digest,r.closure_digest,p.content,a.id AS approval_id,a.decision,a.reuse_approved,a.closure_digest AS approval_closure,m.active,m.kind,m.role,m.revision,a.actor_generation,principal.active AS principal_active FROM learning_measurement_contributions c JOIN learning_measurement_revisions r ON r.id=c.head_revision_id JOIN learning_measurement_payloads p ON p.revision_id=r.id JOIN learning_measurement_approvals a ON a.revision_id=r.id JOIN memberships m ON m.id=a.actor_membership_id JOIN principals principal ON principal.id=m.principal_id WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.metric_id=$3 AND c.quarter=$4 AND c.state='approved' AND r.protocol_version=$5 ORDER BY c.customer_id,c.created_at,c.id LIMIT 10001 FOR SHARE OF c,m,principal`,[env(),actor.workspaceId,input.metricId,input.quarter,input.protocolVersion])).rows;
  if(rows.length>10000)throw new HttpFailure(413,'scope_too_large','Outcome release exceeds its fixed examination bound');
  const customers=new Map<string,{frameDigest:string;manifest:{customerId:string;revisionId:string;approvalId:string;closureDigest:string};change:NonNullable<ReturnType<typeof learningCustomerChange>>;conflict:boolean}>();
  for(const row of rows){
   if(!row.active||!row.principal_active||row.kind!=='internal'||row.role!=='admin'||Number(row.revision)+1!==Number(row.actor_generation)||row.decision!=='approve'||!row.reuse_approved||row.approval_closure!==row.closure_digest||learningHash(row.content)!==row.content_digest)continue;
   try{
    const content=learningMeasurementSchema.parse(row.content),captured=await captureLearningMeasurementSources(db,actor,content);if(captured.closureDigest!==row.closure_digest)continue;
    const change=learningCustomerChange(input.metricId,content.baseline,content.current);if(!change)continue;
    const frameDigest=learningHash(learningMeasurementFrame(content)),prior=customers.get(row.customer_id);if(prior){if(prior.frameDigest!==frameDigest)prior.conflict=true;continue;}
    customers.set(row.customer_id,{frameDigest,manifest:{customerId:String(row.customer_id),revisionId:String(row.head_revision_id),approvalId:String(row.approval_id),closureDigest:String(row.closure_digest)},change,conflict:false});
   }catch(error){if(!(error instanceof HttpFailure)||error.status>=500)throw error;}
  }
  const participants=[...customers.values()].filter(customer=>!customer.conflict);if(participants.length<5)throw unavailable();
  const manifest=participants.map(participant=>participant.manifest).sort((a,b)=>a.customerId.localeCompare(b.customerId)),release=randomUUID(),rounded=learningRoundedMean(participants.map(participant=>participant.change));
  await db.query(`INSERT INTO learning_cohort_releases(id,family_id,protocol_version,formula_version,manifest_digest,rounded_mean_change,participant_count,actor_membership_id) VALUES($1,$2,$3,'learning-metrics-v1',$4,$5,$6,$7)`,[release,family.id,input.protocolVersion,learningHash(manifest),rounded,participants.length,actor.membershipId]);
  for(const member of manifest)await db.query(`INSERT INTO learning_cohort_dependencies(release_id,measurement_revision_id,approval_id,customer_id,closure_digest) VALUES($1,$2,$3,$4,$5)`,[release,member.revisionId,member.approvalId,member.customerId,member.closureDigest]);
  await db.query("UPDATE learning_cohort_families SET state='released',released_at=clock_timestamp(),version=version+1 WHERE id=$1",[family.id]);
  return {targetId:String(family.id),version:Number(family.version)+1};
 });
}
