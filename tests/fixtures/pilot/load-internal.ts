import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {saveSupportProposal} from '../../../lib/server/support/service';
import {createSupportReviewPreview,decideSupportRevision} from '../../../lib/server/support/review';
import {unknownSupportAssessment} from '../support/seed';
import {saveExpansionProposal} from '../../../lib/server/expansion/service';
import {assignExpansionOwner} from '../../../lib/server/expansion/owners';
import {createExpansionPreview,decideExpansionHypothesis} from '../../../lib/server/expansion/review';
import {discoveryHypothesis} from '../expansion';
import {reviewedSyntheticGap,reviewedSuspectedImpact} from '../gaps/authoring';
import {activateLearning} from '../../../scripts/learning-activate';
import type {pilotLoadEvidenceFixture} from './load';
/** Accepted unknowns and deferred hypotheses remain explicit. No inferred
 * maturity, product need, commercial opportunity or learning outcome is created. */
export async function pilotLoadInternalFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>){
 requireOwnedPilotDatabase(process.env,true);const author=evidence.actors[1],reviewer=evidence.actors[0],customerId=evidence.customers[0].id;
 const support=await saveSupportProposal(author,customerId,{contractVersion:'support-v1',operation:'save_assessment',requestKey:randomUUID(),workloadId:null,expectedVersion:0,audience:'delivery',selectedEngagementIds:[],sourceRefs:[],content:unknownSupportAssessment()});
 const supportPreview=await createSupportReviewPreview(reviewer,customerId,{workloadId:null,recordId:support.recordId,revisionId:support.revisionId});
 await decideSupportRevision(reviewer,customerId,{contractVersion:'support-v1',operation:'review_revision',requestKey:randomUUID(),workloadId:null,recordId:support.recordId,revisionId:support.revisionId,expectedVersion:supportPreview.expectedVersion,sourceDigest:supportPreview.sourceDigest,decision:'accept',rationale:'Review controlled synthetic unknowns; operating readiness is not established'});
 const expansion=await saveExpansionProposal(author,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
 await assignExpansionOwner(reviewer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:author.membershipId,rationale:'Explicit synthetic account owner assignment'});
 const expansionPreview=await createExpansionPreview(author,customerId,{workloadId:null,recordId:expansion.recordId,revisionId:expansion.revisionId,kind:'metadata'});
 await decideExpansionHypothesis(author,customerId,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:null,recordId:expansion.recordId,revisionId:expansion.revisionId,expectedVersion:expansion.version,expectedAssignmentVersion:expansionPreview.expectedAssignmentVersion,previewDigest:expansionPreview.previewDigest,decision:'defer',revisitDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),rationale:'Synthetic discovery needs evidence before qualification'});
 const gap=await reviewedSyntheticGap(author,reviewer,{title:'Synthetic fixed load product gap'}),impactId=await reviewedSuspectedImpact(author,reviewer,gap.id,customerId);
 await db.query('INSERT INTO learning_workspace_state(environment_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[process.env.TURAS_ENVIRONMENT_ID,evidence.workspaceId]);
 await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,evidence.workspaceId,true,requireOwnedPilotDatabase(process.env,true));
 return {support,expansion,gapId:gap.id,impactId,learningOutcomePrepared:false,providerCalls:0};
}
