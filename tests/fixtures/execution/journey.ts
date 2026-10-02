import { createHash,randomUUID } from "node:crypto";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import { requireOwnedExecutionClone } from "../../../scripts/execution-eval-environment";
import { createOwnedConversation } from "../../../lib/server/conversations/repository";
import { createArtifactUploadBatch } from "../../../lib/server/artifacts/intake";
import { stageArtifactUpload,completeArtifactUpload } from "../../../lib/server/artifacts/upload";
import { claimArtifactRun } from "../../../lib/server/artifacts/jobs";
import { runArtifactJob } from "../../../lib/server/artifacts/runner";
import { readArtifactVersion } from "../../../lib/server/artifacts/read";
import { submitArtifactProposal } from "../../../lib/server/artifacts/proposals";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { heartbeatArtifactWorker } from "../../../lib/server/artifacts/worker-readiness";
import { createReviewedPlanWorkload } from "../plans/journey";
import { createProfileTestSession } from "../profiles";
import { syntheticPlanContent } from "../plans/seed";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { searchEvidence } from "../../../lib/server/retrieval/search";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../../../lib/server/plans/decisions";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";

/** Real004 upload/scan/extraction and human003 review in an owned008 clone. */
export async function createReviewedExecutionArtifact(actor: CurrentSession, reviewer: CurrentSession,
  customerId: string, workloadId: string,
  text = "The synthetic public web workload requires a reviewed application delivery lead.") {
  requireOwnedExecutionClone();
  const bytes = Buffer.from(text, "utf8"), today = new Date().toISOString().slice(0, 10);
  const conversation = await createOwnedConversation(actor, { customerId, requestKey: randomUUID(), title: "Synthetic execution evidence intake" });
  await heartbeatArtifactWorker();
  const batch = await createArtifactUploadBatch(actor, { conversationId: conversation.conversation.id, customerId, workloadId,
    idempotencyKey: randomUUID(), files: [{ name: "synthetic-execution-delivery.txt", expectedSizeBytes: bytes.length,
      declaredType: "text/plain", sourcePublishedOn: today, sourceObservedOn: today, rightsNote: "Synthetic owned journey evidence",
      audience: "delivery", dataCategory: "delivery_context" }] });
  async function* original() { yield bytes; }
  await stageArtifactUpload(actor, batch.intents[0].id, original(), bytes.length);
  const completed = await completeArtifactUpload(actor, batch.intents[0].id, randomUUID());
  if (!completed.versionId) throw new Error("Synthetic journey upload did not complete");
  const claim = await claimArtifactRun();
  if (!claim || claim.versionId !== completed.versionId) throw new Error("Journey requires its isolated artifact job at the owned queue head");
  await runArtifactJob(claim);
  const version = await readArtifactVersion(actor, completed.versionId);
  if (version.state !== "ready" || !version.publishedRunId) throw new Error("Actual artifact scan/extraction did not publish a complete journey source");
  const source = await withTransaction(async db => {
    const units = (await db.query("SELECT id,text,ordinal FROM artifact_extraction_units WHERE run_id=$1 ORDER BY ordinal", [version.publishedRunId])).rows;
    const unit = units.find(row => row.text === text);
    if (!unit) throw new Error("Actual extraction did not preserve the exact synthetic source text");
    const proposal = await submitArtifactProposal(actor, { selection: { versionId: version.id, runId: version.publishedRunId!,
      lifecycleGeneration: version.lifecycleGeneration, ranges: [{ unitId: unit.id, start: 0, end: Array.from(text).length }],
      excerpt: text, excerptDigest: createHash("sha256").update(text).digest("hex"), audience: "delivery", dataCategory: "delivery_context" },
      command: { action: "propose_record", requestKey: randomUUID(), workloadId, requestedAudience: "delivery", dataCategory: "delivery_context",
        payload: { kind: "product_use", productKey: `synthetic-execution-${randomUUID().slice(0, 8)}`,
          displayName: "Synthetic public web", state: "actual", usageDescription: text,
          observedAt: new Date(Date.now() - 10_000).toISOString() },
        qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 2,
          reliabilityRationale: "Exact synthetic uploaded observation reviewed by a human",
          directnessRationale: "The selected text directly describes delivery execution",
          corroborationRationale: "Single reviewed synthetic source; no independent corroboration",
          informationType: "adoption_process", dateBasis: "observation" } } }, db);
    const current = (await db.query(`SELECT r.content_digest,p.version,p.current_accepted_revision_id FROM profile_revisions r
      JOIN profile_records p ON p.id=r.record_id WHERE r.id=$1`, [proposal.revisionId])).rows[0];
    await submitProfileCommand(reviewer, customerId, { action: "accept_revision", requestKey: randomUUID(), revisionId: proposal.revisionId,
      digest: current.content_digest, expectedRecordVersion: Number(current.version), expectedAcceptedRevisionId: current.current_accepted_revision_id,
      rationale: "Human review of actual extracted journey text and source identity" }, db);
    const projection = await materializeCurrentProjection(db, "accepted_profile", proposal.revisionId, "delivery");
    if (!projection) throw new Error("Actual reviewed artifact claim did not materialize for delivery retrieval");
    return { profileRevisionId: proposal.revisionId, selectionId: proposal.selectionId, unitId: unit.id as string };
  });
  return { ...source, artifactVersionId: version.id, extractionRunId: version.publishedRunId, text, conversationId: conversation.conversation.id };
}

