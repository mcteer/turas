import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {getServerConfig} from '../config';
import {expansionHash} from './commands';
import {expansionAssignment,lockExpansionActor,type ExpansionActor} from './policy';
import {expansionScope} from './repository';
import {parseExpansionPayload,readExpansionRevision} from './projection';
import {dependencyUnion,type ExpansionDependency} from './dependencies';
import {expansionLinkMetadata} from './links';
import {verifyExpansionSources} from './sources';
import {lockOriginalHeader} from '../plans/sources';
import {captureExpansionEvidence} from './evidence';
import {expansionProductAliases,expansionProductVocabularyVersion} from '../../expansion/products';
import {expansionRankingVersion} from '../../expansion/ranking';
import {EXPANSION_ADVICE_LIMITS} from '../../expansion/advice';
import type {ExpansionSource,ExpansionLink} from './schema';
export type ExpansionAdviceScope={bindingId:string;scopeId:string;conversationId:string;ownerMembershipId:string;customerId:string;workloadId:string|null;audience:'internal';selectedEngagementIds:string[];selectedHypothesisIds:string[]};
export type ExpansionAdviceDependency={kind:string;revisionId:string;generation:number;contentDigest:string};
const changed=()=>new HttpFailure(409,'expansion_context_changed','Selected expansion inputs changed');
function remapKeys(value:unknown,keys:Map<string,string>):unknown{
 if(Array.isArray(value))return value.map(item=>remapKeys(item,keys));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='sourceKeys'&&Array.isArray(item)?item.map(id=>keys.get(String(id))??id):remapKeys(item,keys)]));
 return value;
}
/** Only selected hypotheses/passages are serialized. Discover identities first,
 * lock the complete original union, then delivery heads, then expansion heads. */
