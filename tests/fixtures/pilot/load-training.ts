import {pilotFixtureQuotaWait} from './load-quota';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {retrievalQuality} from '../../../lib/server/retrieval/context';
import type {PartnerSource} from '../../../lib/contracts/partners';
import {syntheticPartnerGuide} from '../partners/originals';
import {partnerCommandEnvelope} from '../partners/guides';
import {writePartnerGuide,readPartnerGuide} from '../../../lib/server/partners/guides';
import {previewPartnerGuide,decidePartnerGuide} from '../../../lib/server/partners/previews';
import {previewPartnerAssignment,decidePartnerAssignment,readPartnerAssignment} from '../../../lib/server/partners/assignments';
import {writePartnerCheckpoint,previewPartnerCheckpoint,decidePartnerCheckpoint} from '../../../lib/server/partners/submissions';
import type {pilotLoadEvidenceFixture} from './load';
import type {pilotLoadDeliveryBaseFixture} from './load-delivery';
/** Every partner receives a reviewed explicit assignment; their submitted
 * demonstration is verified by mcteer through an exact normal preview. */
export async function pilotLoadTrainingFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>,delivery:Awaited<ReturnType<typeof pilotLoadDeliveryBaseFixture>>,signal:AbortSignal){
 requireOwnedPilotDatabase(process.env,true);signal.throwIfAborted();const author=evidence.actors[1],reviewer=evidence.actors[0],revisionId=evidence.customers[0].revisionIds[0];
 const row=(await db.query("SELECT s.source_generation,s.content_digest,p.locators,r.quality_input,r.payload FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id JOIN profile_revisions r ON r.id=s.source_revision_id WHERE s.source_revision_id=$1 AND s.audience='delivery' AND s.lifecycle_state='current' AND p.locators->0->>'fieldPath'='usageDescription' ORDER BY p.ordinal LIMIT 1",[revisionId])).rows[0];if(!row?.payload?.observedAt)throw Error('Normally accepted observed load practice required');
 const source:PartnerSource={id:randomUUID(),kind:'accepted_profile',sourceRevisionId:revisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0],classification:'customer_fact',observationAt:row.payload.observedAt,publicationAt:null,reviewAt:null,quality:retrievalQuality(row.quality_input,{observationAt:new Date(row.payload.observedAt)},new Date())};
 const quota=pilotFixtureQuotaWait(signal);
 const content=syntheticPartnerGuide(source,'Synthetic fixed load training guide');
 const saved=await quota.run(()=>writePartnerGuide(author,{...partnerCommandEnvelope(),action:'guide.create',customerId:evidence.customers[0].id,engagementId:delivery.engagementId,acceptedRevisionId:delivery.plan.created.revisionId,baselineId:delivery.baselineId,content})),draft=await quota.run(()=>readPartnerGuide(author,saved.targetId!));
 const submitted=await quota.run(()=>writePartnerGuide(author,{...partnerCommandEnvelope(),action:'guide.submit',guideId:saved.targetId!,revisionId:draft.revisionId,contentDigest:draft.contentDigest,expectedVersion:saved.version!}));
 const review={...partnerCommandEnvelope(),action:'guide.publish' as const,guideId:saved.targetId!,revisionId:draft.revisionId,contentDigest:draft.contentDigest,expectedVersion:submitted.version!,rationale:'Review controlled synthetic training practice',selfReview:false},preview=await quota.run(()=>previewPartnerGuide(reviewer,review));await quota.run(()=>decidePartnerGuide(reviewer,{...review,requestId:randomUUID(),previewId:preview.previewId}));
 const assignments=[];
 for(const partner of evidence.actors.slice(15)){
  signal.throwIfAborted();const input={...partnerCommandEnvelope(),action:'assignment.create' as const,guideId:saved.targetId!,revisionId:draft.revisionId,membershipId:partner.membershipId,rationale:'Explicit synthetic load participant assignment',selfReview:false},assignmentPreview=await quota.run(()=>previewPartnerAssignment(reviewer,input)),assigned=await quota.run(()=>decidePartnerAssignment(reviewer,{...input,requestId:randomUUID(),previewId:assignmentPreview.previewId}));
  const assignmentId=assigned.targetId!,checkpointId=content.checkpoints[0].id,attemptSaved=await quota.run(()=>writePartnerCheckpoint(partner,{...partnerCommandEnvelope(),action:'checkpoint.save',assignmentId,checkpointId,expectedVersion:1,content:{attempted:'Controlled synthetic demonstration',result:'Controlled synthetic practice was independently reviewed',blockers:[],observedAt:new Date(Date.now()-1000).toISOString(),sources:[source]}})),attempt=(await quota.run(()=>readPartnerAssignment(partner,assignmentId))).checkpoints[0].attempts[0];
  const attemptSubmitted=await quota.run(()=>writePartnerCheckpoint(partner,{...partnerCommandEnvelope(),action:'checkpoint.submit',assignmentId,checkpointId,attemptId:attempt.attemptId,revisionId:attempt.revisionId,contentDigest:attempt.contentDigest,expectedVersion:attemptSaved.version!}));
  const review={...partnerCommandEnvelope(),action:'checkpoint.verify' as const,assignmentId,checkpointId,attemptId:attempt.attemptId,revisionId:attempt.revisionId,contentDigest:attempt.contentDigest,expectedVersion:attemptSubmitted.version!,rationale:'Verify synthetic demonstration only; no delivery acceptance or skills certification',selfReview:false},checkpointPreview=await quota.run(()=>previewPartnerCheckpoint(reviewer,review));await quota.run(()=>decidePartnerCheckpoint(reviewer,{...review,requestId:randomUUID(),previewId:checkpointPreview.previewId}));assignments.push({actorIndex:evidence.actors.indexOf(partner),assignmentId,checkpointId});
 }
 return {guideId:saved.targetId!,revisionId:draft.revisionId,assignments,quotaWaitMs:quota.elapsedMs,quotaResets:0};
}
