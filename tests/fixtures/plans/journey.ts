import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
import { withTransaction } from "../../../lib/server/db/client";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { searchEvidence } from "../../../lib/server/retrieval/search";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { createKnowledgeCandidate,submitKnowledgeCandidate,
  decideKnowledgeCandidate } from "../../../lib/server/knowledge/service";

export async function createReviewedPlanWorkload(client:PoolClient,
  author:CurrentSession,reviewer:CurrentSession,customerId:string):Promise<string> {
  const payload={kind:"workload_details" as const,
    name:`Synthetic plan web ${randomUUID().slice(0,8)}`,
    purpose:"Synthetic reviewed delivery planning journey"};
  const proposed=await submitProfileCommand(author,customerId,{
    action:"propose_workload",requestKey:randomUUID(),
    payload,
  },client) as {workloadId:string;recordId:string;revisionId:string};
  const revision=await client.query<{content_digest:string;version:string;
    current_accepted_revision_id:string|null}>(`SELECT revision.content_digest,
      record.version,record.current_accepted_revision_id FROM profile_revisions revision
      JOIN profile_records record ON record.id=revision.record_id WHERE revision.id=$1`,
  [proposed.revisionId]);
  const current=revision.rows[0];
  const shared=await submitProfileCommand(author,customerId,{
    action:"propose_revision",requestKey:randomUUID(),recordId:proposed.recordId,
    workloadId:proposed.workloadId,expectedRecordVersion:Number(current.version),
    expectedAcceptedRevisionId:current.current_accepted_revision_id,
    requestedAudience:"delivery",dataCategory:"delivery_context",payload,
  },client) as {revisionId:string};
  const sharedRevision=await client.query<{content_digest:string;version:string;
    current_accepted_revision_id:string|null}>(`SELECT revision.content_digest,
      record.version,record.current_accepted_revision_id FROM profile_revisions revision
      JOIN profile_records record ON record.id=revision.record_id WHERE revision.id=$1`,
  [shared.revisionId]);
  await submitProfileCommand(reviewer,customerId,{
    action:"accept_revision",requestKey:randomUUID(),revisionId:shared.revisionId,
    digest:sharedRevision.rows[0].content_digest,
    expectedRecordVersion:Number(sharedRevision.rows[0].version),
    expectedAcceptedRevisionId:sharedRevision.rows[0].current_accepted_revision_id,
    rationale:"Reviewed synthetic workload identity for delivery context",
  },client);
  return proposed.workloadId;
}

/** A real synthetic review transition, kept separate from static plan fixtures. */
export async function createReviewedPlanEvidence(client: PoolClient,
  author: CurrentSession,reviewer: CurrentSession,customerId: string,workloadId: string,
  usageDescription="The synthetic workload serves public web requests.") {
  const proposed = await submitProfileCommand(author,customerId,{
    action:"propose_record",requestKey:randomUUID(),workloadId,
    requestedAudience:"delivery",dataCategory:"delivery_context",
    payload:{kind:"product_use",productKey:`synthetic-plan-${randomUUID().slice(0,8)}`,
      displayName:"Synthetic public web",state:"actual",
      usageDescription,
      observedAt:"2026-09-29T12:00:00Z"},
  },client) as {recordId:string;revisionId:string};
  const revision = await client.query<{content_digest:string;version:string;
    current_accepted_revision_id:string|null}>(`SELECT revision.content_digest,
      record.version,record.current_accepted_revision_id FROM profile_revisions revision
      JOIN profile_records record ON record.id=revision.record_id WHERE revision.id=$1`,
  [proposed.revisionId]);
  const current = revision.rows[0];
  await submitProfileCommand(reviewer,customerId,{
    action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,
    digest:current.content_digest,expectedRecordVersion:Number(current.version),
    expectedAcceptedRevisionId:current.current_accepted_revision_id,
    rationale:"Reviewed synthetic evidence for delivery-plan testing",
  },client);
  return proposed;
}

/** Reviewed source, actual lexical retrieval receipt, and durable plan reference. */
export async function createRetrievedPlanEvidence(author:CurrentSession,
  reviewer:CurrentSession,customerId:string,workloadId:string,
  usageDescription?:string):Promise<{
    reviewedRevisionId:string;receiptId:string;
    reference:PlanDraftContent["sourceDependencies"][number]}> {
  const reviewed=await withTransaction((client)=>createReviewedPlanEvidence(
    client,author,reviewer,customerId,workloadId,usageDescription));
  await withTransaction(async(client)=>{
    const projection=await materializeCurrentProjection(client,"accepted_profile",
      reviewed.revisionId,"delivery");
    if(!projection)throw new Error("Reviewed plan source did not materialize");
  });
  const priorKey=process.env.AI_GATEWAY_API_KEY;
  let search:Awaited<ReturnType<typeof searchEvidence>>;
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    search=await searchEvidence(author,{scope:"customer",customerId,workloadId,
      query:"synthetic workload serves public web requests",use:"discovery",limit:5},
    {audience:"delivery",workloadId});
  } finally {
    if(priorKey===undefined)delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY=priorKey;
  }
  const result=search.results.find((item)=>item.sourceRevisionId===reviewed.revisionId);
  if(!result)throw new Error("Reviewed source missing from retrieval receipt");
  const original=await withTransaction(async(client)=>{
    const found=await client.query<{source_generation:string;content_digest:string}>(`
      SELECT source_generation,content_digest FROM retrieval_sources
      WHERE source_kind='accepted_profile' AND source_revision_id=$1
        AND lifecycle_state='current' ORDER BY source_generation DESC LIMIT 1`,
    [reviewed.revisionId]);
    if(!found.rows[0])throw new Error("Reviewed retrieval original missing");
    return found.rows[0];
  });
  return {reviewedRevisionId:reviewed.revisionId,receiptId:search.receiptId,
    reference:{id:randomUUID(),kind:"accepted_profile",
      sourceRevisionId:reviewed.revisionId,
      generation:Number(original.source_generation),contentDigest:original.content_digest,
      locator:result.locators[0],citationId:result.citationId}};
}

