import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningMeasurementSchema,learningMeasurementValueSchema} from '../../contracts/learning';
import {learningQuarterWindows} from '../../learning/metric-protocols';
import {learningCanonical,learningHash,learningDatabaseNow} from './repository';
import {lockInternalLearningActor} from './policy';
import {learningSourceClosure,learningSupportingOriginals,type LearningOriginal} from './sources';
import {verifyExecutionSources,executionStoredReferences} from '../execution/sources';
import {getServerConfig} from '../config';
export type LearningMeasurement=ReturnType<typeof learningMeasurementSchema.parse>;
const unavailable=()=>new HttpFailure(409,'measurement_evidence_unavailable','Exact accepted observed outcomes and complete population evidence are required');
export function learningCompletedWindows(metric:LearningMeasurement['metricId'],quarter:string,now:Date){
 try{return learningQuarterWindows(metric,quarter,now);}catch{throw new HttpFailure(422,'invalid_window','A completed UTC quarter and its attribution lag are required');}
}
/** A complete typed frame may already be retained in an accepted outcome statement
 * or observed execution narrative. Mapping copies exact accepted fields; it never
 * extracts new facts from prose or from the proposed contribution. */
export function learningMeasurementFrame(input:LearningMeasurement){
 const window=(value:LearningMeasurement['baseline'])=>({start:new Date(value.start).toISOString(),end:new Date(value.end).toISOString(),totalMinutes:value.totalMinutes,deployments:value.deployments,failedDeployments:value.failedDeployments});
 return {version:'learning-observation-v1',metricId:input.metricId,protocolVersion:input.protocolVersion,quarter:input.quarter,workloadIds:[...input.workloadIds].sort(),populationRule:input.populationRule,baseline:window(input.baseline),current:window(input.current)};
}
function observedValue(input:LearningMeasurement,window:LearningMeasurement['baseline'],raw:unknown){
 if(typeof raw!=='string'||!learningMeasurementValueSchema.safeParse(raw).success||window.deployments===0)return false;
 const micro=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));};
 return input.metricId==='deployment_lead_time'?micro(raw)*BigInt(window.deployments)===micro(window.totalMinutes!):micro(raw)*BigInt(window.deployments)===BigInt(window.failedDeployments!)*100000000n;
}
export async function captureLearningMeasurementSources(db:PoolClient,actor:CurrentSession,input:LearningMeasurement){
 await lockInternalLearningActor(db,actor,input.customerId);
 const windows=learningCompletedWindows(input.metricId,input.quarter,await learningDatabaseNow(db));
 for(const key of ['baseline','current'] as const)if(new Date(input[key].start).toISOString()!==windows[key].start||new Date(input[key].end).toISOString()!==windows[key].end)throw new HttpFailure(422,'invalid_window','Use the fixed first and last 14-day UTC windows');
 const locators=[...input.baseline.fieldLocators,...input.current.fieldLocators],sourceIds=new Set([...input.outcomeRevisionIds.map(id=>`accepted_execution:${id}`),...locators.map(source=>`${source.sourceKind}:${source.revisionId}`)]);
 if(sourceIds.size>20)throw new HttpFailure(413,'scope_too_large','At most 20 accepted outcome and source references are allowed');
 const frame=learningMeasurementFrame(input),originals=new Map<string,LearningOriginal>(),executions=new Map<string,{id:string;generation:number;digest:string;content:Record<string,unknown>;engagementId:string}>();
 const profileRefs=locators.filter(ref=>ref.sourceKind==='accepted_profile');
 if(profileRefs.length){
  const unique=[...new Map(profileRefs.map(source=>[source.revisionId,source])).values()];
  const closure=await learningSourceClosure(db,actor,input.customerId,unique.map(source=>({sourceKind:'accepted_profile',sourceRevisionId:source.revisionId,sourceGeneration:source.generation,sourceDigest:source.digest,rightsBasis:'Factual measurement mapping; separate administrator reuse approval required'})));
  for(const original of closure.originals)originals.set(`${original.kind}:${original.revisionId}`,original);
 }
 const executionIds=[...new Set([...input.outcomeRevisionIds,...locators.filter(source=>source.sourceKind==='accepted_execution').map(source=>source.revisionId)])].sort();
 for(const id of executionIds){
  const row=(await db.query(`SELECT v.id,v.revision_number,v.content_digest,v.engagement_id,p.content FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id AND r.accepted_revision_id=v.id JOIN execution_record_payloads p ON p.revision_id=v.id WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId])).rows[0];
  if(!row||row.content.kind!=='outcome'||row.content.status!=='observed')throw unavailable();
  const refs=await executionStoredReferences(db,id,row.content);
  if(!refs.length||refs.some(ref=>ref.kind==='shared_knowledge'||ref.kind==='milestone_baseline'||ref.kind==='execution_record'))throw unavailable();
  await verifyExecutionSources(db,actor,input.customerId,row.engagement_id,'internal',refs,true);
  const direct=refs.filter(ref=>ref.kind==='accepted_profile'||ref.kind==='verified_research'||ref.kind==='approved_excerpt');
  if(direct.length)for(const original of await learningSupportingOriginals(db,actor,input.customerId,direct.map(ref=>({sourceKind:ref.kind,sourceRevisionId:ref.sourceRevisionId}))))originals.set(`${original.kind}:${original.revisionId}`,original);
  if(originals.size+executionIds.length>200)throw new HttpFailure(413,'scope_too_large','Measurement evidence closure exceeds its limit');
  executions.set(id,{id,generation:Number(row.revision_number),digest:String(row.content_digest),content:row.content,engagementId:String(row.engagement_id)});
 }
 for(const source of locators){
  let raw:unknown;
  if(source.sourceKind==='accepted_profile'){
   if(source.fieldPath!=='/statement')throw unavailable();
   const row=(await db.query("SELECT payload FROM profile_revisions WHERE id=$1 AND payload->>'kind'='outcome'",[source.revisionId])).rows[0];raw=row?.payload.statement;
  }else{
   const outcome=executions.get(source.revisionId);if(!outcome||outcome.generation!==source.generation||outcome.digest!==source.digest||source.fieldPath!=='/narrative')throw unavailable();raw=outcome.content.narrative;
  }
  if(typeof raw!=='string'||Buffer.byteLength(raw)>8192)throw unavailable();let accepted:unknown;try{accepted=JSON.parse(raw);}catch{throw unavailable();}
  if(learningCanonical(accepted)!==learningCanonical(frame))throw unavailable();
 }
 for(const id of input.outcomeRevisionIds){
  const outcome=executions.get(id)!;
  if(outcome.content.measure!==input.protocolVersion||outcome.content.unit!==(input.metricId==='deployment_lead_time'?'minutes':'percent')||!observedValue(input,input.baseline,outcome.content.baselineValue)||!observedValue(input,input.current,outcome.content.currentValue)||typeof outcome.content.measurementStart!=='string'||typeof outcome.content.measurementEnd!=='string'||outcome.content.measurementStart>windows.baseline.start.slice(0,10)||outcome.content.measurementEnd<new Date(Date.parse(windows.current.end)-86400000).toISOString().slice(0,10))throw unavailable();
  const refs=await executionStoredReferences(db,id,outcome.content);
  if(profileRefs.some(source=>!refs.some(ref=>ref.kind==='accepted_profile'&&ref.sourceRevisionId===source.revisionId&&ref.generation===source.generation)))throw unavailable();
 }
 const workloads=(await db.query('SELECT id FROM customer_workloads WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND customer_id=$3 FOR SHARE',[input.workloadIds,actor.workspaceId,input.customerId])).rows;
 if(workloads.length!==input.workloadIds.length)throw hiddenRecord();
 const dependencies=[...originals.values()].sort((a,b)=>a.revisionId.localeCompare(b.revisionId)),outcomes=[...executions.values()].map(({content,...header})=>header);
 return {frame,originals:dependencies,outcomes,closureDigest:learningHash({customerId:input.customerId,frame,dependencies,outcomes})};
}
