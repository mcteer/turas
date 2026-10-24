import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import {editablePlanSectionKeys,planDraftContentSchema} from '../lib/contracts/plan-content';
import {planCreateSchema,planSubmitSchema,planDecisionSchema,planSaveRevisionSchema} from '../lib/contracts/plans';
import {citationLocatorSchema} from '../lib/contracts/retrieval';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';

const identity=z.object({planId:z.uuid(),revisionId:z.uuid(),aggregateVersion:z.number().int().positive(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/)});
const citation=z.object({citationId:z.uuid(),sourceKind:z.literal('accepted_profile'),sourceRevisionId:z.uuid(),sourceGeneration:z.number().int().positive(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(2000),locators:z.array(citationLocatorSchema).min(1).max(50),validUntil:z.iso.datetime({offset:true})});

export function syntheticHostedPlanContent(source:z.infer<typeof citation>){
 const dependencyId=randomUUID(),effort={state:'unknown' as const,reason:'Synthetic demonstration; estimate after discovery'};
 return planDraftContentSchema.parse({title:'Synthetic pilot linked delivery plan',asOf:new Date(Date.now()-1000).toISOString(),
  sections:editablePlanSectionKeys.map(key=>({key,state:'content',narrative:'Synthetic pilot demonstration of '+key+'; no real customer or production adoption claim.'})),
  assertions:[{key:'reviewed_source',kind:'accepted_fact',text:source.text,sourceDependencyIds:[dependencyId],decisionCritical:false}],
  sourceDependencies:[{id:dependencyId,kind:'accepted_profile',sourceRevisionId:source.sourceRevisionId,generation:source.sourceGeneration,contentDigest:source.contentDigest,locator:source.locators[0],citationId:source.citationId}],
  diagrams:[{key:'synthetic_context',kind:'context',textEquivalent:'Synthetic browser sends a controlled request to the synthetic application.',nodes:[{key:'browser',label:'Synthetic browser'},{key:'application',label:'Synthetic application'}],edges:[{key:'request',from:'browser',to:'application',label:'Controlled HTTPS request'}]}],
  designDecisions:[{key:'bounded_trial',title:'Synthetic bounded trial',chosen:'Controlled synthetic trial',alternatives:'Defer the trial',rationale:'Demonstrate the review boundary',testing:'Inspect synthetic outputs',rollback:'Retract the synthetic trial',ownerRole:'Synthetic pilot operator'}],
  workPackages:[{key:'proof',title:'Synthetic value proof',track:'value',ownerRole:'Synthetic pilot operator',exitEvidence:'Reviewed synthetic demonstration',effort},{key:'readiness',title:'Synthetic production readiness',track:'production',ownerRole:'Synthetic pilot operator',exitEvidence:'Reviewed synthetic rollback demonstration',effort}],
  milestones:[{key:'proof_reviewed',title:'Synthetic proof reviewed',track:'value',ownerRole:'Synthetic pilot operator',exitEvidence:'Reviewed synthetic demonstration',customerValidation:'Synthetic pilot operator reviews the demonstration',plannedDate:null,plannedDateUnknownReason:'This is a controlled synthetic demonstration',dependencies:[],effort}],reusedSolutions:[]});
}
/** The supplied transport: supplied transport must enforce exact release, bounded JSON,
 * redirects disabled and cancellation. SQL checks scope, never accepted state. */
export async function runHostedPlanJourney(input:{scope:PilotHostedScope;db:Client;customerId:string;workloadId:string;ownerMembershipId:string;citationId:string;expectedSourceRevisionId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>}){
 const {scope,db,customerId,workloadId,ownerMembershipId,signal,request}=input;
 for(const value of [customerId,workloadId,ownerMembershipId,input.citationId,input.expectedSourceRevisionId])z.uuid().parse(value);
 const rows=(await db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[customerId,scope.workspaceId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic plan scope required');
 signal.throwIfAborted();
 const original=citation.parse(z.object({data:z.unknown()}).parse(await request('/api/retrieval/citations/'+input.citationId,'GET')).data);
 if(original.citationId!==input.citationId||original.sourceRevisionId!==input.expectedSourceRevisionId||Date.parse(original.validUntil)<=Date.now())throw Error('Exact current linked profile citation required');
 const content=syntheticHostedPlanContent(original);
 async function command(path:string,body:{requestKey:string;[key:string]:unknown},schema:z.ZodType){
  try{return schema.parse(z.object({data:z.unknown()}).parse(await request(path,'POST',body)).data);}
  catch{return schema.parse(z.object({data:z.unknown()}).parse(await request('/api/plans/commands/'+body.requestKey+'?customerId='+customerId,'GET')).data);}
 }
 const created=identity.parse(await command('/api/plans',planCreateSchema.parse({requestKey:randomUUID(),workspaceId:scope.workspaceId,customerId,workloadId,audience:'delivery',ownerMembershipId,content}),identity));
 const submitted=identity.extend({reviewState:z.literal('in_review')}).parse(await command('/api/plans/'+created.planId+'/submit',planSubmitSchema.parse({requestKey:randomUUID(),expectedAggregateVersion:created.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest}),identity.extend({reviewState:z.literal('in_review')})));
 if(submitted.planId!==created.planId||submitted.revisionId!==created.revisionId||submitted.contentDigest!==created.contentDigest)throw Error('Submitted linked plan differs');
 const previewSchema=identity.extend({previewId:z.uuid(),readiness:z.object({ready:z.literal(true)})});
 const preview=previewSchema.parse(await command('/api/plans/'+created.planId+'/review-preview',{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},previewSchema));
 if(preview.planId!==created.planId||preview.revisionId!==created.revisionId||preview.contentDigest!==created.contentDigest||preview.aggregateVersion!==submitted.aggregateVersion)throw Error('Exact linked review preview differs');
 const decisionSchema=z.object({planId:z.uuid(),revisionId:z.uuid(),action:z.literal('accept'),engagementId:z.uuid(),baselineId:z.uuid()});
 const acceptanceInput=planDecisionSchema.parse({requestKey:randomUUID(),action:'accept',revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Operator review of the controlled synthetic linked plan',deliverySuitabilityConfirmed:true});
 const accepted=decisionSchema.parse(await command('/api/plans/'+created.planId+'/decisions',acceptanceInput,decisionSchema));
 if(accepted.planId!==created.planId||accepted.revisionId!==created.revisionId)throw Error('Accepted linked plan differs');
 const replayed=decisionSchema.parse(await command('/api/plans/'+created.planId+'/decisions',acceptanceInput,decisionSchema));
 if(JSON.stringify(replayed)!==JSON.stringify(accepted))throw Error('Original accepted plan replay differs');
 const current=z.object({data:z.object({planId:z.uuid(),acceptedRevisionId:z.uuid(),engagementId:z.uuid(),reviewState:z.literal('accepted'),contentAvailability:z.literal('readable')})}).parse(await request('/api/plans/'+created.planId,'GET')).data;
 if(current.planId!==created.planId||current.acceptedRevisionId!==created.revisionId||current.engagementId!==accepted.engagementId)throw Error('Ordinary accepted plan read differs');
 const head=z.object({aggregate_version:z.coerce.number().int().positive(),working_revision_id:z.uuid(),accepted_revision_id:z.uuid()}).parse((await db.query('SELECT aggregate_version,working_revision_id,accepted_revision_id FROM delivery_plans WHERE id=$1 AND workspace_id=$2',[created.planId,scope.workspaceId])).rows[0]);
 if(head.accepted_revision_id!==created.revisionId||head.working_revision_id!==created.revisionId)throw Error('Original accepted plan head differs');
 const revised=identity.parse(await command('/api/plans/'+created.planId+'/revisions',planSaveRevisionSchema.parse({requestKey:randomUUID(),expectedAggregateVersion:head.aggregate_version,parentRevisionId:head.working_revision_id,baseAcceptedRevisionId:head.accepted_revision_id,content:{...content,title:'Synthetic pilot revised linked delivery plan'},changeReason:'Explicit synthetic revision preserves reviewed scope and unknown estimates'}),identity));
 if(revised.revisionId===created.revisionId)throw Error('Distinct revised plan required');
 const revisionSubmitted=identity.extend({reviewState:z.literal('in_review')}).parse(await command('/api/plans/'+created.planId+'/submit',planSubmitSchema.parse({requestKey:randomUUID(),expectedAggregateVersion:revised.aggregateVersion,revisionId:revised.revisionId,contentDigest:revised.contentDigest}),identity.extend({reviewState:z.literal('in_review')})));
 const revisionPreview=previewSchema.parse(await command('/api/plans/'+created.planId+'/review-preview',{requestKey:randomUUID(),expectedAggregateVersion:revisionSubmitted.aggregateVersion,revisionId:revised.revisionId,contentDigest:revised.contentDigest},previewSchema));
 if(revisionPreview.planId!==created.planId||revisionPreview.revisionId!==revised.revisionId||revisionPreview.contentDigest!==revised.contentDigest||revisionPreview.aggregateVersion!==revisionSubmitted.aggregateVersion)throw Error('Exact revision preview differs');
 const revisionAccepted=decisionSchema.parse(await command('/api/plans/'+created.planId+'/decisions',planDecisionSchema.parse({requestKey:randomUUID(),action:'accept',revisionId:revised.revisionId,contentDigest:revised.contentDigest,expectedAggregateVersion:revisionSubmitted.aggregateVersion,reviewPreviewId:revisionPreview.previewId,engagementId:accepted.engagementId,rationale:'Separate operator review of the exact synthetic plan revision',deliverySuitabilityConfirmed:true}),decisionSchema));
 const revisedCurrent=z.object({data:z.object({acceptedRevisionId:z.uuid(),engagementId:z.uuid(),reviewState:z.literal('accepted'),contentAvailability:z.literal('readable')})}).parse(await request('/api/plans/'+created.planId,'GET')).data;
 if(revisionAccepted.planId!==created.planId||revisionAccepted.revisionId!==revised.revisionId||revisionAccepted.engagementId!==accepted.engagementId||revisionAccepted.baselineId===accepted.baselineId||revisedCurrent.acceptedRevisionId!==revised.revisionId||revisedCurrent.engagementId!==accepted.engagementId)throw Error('Ordinary accepted plan revision differs');
 return {contract:'pilot-hosted-plan-v1',journey:'J006',planId:created.planId,revisionId:revised.revisionId,originalRevisionId:created.revisionId,originalBaselineId:accepted.baselineId,duplicateAcceptanceReplayVerified:true,acceptedRevisionVerified:true,sourceRevisionId:original.sourceRevisionId,engagementId:accepted.engagementId,baselineId:revisionAccepted.baselineId,normalCommands:8,replayedCommands:1,providerCalls:0,fullLinkedJourneyVerified:false};
}
