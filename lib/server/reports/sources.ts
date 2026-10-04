import {eligibleNativeReportSources,nativeSourceKey} from './native-sources';
import {reportMilestoneDecisionDigest} from './milestones';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {recheckRetrievalSource} from '../retrieval/policy';
import {lockOriginalHeader} from '../plans/sources';
import {eligibleOriginalReportProfiles} from './original-profiles';
import type {ReportAudience} from '../../reports/periods';
export type ReportSource={kind:string;id:string;revisionId:string;generation:number;contentDigest:string;engagementId:string|null;decisionId:string|null};
export type ReportSourceScope={environmentId:string;workspaceId:string;customerId:string;audience:ReportAudience};
const changed=()=>new HttpFailure(409,'source_changed','Reviewed report sources changed');
const kinds:Record<string,string>={accepted_profile:'accepted_profile',approved_excerpt:'approved_excerpt',verified_research:'verified_research',shared_knowledge:'published_shared'};
/** Only metadata traverses the original closure; no private conversation or workforce payloads. */
export async function reportSourceClosures(db:PoolClient,scope:ReportSourceScope,input:readonly ReportSource[]){
 const result=new Map<string,ReportSource>(),edges=new Map<string,ReportSource[]>(),identities=new Set<string>(),pending=[...input];
 while(pending.length){
  const batch:ReportSource[]=[];
  for(const ref of pending.splice(0)){const key=nativeSourceKey(ref);if(result.has(key))continue;result.set(key,ref);batch.push(ref);identities.add(`${ref.kind}:${ref.revisionId}`);if(identities.size>2000)throw new HttpFailure(422,'scope_too_large','Narrow the report source scope');}
  for(const kind of ['execution_record','milestone_baseline','milestone_decision']){
   const parents=batch.filter(ref=>ref.kind===kind);if(!parents.length)continue;
   const ids=[...new Set(parents.map(ref=>ref.revisionId))];
   const rows=kind==='milestone_decision'?(await db.query(`SELECT event.id AS parent_id,'execution_record' AS source_kind,v.id AS source_revision_id,v.revision_number AS source_generation,v.content_digest FROM execution_milestone_events event JOIN execution_record_revisions v ON v.id=ANY(event.evidence_revision_ids) WHERE event.id=ANY($1::uuid[]) AND event.environment_id=$2 AND event.workspace_id=$3 AND event.customer_id=$4
    UNION SELECT event.id,'milestone_baseline',b.id,b.baseline_number,b.content_digest FROM execution_milestone_events event JOIN execution_milestone_heads m ON m.id=event.milestone_id JOIN milestone_baselines b ON b.id=m.baseline_id WHERE event.id=ANY($1::uuid[]) AND event.environment_id=$2 AND event.workspace_id=$3 AND event.customer_id=$4`,[ids,scope.environmentId,scope.workspaceId,scope.customerId])).rows:kind==='execution_record'?(await db.query(`SELECT revision_id AS parent_id,CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END AS source_kind,source_revision_id,source_generation,content_digest FROM execution_record_sources WHERE revision_id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4`,[ids,scope.environmentId,scope.workspaceId,scope.customerId])).rows:(await db.query(`SELECT b.id AS parent_id,d.source_kind,d.source_revision_id,d.source_generation,d.source_digest AS content_digest FROM milestone_baselines b JOIN plan_source_dependencies d ON d.revision_id=b.revision_id WHERE b.id=ANY($1::uuid[]) AND b.environment_id=$2 AND b.workspace_id=$3 AND b.customer_id=$4
    UNION SELECT b.id,CASE WHEN d.source_kind='published_shared' THEN 'shared_knowledge' ELSE d.source_kind END,d.source_revision_id,d.source_generation,d.source_digest FROM milestone_baselines b JOIN plan_private_dependencies d ON d.revision_id=b.revision_id WHERE b.id=ANY($1::uuid[]) AND b.environment_id=$2 AND b.workspace_id=$3 AND b.customer_id=$4`,[ids,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
   for(const parent of parents){const children=rows.filter(row=>row.parent_id===parent.revisionId).map(row=>({kind:row.source_kind,id:row.source_revision_id,revisionId:row.source_revision_id,generation:Number(row.source_generation),contentDigest:row.content_digest,engagementId:parent.engagementId,decisionId:null}));edges.set(nativeSourceKey(parent),children);pending.push(...children);}
  }
 }
 const order=(a:ReportSource,b:ReportSource)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId)||nativeSourceKey(a).localeCompare(nativeSourceKey(b));
 const closures=new Map<string,ReportSource[]>();
 for(const root of input){const seen=new Map<string,ReportSource>(),queue=[root];while(queue.length){const ref=queue.pop()!,key=nativeSourceKey(ref);if(seen.has(key))continue;seen.set(key,ref);queue.push(...edges.get(key)??[]);}closures.set(nativeSourceKey(root),[...seen.values()].sort(order));}
 return {closures,sources:[...result.values()].sort(order)};
}
export async function reportSourceClosure(db:PoolClient,scope:ReportSourceScope,input:readonly ReportSource[]):Promise<ReportSource[]>{return (await reportSourceClosures(db,scope,input)).sources;}
export async function reportSourceEligibility(db:PoolClient,scope:ReportSourceScope,sources:readonly ReportSource[],lock=true):Promise<Map<string,boolean>>{
 if(scope.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw changed();if(!sources.length)return new Map();
 const audience=scope.audience==='delivery'?'delivery':'internal';
 const eligibility=new Map<string,boolean>(),missingHeaders=new Set<string>();
 const originals=await eligibleOriginalReportProfiles(db,scope,sources,lock);
 if(lock)for(const ref of sources.filter(ref=>kinds[ref.kind] && ref.kind!=='accepted_profile').sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId))){try{await lockOriginalHeader(db,(ref.kind==='workload_identity'?'accepted_profile':ref.kind) as any,ref.revisionId);}catch(error){if(error instanceof HttpFailure && [403,404,409].includes(error.status))missingHeaders.add(nativeSourceKey(ref));else throw error;}}
 if(lock){const engagements=[...new Set(sources.flatMap(ref=>ref.engagementId?[ref.engagementId]:[]))].sort();await db.query('SELECT id FROM engagements WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 ORDER BY id FOR SHARE',[engagements,scope.environmentId,scope.workspaceId,scope.customerId]);}
 const native=await eligibleNativeReportSources(db,scope,sources);
 for(const ref of sources){
  const key=nativeSourceKey(ref);if(missingHeaders.has(key)){eligibility.set(key,false);continue;}
  let current=false;
  if(ref.kind==='workload_identity' || ref.kind==='accepted_profile')current=originals.has(key);
  else if(['execution_record','milestone_baseline','approved_time'].includes(ref.kind))current=native.has(nativeSourceKey(ref));
  else if(ref.kind==='milestone_decision'){
   const event=(await db.query(`SELECT v.id,v.action,v.expected_version,v.evidence_revision_ids,m.milestone_key,m.baseline_id FROM execution_milestone_events v JOIN execution_milestone_heads m ON m.current_event_id=v.id JOIN engagements e ON e.id=v.engagement_id AND e.active_baseline_id=m.baseline_id JOIN delivery_plans p ON p.id=e.plan_id WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5 AND m.state IN ('accepted','waived') AND (p.audience='delivery' OR $6='internal') FOR SHARE OF m,e,p`,[ref.revisionId,scope.environmentId,scope.workspaceId,scope.customerId,ref.engagementId,audience])).rows[0];
   current=Boolean(event && Number(event.expected_version)+1===ref.generation && ref.decisionId===event.id && reportMilestoneDecisionDigest(event)===ref.contentDigest);
  }
  else if(kinds[ref.kind]){
   if(ref.kind==='accepted_profile' || ref.kind==='approved_excerpt'){
    const permitted=(await db.query(ref.kind==='accepted_profile' ? "SELECT 1 FROM profile_revisions WHERE id=$1 AND data_category IN ('delivery_context','internal_operations')" : "SELECT 1 FROM artifact_evidence_selections WHERE id=$1 AND data_category IN ('delivery_context','internal_operations')",[ref.revisionId])).rowCount;
    if(!permitted){eligibility.set(key,false);continue;}
   }
   if(current){eligibility.set(key,true);continue;}
   const candidates=(await db.query(`SELECT id,source_kind,source_revision_id,source_generation,audience,content_digest,projection_contract FROM retrieval_sources WHERE environment_id=$1 AND source_kind=$2 AND source_revision_id=$3 AND source_generation=$4 AND content_digest=$5 AND lifecycle_state='current' AND ((scope='shared' AND $2='published_shared') OR (scope='customer' AND workspace_id=$6 AND customer_id=$7 AND (audience='delivery' OR $8='internal')))`,[scope.environmentId,kinds[ref.kind],ref.revisionId,ref.generation,ref.contentDigest,scope.workspaceId,scope.customerId,audience])).rows;
   for(const source of candidates)if(await recheckRetrievalSource(db,{id:source.id,kind:source.source_kind,revisionId:source.source_revision_id,generation:Number(source.source_generation),audience:source.audience,contentDigest:source.content_digest,projectionContract:source.projection_contract},{environmentId:scope.environmentId,workspaceId:scope.workspaceId,customerId:scope.customerId,audience,includeShared:true})){current=true;break;}
  }
  eligibility.set(key,current);
 }
 return eligibility;
}

export async function verifyReportSources(db:PoolClient,scope:ReportSourceScope,sources:readonly ReportSource[],lock=true):Promise<void>{
 const eligibility=await reportSourceEligibility(db,scope,sources,lock);if(sources.some(ref=>!eligibility.get(nativeSourceKey(ref))))throw changed();
}
