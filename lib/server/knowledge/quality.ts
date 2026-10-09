import type { PoolClient } from "pg";
import { evidenceQualitySchema } from "../../contracts/retrieval";
import { retrievalQuality } from "../retrieval/context";
type EvidenceQuality=ReturnType<typeof retrievalQuality>;
const freshnessOrder={Unknown:0,Stale:1,Aging:2,Recent:3} as const;
export function combineSharedEvidenceQuality(originals:readonly EvidenceQuality[],at:Date):EvidenceQuality{
 const fallback=retrievalQuality({rubricVersion:"evidence-quality-v1",R:3,D:3,C:1,reliabilityRationale:"Reviewed reusable guidance",directnessRationale:"Sanitized practice",corroborationRationale:"No independent corroboration established",informationType:"product_capability",dateBasis:"unknown"},{},at);
 if(!originals.length)return {...fallback,rationale:"Reusable guidance reviewed; current applicability requires verification."};
 const expired=originals.some(q=>Date.parse(q.validUntil)<=at.getTime()),R=Math.min(3,...originals.map(q=>q.R)),F=Math.min(expired?1:4,...originals.map(q=>q.F)),D=Math.min(3,...originals.map(q=>q.D)),C=Math.min(1,...originals.map(q=>q.C));
 const Q=Math.round(25*(.4*R+.3*F+.2*D+.1*C)),freshness=expired?"Stale":originals.reduce((worst,q)=>freshnessOrder[q.freshness]<freshnessOrder[worst]?q.freshness:worst,"Recent" as EvidenceQuality['freshness']);
 return {rubricVersion:"evidence-quality-v1",R,F,D,C,Q,band:Q>=80?"strong":Q>=60?"usable":Q>=40?"weak":"insufficient",freshness,rationale:"Sanitized reusable guidance assessed conservatively from its reviewed originals; verify applicability independently.",asOf:at.toISOString(),validUntil:new Date(Math.min(at.getTime()+86400000,...originals.map(q=>Date.parse(q.validUntil)))).toISOString()};
}
// Run only inside the existing exact-lineage publication transaction. No private
// locator, date, source identity, customer name or count leaves this calculation.
export async function sharedPublicationQuality(db:PoolClient,revisionId:string,at=new Date()){
 const lineage=(await db.query("SELECT source_kind,source_revision_id FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal",[revisionId])).rows,qualities:EvidenceQuality[]=[];
 for(const ref of lineage){
  if(ref.source_kind==="published_shared"){
   const row=(await db.query("SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",[ref.source_revision_id])).rows[0],parsed=evidenceQualitySchema.safeParse(row?.public_quality);qualities.push(parsed.success?parsed.data:retrievalQuality(null,{},at));continue;
  }
  let row;
  if(ref.source_kind==="verified_research")row=(await db.query("SELECT quality_input,observation_at,publication_at,NULL AS review_at FROM evidence_source_revisions WHERE id=$1",[ref.source_revision_id])).rows[0];
  else{const id=ref.source_kind==="approved_excerpt"?(await db.query("SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1",[ref.source_revision_id])).rows[0]?.profile_revision_id:ref.source_revision_id;row=(await db.query("SELECT quality_input,payload->>'observedAt' AS observation_at,payload->>'reviewAt' AS review_at FROM profile_revisions WHERE id=$1",[id])).rows[0];}
  const date=(value:unknown)=>value instanceof Date?value:typeof value==="string"&&!Number.isNaN(Date.parse(value))?new Date(value):null;
  qualities.push(retrievalQuality(row?.quality_input,{observationAt:date(row?.observation_at),publicationAt:date(row?.publication_at),reviewAt:date(row?.review_at)},at));
 }
 return combineSharedEvidenceQuality(qualities,at);
}
