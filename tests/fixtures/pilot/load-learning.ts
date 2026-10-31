import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {learningQuarterWindows} from '../../../lib/learning/metric-protocols';
import {learningMeasurementSchema} from '../../../lib/contracts/learning';
import {learningMeasurementFrame} from '../../../lib/server/learning/measurement-sources';
import {createLearningMeasurement,readLearningMeasurement,reviewLearningMeasurement} from '../../../lib/server/learning/measurements';
import {saveRegister,submitRegister,reviewRegister} from '../execution/registers';
import type {pilotLoadEvidenceFixture} from './load';
import type {pilotLoadDeliveryBaseFixture} from './load-delivery';
/** A synthetic measured outcome and its exact quarter frame receive independent
 * ordinary execution and measurement review in the owned disposable database.
 * The synthetic records prove no actual customer benefit. */
export async function pilotLoadLearningFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>,delivery:Awaited<ReturnType<typeof pilotLoadDeliveryBaseFixture>>){
 requireOwnedPilotDatabase(process.env,true);const author=evidence.actors[1],reviewer=evidence.actors[0],customerId=evidence.customers[0].id,workloadId=randomUUID(),revisionId=evidence.customers[0].revisionIds[0];
 await db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic fixed load workload')",[workloadId,evidence.workspaceId,customerId]);
 const source=(await db.query("SELECT source_generation,content_digest FROM retrieval_sources WHERE source_revision_id=$1 AND audience='delivery' AND lifecycle_state='current'",[revisionId])).rows[0];if(!source)throw Error('Normally accepted learning source unavailable');
 const windows=learningQuarterWindows('deployment_lead_time','2026-Q3',new Date()),placeholder={sourceKind:'accepted_execution' as const,revisionId:randomUUID(),generation:1,digest:'a'.repeat(64),fieldPath:'/narrative'};
 const input=learningMeasurementSchema.parse({contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,customerId,metricId:'deployment_lead_time',protocolVersion:'deployment-lead-time-v1',quarter:'2026-Q3',workloadIds:[workloadId],outcomeRevisionIds:[placeholder.revisionId],populationRule:'All successful Production deployments across the predeclared workloads, without selection',baseline:{...windows.baseline,totalMinutes:'2000',deployments:100,failedDeployments:null,fieldLocators:[placeholder]},current:{...windows.current,totalMinutes:'1000',deployments:100,failedDeployments:null,fieldLocators:[placeholder]}});
 const scope={author,reviewer,engagementId:delivery.engagementId,baselineId:delivery.baselineId};
 const record=await saveRegister(scope,{title:'Synthetic fixed load comparable outcome',narrative:JSON.stringify(learningMeasurementFrame(input)),kind:'outcome',audience:'delivery',eventDate:'2026-10-01',timezone:'UTC',workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Synthetic operating owner not assigned',references:[{id:randomUUID(),kind:'accepted_profile',sourceRevisionId:revisionId,generation:Number(source.source_generation),contentDigest:source.content_digest,locator:{kind:'profile_field',fieldPath:'usageDescription'}}],status:'observed',measure:'deployment-lead-time-v1',unit:'minutes',baselineValue:'20',currentValue:'10',comparisonValue:null,baselineUnknownReason:null,comparisonUnknownReason:'No relative comparison supplied',measurementStart:'2026-07-01',measurementEnd:'2026-09-30',limitationReason:'Controlled synthetic observations do not establish actual benefit or causation'});
 const submitted=await submitRegister(scope,record);await reviewRegister(scope,submitted);
 const exact={...placeholder,revisionId:record.revisionId,digest:record.contentDigest};input.outcomeRevisionIds=[record.revisionId];input.baseline.fieldLocators=[exact];input.current.fieldLocators=[exact];
 const created=await createLearningMeasurement(author,input);if(!created.targetId)throw Error('Normal load measurement creation unavailable');const view=await readLearningMeasurement(reviewer,created.targetId);if(!view.content||!view.canReview)throw Error('Exact load measurement review unavailable');
 await reviewLearningMeasurement(reviewer,created.targetId,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version,revisionId:view.revisionId,closureDigest:view.closureDigest,decision:'approve',reuseApproved:true,rationale:'Review exact controlled synthetic quarter frame; exclude from actual customer outcomes'});
 return {measurementId:created.targetId,workloadId,outcomeRevisionId:record.revisionId};
}