export async function captureExpansionAdviceContext(db:PoolClient,actor:ExpansionActor,scope:ExpansionAdviceScope,refs:readonly ExpansionSource[],question:string,extraLocks?:{refs:ExpansionSource[];selected:string[];links:ExpansionLink[]}){
 await lockExpansionActor(db,actor,scope.customerId);
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 await db.query('SELECT customer_id FROM expansion_account_owners WHERE customer_id=$1 AND workspace_id=$2 FOR SHARE',[scope.customerId,actor.workspaceId]);
 const assignment=await expansionAssignment(db,actor,scope.customerId);
 const profile=(await db.query('SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR SHARE',[scope.customerId,actor.workspaceId])).rows[0];

 const scopeRow=await expansionScope(db,actor,scope.customerId,scope.workloadId);
 if(!scopeRow||scopeRow.id!==scope.scopeId)throw hiddenRecord();
 const rows=(await db.query(`SELECT h.*,p.content,p.invalidate_at,p.purge_at FROM expansion_hypotheses h
  LEFT JOIN expansion_payloads p ON p.revision_id=h.working_revision_id
  WHERE h.scope_id=$1 AND h.id=ANY($2::uuid[]) ORDER BY h.id`,[scope.scopeId,scope.selectedHypothesisIds])).rows;
 if(rows.length!==scope.selectedHypothesisIds.length)throw hiddenRecord();
 const candidates=rows.map(row=>{
  let payload:ReturnType<typeof parseExpansionPayload>|null=null;
  if(row.content&&!row.invalidate_at&&(!row.purge_at||new Date(row.purge_at).getTime()>Date.now()))try{payload=parseExpansionPayload(row.content);}catch{/* Withhold malformed retained prose. */}
  return {row,payload};
 });
 const groups=[{refs:[...refs],selected:scope.selectedEngagementIds,links:[]},...candidates.flatMap(({payload})=>payload?[{refs:payload.sourceRefs,selected:payload.selectedEngagementIds,links:payload.deliveryLinks}]:[])];
 const metadata=await Promise.all(groups.map(group=>expansionLinkMetadata(db,actor,scope.customerId,scope.workloadId,group.selected,group.links)));
 const identities=[...groups.flatMap(group=>group.refs),...metadata.flatMap(group=>[...group.refs,...group.planDependencies.map(ref=>({kind:ref.kind,sourceRevisionId:ref.revisionId,generation:ref.generation,contentDigest:ref.contentDigest,...(ref.engagementId?{engagementId:ref.engagementId}:{})}))])];
 const originals:ExpansionDependency[]=await dependencyUnion(db,actor,scope.customerId,identities);
 const extraMetadata=extraLocks?await expansionLinkMetadata(db,actor,scope.customerId,scope.workloadId,extraLocks.selected,extraLocks.links):null;
 const lockUnion=extraMetadata?await dependencyUnion(db,actor,scope.customerId,[...identities,...extraLocks!.refs,...extraMetadata.refs,...extraMetadata.planDependencies.map(ref=>({kind:ref.kind,sourceRevisionId:ref.revisionId,generation:ref.generation,contentDigest:ref.contentDigest,...(ref.engagementId?{engagementId:ref.engagementId}:{})}))]):originals;
 for(const original of lockUnion)if(!['execution_record','milestone_baseline'].includes(original.kind))await lockOriginalHeader(db,original.kind as 'accepted_profile'|'approved_excerpt'|'verified_research'|'shared_knowledge',original.revisionId);
 const planIds=[...new Set([...metadata,...(extraMetadata?[extraMetadata]:[])].flatMap(group=>group.plans.map(plan=>plan.planId)))].sort();
 if(planIds.length)await db.query('SELECT id FROM delivery_plans WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[planIds]);
 const engagements=[...new Set([...groups.flatMap(group=>group.selected),...(extraLocks?.selected??[])])].sort();
 if(engagements.length)await db.query('SELECT id FROM engagements WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[engagements]);
 await verifyExpansionSources(db,actor,scope.customerId,scope.workloadId,scope.selectedEngagementIds,refs,false);
 const canonical=new Map<string,ExpansionSource>(),keys=new Map<string,string>(),keyIdentity=new Map<string,string>();
 const add=(ref:ExpansionSource)=>{
  const {id,citationId:_permission,...identity}='citationId' in ref?ref:{...ref,citationId:undefined};
  const original=`${ref.kind}:${ref.sourceRevisionId}`,digest=expansionHash(identity),existing=canonical.get(original);
  if(keyIdentity.has(id)&&keyIdentity.get(id)!==digest)throw changed();keyIdentity.set(id,digest);
  if(existing){const {id:_id,citationId:_receipt,...old}='citationId' in existing?existing:{...existing,citationId:undefined};if(expansionHash(old)!==digest)throw changed();keys.set(id,existing.id);}
  else{canonical.set(original,{id,...identity} as ExpansionSource);keys.set(id,id);}
 };
 refs.forEach(add);metadata.flatMap(group=>group.refs).forEach(add);
 const hypotheses=[];
 for(const {row,payload} of candidates){
  const current=await readExpansionRevision(db,actor,scope.customerId,scope.workloadId,row.working_revision_id,false,true);
  if(current.payload&&!payload)throw changed();
  if(current.payload)current.payload.sourceRefs.forEach(add);
  hypotheses.push({id:row.id,version:Number(row.version),disposition:row.disposition,workingRevisionId:row.working_revision_id,decidedRevisionId:row.decided_revision_id,
   availability:current.availability,content:current.payload?.content??null});
 }
 if(canonical.size>EXPANSION_ADVICE_LIMITS.dependencies)throw new HttpFailure(422,'scope_too_large','Narrow selected expansion evidence');
 // Recheck optimistic metadata only after its supporting sources are fenced.
 const heads=(await db.query('SELECT id,version,working_revision_id,decided_revision_id,disposition FROM expansion_hypotheses WHERE scope_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',[scope.scopeId,scope.selectedHypothesisIds])).rows;
 if(expansionHash(heads)!==expansionHash(rows.map(row=>({id:row.id,version:row.version,working_revision_id:row.working_revision_id,decided_revision_id:row.decided_revision_id,disposition:row.disposition}))))throw changed();
 const currentScope=(await db.query('SELECT generation FROM expansion_scopes WHERE id=$1 FOR SHARE',[scope.scopeId])).rows[0];
 if(Number(currentScope?.generation)!==scopeRow.generation)throw changed();
 const sourceRefs=[...canonical.values()];
 const selectedEvidence=await captureExpansionEvidence(db,actor,scope.customerId,scope.workloadId,sourceRefs);
 const customer=(await db.query('SELECT display_name FROM customer_references WHERE id=$1 AND workspace_id=$2',[scope.customerId,actor.workspaceId])).rows[0];
 const workload=scope.workloadId?(await db.query("SELECT display_name FROM customer_workloads WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 AND lifecycle='active'",[scope.workloadId,actor.workspaceId,scope.customerId])).rows[0]:null;
 if(!customer||scope.workloadId&&!workload)throw hiddenRecord();
 const consumedEngagements=[...new Set(groups.flatMap(group=>group.selected))].sort();
 const executionCollections=consumedEngagements.length?(await db.query(`SELECT e.id,e.active_baseline_id,x.generation FROM engagements e
  LEFT JOIN execution_workspaces x ON x.engagement_id=e.id AND x.environment_id=e.environment_id AND x.workspace_id=e.workspace_id AND x.customer_id=e.customer_id
  WHERE e.id=ANY($1::uuid[]) ORDER BY e.id`,[consumedEngagements])).rows:[];
 if(engagements.length)await db.query('SELECT engagement_id FROM execution_workspaces WHERE engagement_id=ANY($1::uuid[]) ORDER BY engagement_id FOR SHARE',[engagements]);
 const dependencies:ExpansionAdviceDependency[]=[...originals,...executionCollections.map(row=>({kind:'execution_collection',revisionId:row.id,generation:Number(row.generation??0),contentDigest:expansionHash({baselineId:row.active_baseline_id,generation:Number(row.generation??0)})})),...heads.map(row=>({kind:'expansion_head',revisionId:row.id,generation:Number(row.version),contentDigest:expansionHash(row)})),
  {kind:'expansion_scope',revisionId:scope.scopeId,generation:scopeRow.generation,contentDigest:expansionHash({generation:scopeRow.generation,products:expansionProductAliases,vocabulary:expansionProductVocabularyVersion,ranking:expansionRankingVersion})},
  {kind:'account_owner',revisionId:scope.customerId,generation:assignment.generation,contentDigest:expansionHash(assignment)},
  {kind:'profile_collection',revisionId:scope.customerId,generation:Number(profile?.internal_generation??0),contentDigest:expansionHash(profile??null)}];
 if(dependencies.length>EXPANSION_ADVICE_LIMITS.dependencies)throw new HttpFailure(422,'scope_too_large','Narrow expansion dependency context');
 const requestRefs=refs.map(ref=>{const {citationId:_receipt,...identity}='citationId' in ref?ref:{...ref,citationId:undefined};return identity;});
 const evidenceFence=selectedEvidence.map(item=>({citationKey:item.citationKey,publicationAt:item.publicationAt,observationAt:item.observationAt,eventAt:item.eventAt,retrievalAt:item.retrievalAt,
  quality:item.quality?Object.fromEntries(Object.entries(item.quality).filter(([key])=>!['asOf','validUntil'].includes(key))):null}));
 const fence={dependencies,evidenceFence,requestRefs,sourceRefs,selectedEngagementIds:scope.selectedEngagementIds,selectedHypothesisIds:scope.selectedHypothesisIds};
 const snapshot={customer:{id:scope.customerId,name:customer.display_name},workload:scope.workloadId?{id:scope.workloadId,name:workload!.display_name}:null,question,
  hypotheses:hypotheses.map(item=>({...item,content:remapKeys(item.content,keys)})),evidence:selectedEvidence,
  selectedEngagementIds:scope.selectedEngagementIds};
 return {snapshot,fence,digest:expansionHash(fence),dependencies,sourceRefs};
}
