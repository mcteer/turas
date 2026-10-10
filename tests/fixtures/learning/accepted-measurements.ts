import {randomUUID,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {learningScopedFixture,learningAcceptedOriginal} from './setup';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {hashSessionToken,type CurrentSession} from '../../../lib/server/auth/sessions';
import {syntheticPlanContent} from '../plans/seed';
import type {PlanDraftContent} from '../../../lib/contracts/plan-content';
import {submitPlanCommand} from '../../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../../lib/server/plans/decisions';
import {withTransaction} from '../../../lib/server/db/client';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {submitExecutionCommand} from '../../../lib/server/execution/service';
import {saveRegister,submitRegister,reviewRegister,executionCommand} from '../execution/registers';
import {learningQuarterWindows} from '../../../lib/learning/metric-protocols';
import {learningMeasurementSchema} from '../../../lib/contracts/learning';
import {learningMeasurementFrame} from '../../../lib/server/learning/measurement-sources';
import {requireOwnedLearningDatabase} from '../../../scripts/learning-environment';
export async function learningMeasurementPopulation(db:PoolClient,count=5){
 requireOwnedLearningDatabase(process.env,true);if(!Number.isInteger(count)||count<1||count>6)throw Error('Bounded synthetic measurement population');
 const scope=await learningScopedFixture(db),membershipId=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url');
 // 008 retains its existing mcteer-only review authority. Do not change that domain.
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')",[membershipId,DEMO_IDS.mcteer,scope.workspaceId]);await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')",[sessionId,DEMO_IDS.mcteer,hashSessionToken(token)]);
 const reviewer:CurrentSession={...scope.actors.admin,principalId:DEMO_IDS.mcteer,membershipId,sessionId,token,loginName:'mcteer'};
 const examples=[[100,'2000','1000'],[1,'10','30'],[1,'7','7'],[1,'20','15'],[1,'10','15'],[1,'1','2']] as const,measurements=[];
 for(let index=0;index<count;index++){
  const customerId=index===0?scope.customerId:randomUUID(),workloadId=randomUUID();if(index)await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic measurement customer',true)",[customerId,scope.workspaceId]);await db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic predeclared workload')",[workloadId,scope.workspaceId,customerId]);
  const original=await learningAcceptedOriginal(db,scope.actors.member,scope.actors.admin,customerId);const projection=await materializeCurrentProjection(db,'accepted_profile',original.sourceRevisionId,'delivery');if(!projection)throw Error('Current original projection required');const projected=(await db.query('SELECT content_digest FROM retrieval_sources WHERE id=$1',[projection])).rows[0];
  const baseline=await withTransaction(async client=>{
   const content=syntheticPlanContent() as PlanDraftContent;content.assertions=[];content.sourceDependencies=[];content.asOf=new Date(Date.now()-10000).toISOString();
   const created=await submitPlanCommand(scope.actors.member,{action:'create',requestKey:randomUUID(),workspaceId:scope.workspaceId,customerId,workloadId:null,audience:'delivery',ownerMembershipId:scope.actors.member.membershipId,content},client);
   const submitted=await submitPlanCommand(scope.actors.member,{action:'submit',requestKey:randomUUID(),planId:created.planId,revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:created.aggregateVersion},client);
   const preview=await createPlanReviewPreview(scope.actors.admin,created.planId,{requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},client);
   const decision=await decidePlan(scope.actors.admin,created.planId,{action:'accept',requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Independently reviewed source-free synthetic planning proposal',deliverySuitabilityConfirmed:true},client);if(!decision.engagementId||!decision.baselineId)throw Error('Accepted synthetic engagement required');return decision;
  });
  await submitExecutionCommand(scope.actors.member,baseline.engagementId!,executionCommand('setup',{baseline:1,plan:baseline.aggregateVersion},{baselineId:baseline.baselineId}));
  const windows=learningQuarterWindows('deployment_lead_time','2026-Q3',new Date()),[deployments,before,after]=examples[index],placeholder={sourceKind:'accepted_execution' as const,revisionId:randomUUID(),generation:1,digest:'a'.repeat(64),fieldPath:'/narrative'};
  const input=learningMeasurementSchema.parse({contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,customerId,metricId:'deployment_lead_time',protocolVersion:'deployment-lead-time-v1',quarter:'2026-Q3',workloadIds:[workloadId],outcomeRevisionIds:[placeholder.revisionId],populationRule:'All successful Production deployments across the predeclared workloads, without selection',baseline:{...windows.baseline,totalMinutes:before,deployments,failedDeployments:null,fieldLocators:[placeholder]},current:{...windows.current,totalMinutes:after,deployments,failedDeployments:null,fieldLocators:[placeholder]}});
  const f={author:scope.actors.member,reviewer,engagementId:baseline.engagementId!,baselineId:baseline.baselineId!};
  const record=await saveRegister(f,{title:'Synthetic accepted comparable outcome',narrative:JSON.stringify(learningMeasurementFrame(input)),kind:'outcome',audience:'delivery',eventDate:'2026-10-01',timezone:'UTC',workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Synthetic owner not assigned',references:[{id:randomUUID(),kind:'accepted_profile',sourceRevisionId:original.sourceRevisionId,generation:original.sourceGeneration,contentDigest:projected.content_digest,locator:{kind:'profile_field',fieldPath:'usageDescription'}}],status:'observed',measure:'deployment-lead-time-v1',unit:'minutes',baselineValue:String(Number(before)/deployments),currentValue:String(Number(after)/deployments),comparisonValue:null,baselineUnknownReason:null,comparisonUnknownReason:'No relative comparison supplied',measurementStart:'2026-07-01',measurementEnd:'2026-09-30',limitationReason:'Observed comparisons do not establish causation'});
  const submitted=await submitRegister(f,record);await reviewRegister(f,submitted);
  const exact={...placeholder,revisionId:record.revisionId,digest:record.contentDigest};input.outcomeRevisionIds=[record.revisionId];input.baseline.fieldLocators=[exact];input.current.fieldLocators=[exact];measurements.push({input,original,record});
 }
 await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[scope.workspaceId]);return {...scope,reviewer,measurements};
}
