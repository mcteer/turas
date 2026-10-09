import { randomUUID } from "node:crypto";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { retrievalQuality } from "../../../lib/server/retrieval/context";
import { requireOwnedPartnerDatabase } from "../../../scripts/partners-environment";
import type { PartnerSource,PartnerGuideContent } from "../../../lib/contracts/partners";
import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from "../../../lib/server/knowledge/service";
import { evidenceQualitySchema } from "../../../lib/contracts/retrieval";
export async function partnerAcceptedEvidence(author:CurrentSession,reviewer:CurrentSession,customerId:string,description="Synthetic demonstrated delivery result",options:{audience?:"internal"|"delivery";directness?:number;observedAt?:string;evidenceRevisionIds?:string[]}={}){
 requireOwnedPartnerDatabase();const audience=options.audience??"delivery",observedAt=options.observedAt??new Date(Date.now()-1000).toISOString();
 const proposed=await submitProfileCommand(author,customerId,{action:"propose_record",requestKey:randomUUID(),workloadId:null,requestedAudience:audience,dataCategory:audience==="delivery"?"delivery_context":"other_internal",payload:{kind:"product_use",productKey:`synthetic-evidence-${randomUUID()}`,displayName:"Synthetic Evidence Product",state:"actual",usageDescription:description,observedAt},evidenceRevisionIds:options.evidenceRevisionIds??[],qualityInput:{rubricVersion:"evidence-quality-v1",R:4,D:options.directness??4,C:2,reliabilityRationale:"Synthetic accountable primary observation",directnessRationale:"Exact retained synthetic demonstration",corroborationRationale:"Single authoritative synthetic primary source",informationType:"adoption_process",dateBasis:"observation"}}) as {recordId:string;revisionId:string};
 return withTransaction(async db=>{
  const revision=(await db.query("SELECT v.content_digest,v.quality_input,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1",[proposed.revisionId])).rows[0];
  await submitProfileCommand(reviewer,customerId,{action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,digest:revision.content_digest,expectedRecordVersion:Number(revision.version),expectedAcceptedRevisionId:revision.current_accepted_revision_id,rationale:"Reviewed exact synthetic delivery evidence"},db);
  await materializeCurrentProjection(db,"accepted_profile",proposed.revisionId,audience);
  const row=(await db.query(`SELECT s.source_generation,s.content_digest,p.locators FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.source_revision_id=$1 AND s.source_kind='accepted_profile' AND s.audience=$2 AND s.lifecycle_state='current' AND p.passage_text=$3 ORDER BY p.ordinal LIMIT 1`,[proposed.revisionId,audience,description])).rows[0];
  if(!row)throw Error("Synthetic reviewed delivery projection missing");
  const reference:PartnerSource={id:randomUUID(),kind:"accepted_profile",sourceRevisionId:proposed.revisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0],classification:"customer_fact",observationAt:observedAt,publicationAt:null,reviewAt:null,quality:retrievalQuality(revision.quality_input,{observationAt:new Date(observedAt)})};
  return {...proposed,reference};
 });
}
export function syntheticPartnerGuide(source:PartnerSource,title="Synthetic reviewed partner guide"):PartnerGuideContent{
 const lessonId=randomUUID();return {title,lessons:[{id:lessonId,order:1,objective:"Demonstrate the reviewed customer delivery practice",what:"Use the accepted delivery baseline",how:"Follow the reviewed plan and record independently accepted evidence",why:"Keep learning grounded in observed delivery work",alternatives:"Escalate when the reviewed plan cannot be followed",limitations:"This guide does not approve delivery or certify skills",validation:"Compare retained accepted evidence with the demonstration criterion",escalation:"Ask the internal account owner to review blockers",prerequisites:[],unknowns:["Future customer changes remain unknown"],sourceIds:[source.id]}],checkpoints:[{id:randomUUID(),lessonId,order:1,title:"Demonstrate delivery practice",criterion:"Show the reviewed practice in accepted customer-specific evidence",required:true,prerequisiteIds:[],sourceIds:[source.id]}],sources:[source]};
}
export async function partnerSharedEvidence(author:CurrentSession,reviewer:CurrentSession,customerId:string){
 const accepted=await partnerAcceptedEvidence(author,reviewer,customerId,"PRIVATE_B_SOURCE reusable observation for explicit sanitization");
 return withTransaction(async db=>{
  const source=(await db.query("SELECT revision_number,content_digest FROM profile_revisions WHERE id=$1",[accepted.revisionId])).rows[0];
  const payload={title:"Synthetic reusable practice",productVersion:"Unknown",problem:"A reusable observed engineering concern",prerequisites:"Check current applicability",solution:"Measure before choosing a capability",reasoning:"Use observed evidence",applicability:"Independently reviewed contexts",limitations:"Does not establish named account intent",validation:"Verify each original source"};
  const draft=await createKnowledgeCandidate(db,author,{idempotencyKey:randomUUID(),customerId,payload,lineage:[{sourceKind:"accepted_profile",sourceRevisionId:accepted.revisionId,sourceGeneration:Number(source.revision_number),sourceDigest:source.content_digest,rightsBasis:"Explicit synthetic reuse rights"}]});
  await submitKnowledgeCandidate(db,author,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest});
  const decision=await decideKnowledgeCandidate(db,reviewer,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest,action:"publish",rightsAttested:true,sanitizationRationale:"Reviewed every public synthetic field and removed identifying context",checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
  const row=(await db.query(`SELECT s.source_generation,s.content_digest,p.locators,k.public_quality FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id JOIN knowledge_publications k ON k.revision_id=s.source_revision_id WHERE s.source_revision_id=$1 AND s.source_kind='published_shared' AND s.lifecycle_state='current' ORDER BY p.ordinal LIMIT 1`,[decision.revisionId])).rows[0];if(!row)throw Error("Synthetic shared publication projection required");
  const reference:PartnerSource={id:randomUUID(),kind:"shared_knowledge",sourceRevisionId:decision.revisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0],classification:"shared_practice",observationAt:null,publicationAt:null,reviewAt:null,quality:evidenceQualitySchema.parse(row.public_quality)};
  return {reference,privateRevisionId:accepted.revisionId};
 });
}