export async function createReviewedExecutionJourney() {
  requireOwnedExecutionClone();
  const actors=await withTransaction(async db=>({author:await createProfileTestSession(db,'panel'),reviewer:await createProfileTestSession(db,'mcteer'),partner:await createProfileTestSession(db,'partner')}));
  const customerId=DEMO_IDS.sharedCustomer,workloadId=await withTransaction(db=>createReviewedPlanWorkload(db,actors.author,actors.reviewer,customerId));
  const artifact=await createReviewedExecutionArtifact(actors.author,actors.reviewer,customerId,workloadId);
  const previous=process.env.AI_GATEWAY_API_KEY;let search:Awaited<ReturnType<typeof searchEvidence>>;
  try{delete process.env.AI_GATEWAY_API_KEY;search=await searchEvidence(actors.author,{scope:'customer',customerId,workloadId,query:'synthetic public web workload reviewed application delivery lead',use:'discovery',limit:10},{audience:'delivery',workloadId});}
  finally{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;}
  const retrieved=search.results.find(r=>r.sourceRevisionId===artifact.profileRevisionId);if(!retrieved)throw new Error('Actually reviewed journey artifact missing from retrieval');
  const metadata=await withTransaction(async db=>(await db.query("SELECT source_generation,content_digest FROM retrieval_sources WHERE source_kind='accepted_profile' AND source_revision_id=$1 AND lifecycle_state='current' AND audience='delivery'",[artifact.profileRevisionId])).rows[0]);
  const reference={id:randomUUID(),kind:'accepted_profile' as const,sourceRevisionId:artifact.profileRevisionId,generation:Number(metadata.source_generation),contentDigest:metadata.content_digest as string,locator:retrieved.locators[0],citationId:retrieved.citationId};
  const content=syntheticPlanContent() as PlanDraftContent;content.asOf=new Date(Date.now()-10000).toISOString();content.title='Synthetic reviewed execution journey';content.sourceDependencies=[reference];
  content.assertions=[{key:'reviewed_delivery',kind:'accepted_fact',text:artifact.text,sourceDependencyIds:[reference.id],decisionCritical:false}];
  const accepted=await withTransaction(async db=>{
    const created=await submitPlanCommand(actors.author,{action:'create',requestKey:randomUUID(),workspaceId:actors.author.workspaceId,customerId,workloadId,audience:'delivery',ownerMembershipId:actors.author.membershipId,content},db);
    const submitted=await submitPlanCommand(actors.author,{action:'submit',requestKey:randomUUID(),planId:created.planId,revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:created.aggregateVersion},db);
    const preview=await createPlanReviewPreview(actors.reviewer,created.planId,{requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},db);
    const decision=await decidePlan(actors.reviewer,created.planId,{action:'accept',requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Human verified the actual synthetic source and exact plan',deliverySuitabilityConfirmed:true},db);
    if(!decision.engagementId||!decision.baselineId)throw new Error('Journey plan acceptance incomplete');return {...decision,planId:created.planId,planRevisionId:created.revisionId,baselineDigest:created.contentDigest};
  });
  return {actors,customerId,workloadId,artifact,reference,content,accepted,engagementId:accepted.engagementId!,baselineId:accepted.baselineId!};
}

/** Real reviewed007 resource/calendar/competency and same-day confirmation,
 * followed by an008 reviewed activity. No accepted rows are seeded. */
export async function createAllocatedExecutionJourney() {
  const f=await createReviewedExecutionJourney();
  const {createResource}=await import('../../../lib/server/staffing/resources');
  const {createSkill}=await import('../../../lib/server/staffing/skills');
  const {syntheticResource,syntheticSkill}=await import('../staffing/seed');
  const {createManualAssessment,decideCompetencies}=await import('../../../lib/server/staffing/competencies');
  const {approveCalendar}=await import('../../../lib/server/staffing/calendars');
  const {createDemand,qualifyDemand}=await import('../../../lib/server/staffing/demands');
  const {proposeAllocation}=await import('../../../lib/server/staffing/allocations');
  const {createAllocationReviewPreview,decideAllocation}=await import('../../../lib/server/staffing/decisions');
  const {submitExecutionCommand,readExecutionOverview,readExecutionRecords,previewExecutionCommand}=await import('../../../lib/server/execution/service');
  const exact=(r:{revisionId?:string;contentDigest?:string;aggregateVersion?:number})=>({revisionId:r.revisionId!,contentDigest:r.contentDigest!,expectedAggregateVersion:r.aggregateVersion!});
  const date=new Date().toISOString().slice(0,10),nextDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const existing=await withTransaction(async db=>(await db.query('SELECT id FROM workforce_resources WHERE membership_id=$1',[f.actors.author.membershipId])).rows[0]);
  if(existing)throw new Error('Allocated journey requires an isolated linked subject');
  const resource=await createResource(f.actors.reviewer,{requestKey:randomUUID(),rationale:'Human confirmed linked synthetic delivery subject',
    resource:{...syntheticResource('Synthetic Delivery Contributor'),timezone:'UTC',membershipId:f.actors.author.membershipId}});
  const skill=await createSkill(f.actors.reviewer,{requestKey:randomUUID(),rationale:'Reviewed synthetic skill definition',skill:syntheticSkill()});
  const assessment=await createManualAssessment(f.actors.reviewer,{requestKey:randomUUID(),rationale:'Human observed a synthetic exercise',resourceId:resource.resourceId,
    skillId:skill.skillId,level:3,assessmentDate:date,nextReviewDate:nextDate,evidence:'PRIVATE_EXECUTION_PERSONNEL_ASSESSMENT'});
  await decideCompetencies(f.actors.reviewer,{requestKey:randomUUID(),rows:[{competencyId:assessment.competencyId,candidateRevisionId:assessment.revisionId,
    candidateDigest:assessment.contentDigest,sourceGeneration:1,expectedAggregateVersion:assessment.aggregateVersion,action:'accept',rationale:'Human reviewed the observed skill exercise'}]});
  await approveCalendar(f.actors.reviewer,resource.resourceId,{requestKey:randomUUID(),rationale:'Human confirms same-day working capacity',
    calendar:{timezone:'UTC',observedAt:new Date(Date.now()-10000).toISOString(),nextReviewAt:new Date(Date.now()+86400000).toISOString(),fromDate:date,toDate:date,
      days:[{date,contracted:[{date,from:`${date}T09:00`,to:`${date}T17:00`,fromOffset:null,toOffset:null}],holidays:[],leave:[],protected:[]}]}});
  const demand=await createDemand(f.actors.author,{requestKey:randomUUID(),rationale:'Staffing demand from reviewed exact execution work',demand:{
    customerId:f.customerId,workloadId:f.workloadId,engagementId:f.engagementId,planId:f.accepted.planId,baselineId:f.baselineId,
    planRevisionId:f.accepted.planRevisionId,baselineDigest:f.accepted.baselineDigest,workPackageKey:'proof',title:'Reviewed delivery proof',role:'Delivery engineer',
    fromDate:date,toDate:date,requiredSkills:[{skillId:skill.skillId,minimumLevel:2}],desiredSkills:[],days:[{date,requiredMinutes:240}],allowedRegions:[],billable:true,overlap:null}});
  const qualified=await qualifyDemand(f.actors.author,demand.demandId,{...exact(demand),requestKey:randomUUID(),rationale:'Human checked exact baseline and resource requirements'});
  const proposal=await proposeAllocation(f.actors.author,{requestKey:randomUUID(),rationale:'Human proposes reviewed resource',allocation:{resourceId:resource.resourceId,
    demandId:demand.demandId,demandRevisionId:qualified.revisionId,demandDigest:qualified.contentDigest,expectedDemandVersion:qualified.aggregateVersion,days:[{date,minutes:120}]}});
  const review=await createAllocationReviewPreview(f.actors.reviewer,proposal.allocationId,{...exact(proposal),action:'confirm',requestKey:randomUUID(),rationale:'Inspect exact capacity and reviewed competency'});
  const allocation=await decideAllocation(f.actors.reviewer,proposal.allocationId,{...exact(proposal),action:'confirm',reviewPreviewId:review.previewId,requestKey:randomUUID(),rationale:'Human confirms allocation after current reviewed inputs'});
  const command=(action:string,expectedVersions:Record<string,number>,payload:unknown)=>({version:'execution-v1',action,requestKey:randomUUID(),expectedVersions,payload});
  await submitExecutionCommand(f.actors.author,f.engagementId,command('setup',{baseline:1,plan:f.accepted.aggregateVersion},{baselineId:f.baselineId}));
  let view=await readExecutionOverview(f.actors.author,f.engagementId);
  await submitExecutionCommand(f.actors.author,f.engagementId,command('record.create',{execution:view.version},{baselineId:f.baselineId,record:{kind:'activity',subtype:'work',
    title:'Reviewed delivery test',narrative:'Human verified the synthetic delivery test against reviewed artifact evidence.',audience:'delivery',eventDate:date,timezone:'UTC',
    workPackageKey:'proof',milestoneKeys:[],ownerMembershipId:f.actors.author.membershipId,unknownOwnerReason:null,references:[f.reference]}}));
  let activity=(await readExecutionRecords(f.actors.author,f.engagementId,{})).records[0];view=await readExecutionOverview(f.actors.author,f.engagementId);
  await submitExecutionCommand(f.actors.author,f.engagementId,command('record.submit',{execution:view.version,record:activity.version},{recordId:activity.id,revisionId:activity.revisionId,contentDigest:activity.contentDigest}));
  activity=(await readExecutionRecords(f.actors.reviewer,f.engagementId,{})).records[0];view=await readExecutionOverview(f.actors.reviewer,f.engagementId);
  const candidate={version:'execution-v1',action:'record.accept',expectedVersions:{execution:view.version,record:activity.version},payload:{recordId:activity.id,revisionId:activity.revisionId,contentDigest:activity.contentDigest}};
  await submitExecutionCommand(f.actors.reviewer,f.engagementId,{...candidate,...await previewExecutionCommand(f.actors.reviewer,f.engagementId,candidate),requestKey:randomUUID(),rationale:'Human accepts observed delivery against the exact reviewed evidence'});
  return {...f,resource,skill,allocation,allocationRevisionId:proposal.revisionId!,date,activity};
}
