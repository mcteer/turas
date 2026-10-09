import type {PoolClient} from 'pg';
import {evidenceQualitySchema} from '../../contracts/retrieval';
import {HttpFailure} from '../../contracts/http';
import type {ExpansionHypothesis} from '../../contracts/expansion';
import {canonicalExpansionProduct} from '../../expansion/products';
import {randomUUID} from 'node:crypto';
import {searchEvidence} from '../retrieval/search';
import {resolveRetrievalCitation} from '../retrieval/citations';
import {retrievalQuality} from '../retrieval/context';
import {lockOriginalHeader} from '../plans/sources';
import {expansionLinkMetadata,verifyExpansionLinkPlans,mergeExpansionDependencies} from './links';
import {verifySupportSources} from '../support/sources';
import {assessPlanEvidence} from '../plans/sources';
import type {ExpansionActor} from './policy';
import {lockExpansionActor} from './policy';
import {admitExpansionRequest,expansionHash} from './commands';
import {dependencyUnion} from './dependencies';
import {expansionSourcesSchema,expansionEvidenceQuerySchema,type ExpansionSource,type ExpansionLink} from './schema';
import {withTransaction} from '../db/client';
export function expansionContentSourceKeys(content:ExpansionHypothesis){return [...new Set([
 ...content.assertions.flatMap(a=>a.sourceKeys),...(content.currentUse.kind==='evidenced'?content.currentUse.sourceKeys:[]),
 ...(content.benefit.kind==='measurable_target'&&content.benefit.baseline.kind==='evidenced'?content.benefit.baseline.sourceKeys:[]),
 ...content.prerequisites.flatMap(p=>p.sourceKeys),...content.constraints.flatMap(c=>c.sourceKeys),
])];}
export async function verifyExpansionSources(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,selected:readonly string[],refs:readonly ExpansionSource[],lock=false,links:readonly ExpansionLink[]=[]){
 expansionSourcesSchema.parse(refs);const metadata=await expansionLinkMetadata(db,actor,customerId,workloadId,selected,links);
 const closure=await dependencyUnion(db,actor,customerId,[...refs,...metadata.refs,...metadata.planDependencies.map(source=>({kind:source.kind,sourceRevisionId:source.revisionId,generation:source.generation,contentDigest:source.contentDigest,...(source.engagementId?{engagementId:source.engagementId}:{})}))]);
 const dependencies=mergeExpansionDependencies([closure]);
 if(lock)for(const dependency of dependencies)if(!['execution_record','milestone_baseline'].includes(dependency.kind))await lockOriginalHeader(db,dependency.kind as 'accepted_profile'|'approved_excerpt'|'verified_research'|'shared_knowledge',dependency.revisionId);
 const linkDigest=await verifyExpansionLinkPlans(db,actor,customerId,metadata,lock);
 const digest=await verifySupportSources(db,actor,customerId,workloadId,'internal',selected,refs,lock);
 const baselineDigest=metadata.refs.length?await verifySupportSources(db,actor,customerId,workloadId,'internal',selected,metadata.refs,lock):null;
 return {digest:expansionHash({digest,baselineDigest,linkDigest,dependencies}),dependencies};
}
export async function validateExpansionAssertions(db:PoolClient,actor:ExpansionActor,customerId:string,content:ExpansionHypothesis,refs:readonly ExpansionSource[]){
 const keys=new Set(refs.map(r=>r.id));if(expansionContentSourceKeys(content).some(k=>!keys.has(k)))throw new HttpFailure(422,'invalid_source','Choose exact evidence for every assertion');
 const originalRefs=refs.filter((r):r is Extract<ExpansionSource,{locator:unknown}>=>'locator' in r);
 for(const assertion of content.assertions.filter(a=>a.classification==='accepted_fact')){
  if(assertion.sourceKeys.some(id=>refs.find(r=>r.id===id)?.kind==='verified_research'))throw new HttpFailure(422,'invalid_source','Public research must remain attributed');
 }
 const issues=await assessPlanEvidence(db,actor,customerId,{sourceDependencies:originalRefs,
  assertions:content.assertions.filter(a=>a.classification==='accepted_fact').map((a,i)=>({key:`assertion-${i}`,text:a.text,kind:'accepted_fact',sourceDependencyIds:a.sourceKeys,decisionCritical:true}))});
 if(issues.issues.length)throw new HttpFailure(422,'inadequate_evidence','A factual assertion needs current supported evidence; use an attributed discovery observation or unknown');
}
/** Call only after the current original has passed the scoped source fence. */
export async function expansionEvidenceTitle(db:PoolClient,ref:ExpansionSource){
 if(ref.kind==='verified_research'){
  const row=(await db.query('SELECT title FROM evidence_source_revisions WHERE id=$1',[ref.sourceRevisionId])).rows[0];
  if(!row)throw new HttpFailure(409,'source_changed','Original evidence unavailable');
  return String(row.title).slice(0,200);
 }
 return ref.kind.replaceAll('_',' ');
}
export async function expansionEvidenceMetadata(db:PoolClient,ref:ExpansionSource){
 const iso=(value:unknown)=>typeof value==='string'||value instanceof Date?new Date(value).toISOString():null;
 if(ref.kind==='verified_research'){
  const row=(await db.query('SELECT publication_at,observation_at,event_at,retrieval_at,quality_input FROM evidence_source_revisions WHERE id=$1',[ref.sourceRevisionId])).rows[0];
  if(!row)throw new HttpFailure(409,'source_changed','Original evidence unavailable');
  return {publicationAt:iso(row.publication_at),observationAt:iso(row.observation_at),eventAt:iso(row.event_at),retrievalAt:iso(row.retrieval_at),reviewAt:null,
   quality:retrievalQuality(row.quality_input,{publicationAt:row.publication_at,observationAt:row.observation_at},new Date())};
 }
 if(ref.kind==='accepted_profile'||ref.kind==='approved_excerpt'){
  const id=ref.kind==='approved_excerpt'?(await db.query('SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[ref.sourceRevisionId])).rows[0]?.profile_revision_id:ref.sourceRevisionId;
  const row=(await db.query('SELECT payload,quality_input,created_at FROM profile_revisions WHERE id=$1',[id])).rows[0];
  if(!row)throw new HttpFailure(409,'source_changed','Original evidence unavailable');
  const observationAt=iso(row.payload.observedAt??row.payload.observationEnd);
  return {publicationAt:null,observationAt,eventAt:null,retrievalAt:null,reviewAt:iso(row.payload.reviewAt),quality:retrievalQuality(row.quality_input,{observationAt:observationAt?new Date(observationAt):null,
   reviewAt:row.payload.reviewAt?new Date(row.payload.reviewAt):null},new Date())};
 }
 if(ref.kind==='shared_knowledge'){
  const row=(await db.query("SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",[ref.sourceRevisionId])).rows[0];
  if(!row)throw new HttpFailure(409,'source_changed','Published evidence unavailable');
  return {publicationAt:null,observationAt:null,eventAt:null,retrievalAt:null,reviewAt:null,quality:row.public_quality};
 }
 return {publicationAt:null,observationAt:null,eventAt:null,retrievalAt:null,reviewAt:null,quality:null};
}
export async function searchExpansionEvidence(actor:ExpansionActor,customerId:string,workloadId:string|null,query:string,limit=10){
 const input=expansionEvidenceQuerySchema.parse({workloadId:workloadId??undefined,query,limit});
 await admitExpansionRequest(actor,customerId,'read');
 const found=await searchEvidence(actor,{scope:'combined',customerId,workloadId:workloadId??undefined,query:input.query,use:'discovery',limit:input.limit},{audience:'internal',workloadId,lexicalOnly:true});
 return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);const results=[],seen=new Set<string>();
  for(const item of found.results){
   const citation=await resolveRetrievalCitation(db,actor,item.citationId);
   const identity=`${citation.sourceKind}:${citation.sourceRevisionId}`;if(seen.has(identity))continue;seen.add(identity);
   const reference=expansionSourcesSchema.parse([{id:randomUUID(),kind:citation.sourceKind==='published_shared'?'shared_knowledge':citation.sourceKind,
    sourceRevisionId:citation.sourceRevisionId,generation:citation.sourceGeneration,contentDigest:citation.contentDigest,locator:citation.locators[0],citationId:citation.citationId}])[0]!;
   const metadata=await expansionEvidenceMetadata(db,reference);
   const caveats=[...item.caveats];if(metadata.quality&&['weak','insufficient'].includes(metadata.quality.band))caveats.push('Discovery-only evidence; qualification requires stronger direct support.');
   results.push({title:await expansionEvidenceTitle(db,reference),text:citation.text,asOf:metadata.observationAt??metadata.publicationAt??null,retrievedAsOf:citation.asOf,
    quality:metadata.quality??item.quality,dates:metadata,caveats,reference});
  }
  // Hold the complete original-source lock union through release, after retrieval.
  await verifyExpansionSources(db,actor,customerId,workloadId,[],results.map(item=>item.reference),true);
  return {results,warnings:found.completenessWarnings};
 });
}
/** Qualification checks never promote discovery observations into accepted customer facts. */
export async function expansionQualificationChecks(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,content:ExpansionHypothesis,refs:readonly ExpansionSource[]){
 const missing:string[]=[];let staleCriticalEvidence=false;
 const identity=canonicalExpansionProduct(content.productKey);if(identity.retired||identity.key!==content.productKey)missing.push('Product identity requires current review');
 const originals=refs.filter((r):r is Extract<ExpansionSource,{locator:unknown}>=>'locator' in r);
 async function critical(ref:typeof originals[number],product=false){
  const metadata=await expansionEvidenceMetadata(db,ref),quality=evidenceQualitySchema.safeParse(metadata.quality);
  if(quality.success&&(quality.data.freshness==='Stale'||product&&quality.data.freshness!=='Recent'))staleCriticalEvidence=true;
  if(!quality.success||quality.data.D<(product?4:3)||product&&quality.data.freshness!=='Recent')return false;
  const evaluated=await assessPlanEvidence(db,actor,customerId,{sourceDependencies:[ref],assertions:[{key:'critical',text:'Exact qualification evidence',kind:'accepted_fact',sourceDependencyIds:[ref.id],decisionCritical:true}]});
  return evaluated.issues.length===0;
 }
 async function actualUse(ref:typeof originals[number]){
  if(!['accepted_profile','approved_excerpt'].includes(ref.kind))return false;
  const id=ref.kind==='approved_excerpt'?(await db.query('SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[ref.sourceRevisionId])).rows[0]?.profile_revision_id:ref.sourceRevisionId;
  const row=(await db.query(`SELECT v.payload FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
   WHERE v.id=$1 AND r.workspace_id=$2 AND r.customer_id=$3 AND r.current_accepted_revision_id=v.id
    AND ($4::uuid IS NULL OR r.workload_id IS NULL OR r.workload_id=$4)`,[id,actor.workspaceId,customerId,workloadId])).rows[0];
  return row?.payload?.kind==='product_use'&&row.payload.productKey===content.productKey&&row.payload.state==='actual'&&await critical(ref);
 }
 async function supported(purpose:'customer_need'|'product_suitability'|'current_use',accepted:boolean){
  const assertions=content.assertions.filter(a=>a.purpose===purpose&&(!accepted||a.classification==='accepted_fact'));
  for(const assertion of assertions){
   const selected=originals.filter(r=>assertion.sourceKeys.includes(r.id));
   if(!selected.length||accepted&&selected.some(r=>!['accepted_profile','approved_excerpt'].includes(r.kind)))continue;
   // Every cited critical original must clear quality/conflict checks, so a good source cannot mask a contradicted one.
   let adequate=true;
   for(const ref of selected){
    if(purpose==='product_suitability'&&ref.kind!=='shared_knowledge'){
     const table=ref.kind==='verified_research'?'evidence_source_revisions':'profile_revisions';
     const id=ref.kind==='approved_excerpt'?(await db.query('SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[ref.sourceRevisionId])).rows[0]?.profile_revision_id:ref.sourceRevisionId;
     const input=(await db.query(`SELECT quality_input FROM ${table} WHERE id=$1`,[id])).rows[0]?.quality_input;
     if(!['product_capability','product_availability'].includes(input?.informationType))adequate=false;
    }
    if(!await critical(ref,purpose==='product_suitability'))adequate=false;
    if(purpose==='current_use'&&(content.currentUse.kind!=='evidenced'||!content.currentUse.sourceKeys.includes(ref.id)||!await actualUse(ref)))adequate=false;
   }
   if(adequate)return true;
  }
  return false;
 }
 if(!await supported('customer_need',true))missing.push('Accepted customer-need evidence required');
 if(!await supported('product_suitability',false))missing.push('Current product-suitability evidence required');
 if(content.benefit.kind==='unknown')missing.push('Specific customer benefit and validation required');
 if(content.prerequisites.some(p=>p.status==='blocked'))missing.push('Blocked prerequisite must be resolved');
 for(const prerequisite of content.prerequisites.filter(p=>p.status==='satisfied')){
  for(const key of prerequisite.sourceKeys){const ref=originals.find(r=>r.id===key);if(!ref||!await critical(ref))missing.push('Satisfied prerequisite requires current direct evidence');}
 }
 if(content.benefit.kind==='measurable_target'&&content.benefit.baseline.kind==='evidenced'){
  for(const key of content.benefit.baseline.sourceKeys){const ref=originals.find(r=>r.id===key);if(!ref||!['accepted_profile','approved_excerpt'].includes(ref.kind)||!await critical(ref))missing.push('Measured baseline requires current accepted direct evidence');}
 }

 if(content.prerequisites.some(p=>p.status==='validation_needed'&&(!p.ownerMembershipId||!p.validationStep)))missing.push('Validation prerequisite requires an active owner and step');
 const memberships=[...new Set(content.prerequisites.flatMap(p=>p.ownerMembershipId?[p.ownerMembershipId]:[]))].sort();
 for(const id of memberships){const active=(await db.query(`SELECT 1 FROM memberships m JOIN principals p ON p.id=m.principal_id
  WHERE m.id=$1 AND m.workspace_id=$2 AND m.kind='internal' AND m.active AND p.active`,[id,actor.workspaceId])).rowCount;if(!active)missing.push('Prerequisite owner is no longer active');}
 let actualUseSupported=content.currentUse.kind==='evidenced'&&content.currentUse.state==='actual';
 if(content.currentUse.kind==='evidenced')for(const key of content.currentUse.sourceKeys){const ref=originals.find(r=>r.id===key);if(!ref||!await actualUse(ref))actualUseSupported=false;}
 if(content.intent==='usage_expansion'&&(!actualUseSupported||content.currentUse.kind!=='evidenced'||content.currentUse.state!=='actual'||!content.currentUse.sourceKeys.some(key=>content.assertions.some(a=>a.purpose==='current_use'&&a.classification==='accepted_fact'&&a.sourceKeys.includes(key)))||!await supported('current_use',true)))missing.push('Usage expansion requires accepted actual-use evidence');
 const known=(await db.query(`SELECT v.id,v.payload FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
  WHERE r.workspace_id=$1 AND r.customer_id=$2 AND r.kind='product_use'
   AND ($3::uuid IS NULL OR r.workload_id IS NULL OR r.workload_id=$3)
   AND v.payload->>'productKey'=$4 AND v.payload->>'state'='actual' ORDER BY r.id FOR SHARE OF r`,
 [actor.workspaceId,customerId,workloadId,content.productKey])).rows;
 if(content.intent==='new_product'&&known.length)missing.push('New-product intent contradicts accepted actual use');
 return {missing:[...new Set(missing)],staleCriticalEvidence,knownUseIds:known.map(row=>row.id)};
}
