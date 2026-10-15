import {randomUUID} from 'node:crypto';
import type {AppIdentity} from '../../research/specialists/identity';
import {withTransaction} from '../../db/client';
import {lockProfileActor,lockWorkspaceActor,requireSteward} from '../../profiles/policy';
import {unsupportedProfileRevisionIds} from '../../profiles/eligibility';
import {HttpFailure} from '../../../contracts/http';
import {digest} from '../../research/specialists/research-cache/schema';
import {contextSchema} from '../../../contracts/customer-journey';
import {aggregatePatterns,closedQuarter,learningCommandSchema,measurementSchema,metricId,quarterSchema,reviewedMeasurement,type LearningCommand} from '../../../contracts/customer-adoption';
function requireOwner(identity:AppIdentity){if(identity.kind!=='internal'||identity.role!=='admin')throw new HttpFailure(403,'forbidden','Portfolio learning is restricted to the owner; shared customer access does not grant it');}
const changed=(message:string)=>new HttpFailure(409,'contribution_changed',message);
export async function reviewLearningContribution(identity:AppIdentity,accountId:string,input:LearningCommand){
 requireOwner(identity);const command=learningCommandSchema.parse(input),hash=digest(JSON.stringify(command));
 return withTransaction(async db=>{
  await lockProfileActor(db,identity,accountId);await requireSteward(db,identity,accountId);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${identity.workspaceId}:adoption:${accountId}:${command.quarter}`]);
  const prior=(await db.query('SELECT version,action,quarter,request_hash FROM customer_adoption_contributions WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND request_id=$4',[identity.environmentId,identity.workspaceId,accountId,command.requestId])).rows[0];
  if(prior){if(prior.request_hash!==hash)throw changed('This request ID was used for different content');return {version:Number(prior.version),action:prior.action,quarter:prior.quarter};}
  const head=(await db.query('SELECT version FROM customer_adoption_contributions WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND quarter=$4 AND metric_id=$5 ORDER BY version DESC LIMIT 1',[identity.environmentId,identity.workspaceId,accountId,command.quarter,metricId])).rows[0];
  if(Number(head?.version??0)!==command.expectedVersion)throw changed('Inspect the current contribution version before reviewing it');
  let measurement=null;
  if(command.action==='include'){
   const source=(await db.query(`SELECT v.payload FROM profile_revisions v JOIN profile_records r ON r.current_accepted_revision_id=v.id
    WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3`,[command.sourceRecordId,identity.workspaceId,accountId])).rows[0];
   if(!source || (await unsupportedProfileRevisionIds(db,[command.sourceRecordId],true)).size)throw changed('A current approved source record is required');
   const context=contextSchema.parse(source.payload.legacyJourney);
   measurement=reviewedMeasurement({state:'approved',context},command);
  }
  await db.query(`INSERT INTO customer_adoption_contributions(id,environment_id,workspace_id,account_id,quarter,metric_id,version,request_id,request_hash,action,source_record_id,measurement,approval,actor_user_id,rationale) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[randomUUID(),identity.environmentId,identity.workspaceId,accountId,command.quarter,metricId,command.expectedVersion+1,command.requestId,hash,command.action,command.action==='include'?command.sourceRecordId:null,measurement?JSON.stringify(measurement):null,JSON.stringify(command.action==='include'?command.contribution:{}),identity.principalId,command.rationale]);
  return {version:command.expectedVersion+1,action:command.action,quarter:command.quarter};
 });
}
export async function getLearningContribution(identity:AppIdentity,accountId:string,quarter:string){
 requireOwner(identity);quarterSchema.parse(quarter);
 return withTransaction(async db=>{
  await lockProfileActor(db,identity,accountId,undefined,true);await requireSteward(db,identity,accountId);
  const row=(await db.query('SELECT version,action FROM customer_adoption_contributions WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND quarter=$4 AND metric_id=$5 ORDER BY version DESC LIMIT 1',[identity.environmentId,identity.workspaceId,accountId,quarter,metricId])).rows[0];
  return row?{version:Number(row.version),action:row.action as 'include'|'revoke'}:{version:0,action:null};
 });
}
export async function getAdoptionPatterns(identity:AppIdentity,quarter:string){
 requireOwner(identity);quarterSchema.parse(quarter);if(!closedQuarter(quarter))throw new HttpFailure(400,'open_quarter','Portfolio reports require a completed calendar quarter');
 return withTransaction(async db=>{
  await lockWorkspaceActor(db,identity,undefined,true);
  const rows=(await db.query(`WITH latest AS(SELECT DISTINCT ON(account_id) * FROM customer_adoption_contributions WHERE environment_id=$1 AND workspace_id=$2 AND quarter=$3 AND metric_id=$4 ORDER BY account_id,version DESC)
   SELECT l.account_id,l.measurement,l.source_record_id FROM latest l JOIN profile_revisions v ON v.id=l.source_record_id
   JOIN profile_records r ON r.current_accepted_revision_id=v.id
   WHERE l.action='include' AND l.actor_user_id=$5 AND v.workspace_id=l.workspace_id AND v.customer_id=l.account_id LIMIT 10001`,[identity.environmentId,identity.workspaceId,quarter,metricId,identity.principalId])).rows;
  if(rows.length>10000)throw new HttpFailure(503,'cohort_limit','The governed cohort is too large');
  const unsupported=await unsupportedProfileRevisionIds(db,rows.map(row=>row.source_record_id),true);
  const measurements=[];
  for(const row of rows){if(unsupported.has(row.source_record_id))continue;await lockProfileActor(db,identity,row.account_id,undefined,true);await requireSteward(db,identity,row.account_id);measurements.push({...measurementSchema.parse(row.measurement),accountId:row.account_id});}
  return aggregatePatterns(quarter,measurements);
 });
}