/** Publish a sanitized practice whose original accepted source remains private. */
export async function createPublishedPlanPractice(client:PoolClient,
  author:CurrentSession,reviewer:CurrentSession,workspaceId:string):Promise<{
    privateOriginName:string;originCustomerId:string;originRevisionId:string;
    reference:PlanDraftContent["sourceDependencies"][number]}> {
  const originCustomerId=randomUUID();
  const privateOriginName=`Private Origin ${randomUUID().slice(0,8)}`;
  await client.query(`INSERT INTO customer_references
    (id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,true)`,
  [originCustomerId,workspaceId,privateOriginName]);
  for(const member of [author.membershipId,reviewer.membershipId]){
    await client.query(`INSERT INTO customer_stewards
      (customer_id,workspace_id,membership_id,assigned_by)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [originCustomerId,workspaceId,member,reviewer.principalId]);
  }
  const proposed=await submitProfileCommand(author,originCustomerId,{
    action:"propose_record",requestKey:randomUUID(),
    requestedAudience:"internal",dataCategory:"other_internal",
    payload:{kind:"claim",text:"Synthetic private build-stage observation",
      sourceType:"manual"},
  },client) as {revisionId:string};
  const current=await client.query<{content_digest:string;version:string;
    current_accepted_revision_id:string|null}>(`SELECT revision.content_digest,
    record.version,record.current_accepted_revision_id
    FROM profile_revisions revision JOIN profile_records record
      ON record.id=revision.record_id WHERE revision.id=$1`,[proposed.revisionId]);
  await submitProfileCommand(reviewer,originCustomerId,{
    action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,
    digest:current.rows[0].content_digest,
    expectedRecordVersion:Number(current.rows[0].version),
    expectedAcceptedRevisionId:current.rows[0].current_accepted_revision_id,
    rationale:"Reviewed synthetic private practice origin",
  },client);
  const payload={title:"Measure build-stage duration",productVersion:"2026.9",
    problem:"A build pipeline may have unknown bottlenecks",
    prerequisites:"Access to stage timing for the target workload",
    solution:"Measure each build stage before changing the pipeline",
    reasoning:"Stage timing can identify where to investigate",
    applicability:"Build pipelines with observable stages",
    limitations:"Validate product version and workload-specific fit",
    validation:"Compare stage durations before and after a reversible trial"};
  const lineage=[{sourceKind:"accepted_profile" as const,
    sourceRevisionId:proposed.revisionId,sourceGeneration:1,
    sourceDigest:current.rows[0].content_digest,
    rightsBasis:"Synthetic reusable practice with private origin removed"}];
  const draft=await createKnowledgeCandidate(client,author,{
    idempotencyKey:randomUUID(),customerId:originCustomerId,payload,lineage});
  await submitKnowledgeCandidate(client,author,draft.id,{
    idempotencyKey:randomUUID(),expectedRevision:draft.revision,
    expectedDigest:draft.digest});
  const published=await decideKnowledgeCandidate(client,reviewer,draft.id,{
    idempotencyKey:randomUUID(),expectedRevision:draft.revision,
    expectedDigest:draft.digest,action:"publish",rightsAttested:true,
    sanitizationRationale:"Only generic synthetic build-stage guidance remains",
    checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,
      peopleAndCommercialDetailsRemoved:true,
      identifyingConfigurationAndOutcomesRemoved:true,
      countsAndCombinedInferenceReviewed:true},
  });
  const projection=await client.query<{source_generation:string;content_digest:string;
    locators:unknown[]}>(`SELECT source.source_generation,source.content_digest,
    passage.locators FROM retrieval_sources source
    JOIN retrieval_passages passage ON passage.source_id=source.id
    WHERE source.source_kind='published_shared' AND source.source_revision_id=$1
    ORDER BY passage.ordinal LIMIT 1`,[published.revisionId]);
  if(!projection.rows[0])throw new Error("Published practice projection missing");
  return {privateOriginName,originCustomerId,originRevisionId:proposed.revisionId,
    reference:{id:randomUUID(),kind:"shared_knowledge",
      sourceRevisionId:published.revisionId,
      generation:Number(projection.rows[0].source_generation),
      contentDigest:projection.rows[0].content_digest,
      locator:projection.rows[0].locators[0] as PlanDraftContent[
        "sourceDependencies"][number]["locator"]}};
}
