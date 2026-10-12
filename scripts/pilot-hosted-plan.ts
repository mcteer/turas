import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import {editablePlanSectionKeys,planDraftContentSchema} from '../lib/contracts/plan-content';
import {planCreateSchema,planSubmitSchema,planDecisionSchema} from '../lib/contracts/plans';
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
 const accepted=decisionSchema.parse(await command('/api/plans/'+created.planId+'/decisions',planDecisionSchema.parse({requestKey:randomUUID(),action:'accept',revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Operator review of the controlled synthetic linked plan',deliverySuitabilityConfirmed:true}),decisionSchema));
 if(accepted.planId!==created.planId||accepted.revisionId!==created.revisionId)throw Error('Accepted linked plan differs');
 const current=z.object({data:z.object({planId:z.uuid(),acceptedRevisionId:z.uuid(),engagementId:z.uuid(),reviewState:z.literal('accepted'),contentAvailability:z.literal('readable')})}).parse(await request('/api/plans/'+created.planId,'GET')).data;
 if(current.planId!==created.planId||current.acceptedRevisionId!==created.revisionId||current.engagementId!==accepted.engagementId)throw Error('Ordinary accepted plan read differs');
 return {contract:'pilot-hosted-plan-v1',journey:'J006',planId:created.planId,revisionId:created.revisionId,sourceRevisionId:original.sourceRevisionId,engagementId:accepted.engagementId,baselineId:accepted.baselineId,normalCommands:4,providerCalls:0,fullLinkedJourneyVerified:false};
}
