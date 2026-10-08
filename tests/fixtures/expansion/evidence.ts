import { randomUUID } from 'node:crypto';
import type { CurrentSession } from '../../../lib/server/auth/sessions';
import { withTransaction } from '../../../lib/server/db/client';
import { submitProfileCommand } from '../../../lib/server/profiles/service';
import { materializeCurrentProjection } from '../../../lib/server/retrieval/projections';
import type { ExpansionSource } from '../../../lib/server/expansion/schema';
/** Real synthetic submission/review/projection, never a pending source disguised as accepted. */
export async function acceptedExpansionEvidence(author:CurrentSession,reviewer:CurrentSession,customerId:string,workloadId:string|null,description:string,productKey:string,informationType:'adoption_process'|'product_capability',options:{directness?:number;observedAt?:string;state?:'actual'|'planned'}={}){
 const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),workloadId,requestedAudience:'internal',dataCategory:'other_internal',
  payload:{kind:'product_use',productKey,displayName:'Synthetic Evidence Product',state:options.state??'actual',usageDescription:description,observedAt:options.observedAt??new Date().toISOString()},
  qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:options.directness??4,C:2,reliabilityRationale:'Synthetic accountable primary observation',directnessRationale:'Exact synthetic retained observation',
   corroborationRationale:'Single authoritative synthetic primary source',informationType,dateBasis:'observation'},
 }) as {recordId:string;revisionId:string};
 await withTransaction(async db=>{
  const row=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
  await submitProfileCommand(reviewer,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:row.content_digest,
   expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Reviewed exact synthetic expansion evidence'},db);
  await materializeCurrentProjection(db,'accepted_profile',proposed.revisionId,'internal');
 });
 return withTransaction(async db=>{
  const row=(await db.query(`SELECT s.source_generation,s.content_digest,p.locators FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
   WHERE s.source_revision_id=$1 AND s.source_kind='accepted_profile' AND s.audience='internal' AND s.lifecycle_state='current' AND p.passage_text=$2 ORDER BY p.ordinal LIMIT 1`,[proposed.revisionId,description])).rows[0];
  if(!row)throw Error('Synthetic reviewed expansion projection missing');
  return {reviewedRevisionId:proposed.revisionId,reference:{id:randomUUID(),kind:'accepted_profile',sourceRevisionId:proposed.revisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0]} as Extract<ExpansionSource,{locator:unknown}>};
 });
}

/** Governed synthetic independent-public source with integrity receipt and R1 quality. */
export async function weakPublicExpansionEvidence(actor:CurrentSession,customerId:string){
 const sourceId=randomUUID(),revisionId=randomUUID(),location=`https://vercel.com/docs/synthetic-${sourceId}`;
 const passage='Synthetic public marketing observation suggests a possible benefit; customer intent and actual deployment remain unknown.';
 const {passageDigest}=await import('../../../lib/server/retrieval/chunker');
 return withTransaction(async db=>{
  await db.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity)
   VALUES($1,$2,$3,'independent_research',$4,'synthetic-expansion-ingest')`,[sourceId,actor.workspaceId,customerId,location]);
  await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,observation_at,retrieval_at,rights,audience,quality_input)
   VALUES($1,$2,$3,$4,1,$5,$6,$7,$7,$8,now(),now(),'Synthetic public documentation fixture','internal',$9)`,
   [revisionId,sourceId,actor.workspaceId,customerId,location,'Synthetic Public Observation '+ 'X'.repeat(171),passage,passageDigest(passage),
    {rubricVersion:'evidence-quality-v1',R:1,D:2,C:1,reliabilityRationale:'Synthetic promotional self-report',directnessRationale:'Synthetic indirect possibility',corroborationRationale:'Single synthetic non-authoritative observation',informationType:'product_capability',dateBasis:'observation'}]);
  await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
   VALUES($1,'synthetic-expansion-ingest','synthetic-v1',true,true,true,true,'Exact synthetic source integrity receipt')`,[revisionId]);
  await materializeCurrentProjection(db,'verified_research',revisionId,'internal');
  const row=(await db.query(`SELECT s.source_generation,s.content_digest,p.locators FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
   WHERE s.source_revision_id=$1 AND s.source_kind='verified_research' AND s.lifecycle_state='current' ORDER BY p.ordinal LIMIT 1`,[revisionId])).rows[0];
  if(!row)throw Error('Synthetic public projection missing');
  return {passage,reference:{id:randomUUID(),kind:'verified_research',sourceRevisionId:revisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0]} as Extract<ExpansionSource,{locator:unknown}>};
 });
}
