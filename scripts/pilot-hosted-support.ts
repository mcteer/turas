import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {supportReadinessKeys,supportReadinessRubricVersion} from '../lib/support/readiness';
import {supportCommandSchema,supportSourceSchema} from '../lib/server/support/schema';
import {supportActionSchema} from '../lib/contracts/support';
import {readHostedBaseline,type HostedBaselineInput,type HostedJourneyRequest as Request} from './pilot-hosted-baseline';

const receipt=z.object({recordId:z.uuid(),revisionId:z.uuid(),operation:z.string(),outcome:z.enum(['proposed','accepted','rejected','withdrawn'])});
const view=z.object({accepted:z.boolean(),revisionId:z.uuid(),contentUnavailable:z.boolean()});
/** Normal review of an explicitly synthetic linked baseline. Unknown support
 * readiness stays unknown; the demonstration records no external handoff or
 * ticket and submits no model/research/embedding request. */
export async function runHostedSupportBoundary(input:HostedBaselineInput&{authorRequest:Request}){
 const {scope,db,customerId,workloadId,engagementId,ownerMembershipId,authorRequest,reviewerRequest,signal}=input;
 const dependency=await readHostedBaseline(input);
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 const base='/api/support/customers/'+customerId,query='?workloadId='+workloadId+'&audience=delivery&limit=20';
 // The independently authorized plan read supplies the actual dependency.
 // Membership-bound retrieval handles are not transferred to another author.
 const source=supportSourceSchema.parse({id:randomUUID(),kind:dependency.kind,sourceRevisionId:dependency.sourceRevisionId,generation:dependency.generation,contentDigest:dependency.contentDigest,locator:dependency.locator});
 const actionView=view.extend({content:supportActionSchema.nullable()});
 const overview=z.object({assessment:view.nullable(),proposal:z.unknown().nullable(),effectiveReadiness:z.string(),actions:z.array(z.object({recordId:z.uuid(),expectedVersion:z.number().int().nonnegative(),accepted:actionView.nullable(),proposal:view.nullable()}))});
 async function read(){signal.throwIfAborted();return overview.parse(unwrap(await reviewerRequest(base+query,'GET')));}
 const before=await read();if(before.assessment!==null||before.proposal!==null||before.actions.length)throw Error('Fresh synthetic support scope required');
 let commands=0;
 async function command(raw:unknown,request:Request){
  signal.throwIfAborted();const body=supportCommandSchema.parse(raw);let result:unknown;
  try{result=z.object({receipt:z.unknown()}).parse(unwrap(await request(base+'/commands','POST',body))).receipt;}
  catch(error){try{result=unwrap(await request('/api/support/receipts/'+body.requestKey,'GET'));}catch{throw error;}}
  const value=receipt.parse(result);if(value.operation!==body.operation)throw Error('Original support operation differs');commands++;return value;
 }
 const date=new Date(),observationDate=date.toISOString().slice(0,10),nextReviewDate=new Date(date.valueOf()+7*86400000).toISOString().slice(0,10);
 const shared={contractVersion:'support-v1',observationDate,nextReviewDate,timezone:'UTC'};
 const proposed=await command({contractVersion:'support-v1',operation:'save_assessment',requestKey:randomUUID(),workloadId,expectedVersion:0,audience:'delivery',sourceRefs:[source],selectedEngagementIds:[engagementId],content:{...shared,title:'Synthetic linked support readiness',rubricVersion:supportReadinessRubricVersion,checks:supportReadinessKeys.map(key=>({key,status:'unknown',rationale:'The controlled synthetic workload source does not establish this support capability.',sourceKeys:[source.id],discoveryNeed:'Review this capability with the actual accountable operator before treating it as ready.'}))}},authorRequest);
 if(proposed.outcome!=='proposed'||(await read()).assessment!==null)throw Error('Pending support assessment became accepted readiness');
 async function accept(candidate:z.infer<typeof receipt>){
  const preview=z.object({sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().nonnegative(),sourceState:z.literal('current')}).parse(unwrap(await reviewerRequest(base+'/preview','POST',{workloadId,recordId:candidate.recordId,revisionId:candidate.revisionId})));
  const reviewed=await command({contractVersion:'support-v1',operation:'review_revision',requestKey:randomUUID(),workloadId,recordId:candidate.recordId,revisionId:candidate.revisionId,sourceDigest:preview.sourceDigest,expectedVersion:preview.expectedVersion,decision:'accept',rationale:'Review of controlled synthetic workflow only; unknown capabilities and external routes remain unknown.'},reviewerRequest);
  if(reviewed.recordId!==candidate.recordId||reviewed.revisionId!==candidate.revisionId||reviewed.outcome!=='accepted')throw Error('Exact support review differs');
 }
 await accept(proposed);const assessment=await read();
 if(assessment.assessment?.revisionId!==proposed.revisionId||!assessment.assessment.accepted||assessment.assessment.contentUnavailable||assessment.effectiveReadiness!=='unknown')throw Error('Unknown support readiness was promoted or withheld');
 const actionContent=supportActionSchema.parse({...shared,title:'Synthetic support discovery checkpoint',desiredOutcome:'Review the unknown synthetic support capabilities with the accountable operator.',rationale:'Accepted workload context is insufficient to claim support readiness.',validationCriterion:'A separately reviewed operator observation is required before marking a capability ready.',priority:'normal',owner:{kind:'membership',membershipId:ownerMembershipId},disposition:'open',outcomeSourceKeys:[],basedOnAssessmentRevisionId:proposed.revisionId,escalation:{trigger:'Revisit if the unknown support route prevents a controlled synthetic handoff.',observedImpact:'Synthetic demonstration only; no actual incident or customer impact is claimed.',accountableRole:'Assigned synthetic support action owner',routeKnown:false,unknownRouteReason:'No accepted source establishes an external support route.',evidenceChecklist:'Obtain a separately reviewed route and operator observation.',nextCheckpointDate:nextReviewDate}});
 const action=await command({contractVersion:'support-v1',operation:'save_action',requestKey:randomUUID(),workloadId,expectedVersion:0,audience:'delivery',sourceRefs:[source],selectedEngagementIds:[engagementId],content:actionContent},authorRequest);
 if(action.outcome!=='proposed'||(await read()).actions.some(row=>row.recordId===action.recordId&&row.accepted))throw Error('Pending support action became accepted');
 await accept(action);const open=(await read()).actions.find(row=>row.recordId===action.recordId);
 if(open?.accepted?.revisionId!==action.revisionId||open.accepted.content?.disposition!=='open')throw Error('Open support action was not separately accepted');
 const deferred=await command({contractVersion:'support-v1',operation:'save_action',requestKey:randomUUID(),workloadId,recordId:action.recordId,expectedVersion:open.expectedVersion,audience:'delivery',sourceRefs:[source],selectedEngagementIds:[engagementId],content:{...actionContent,disposition:'deferred',dispositionRationale:'Controlled synthetic demonstration; actual discovery is still required.',revisitDate:nextReviewDate}},authorRequest);
 const pending=(await read()).actions.find(row=>row.recordId===action.recordId);
 if(deferred.recordId!==action.recordId||deferred.outcome!=='proposed'||pending?.accepted?.revisionId!==action.revisionId||pending.proposal?.revisionId!==deferred.revisionId)throw Error('A proposed support deferral changed accepted disposition');
 await accept(deferred);const current=await read(),accepted=current.actions.find(row=>row.recordId===action.recordId)?.accepted;
 if(accepted?.revisionId!==deferred.revisionId||!accepted.accepted||accepted.contentUnavailable||current.effectiveReadiness!=='unknown'||accepted.content?.disposition!=='deferred'||accepted.content.escalation?.routeKnown!==false||accepted.content.handoff!==undefined)throw Error('Reviewed support action or readiness differs');
 const persisted=(await db.query('SELECT id,accepted_revision_id FROM support_records WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND customer_id=$3',[ [proposed.recordId,action.recordId],scope.workspaceId,customerId])).rows;
 if(persisted.length!==2||!persisted.some(row=>row.id===proposed.recordId&&row.accepted_revision_id===proposed.revisionId)||!persisted.some(row=>row.id===action.recordId&&row.accepted_revision_id===deferred.revisionId))throw Error('Persisted normal support decisions differ');
 return {contract:'pilot-hosted-support-boundary-v1',journey:'J010',assessmentRecordId:proposed.recordId,assessmentRevisionId:proposed.revisionId,actionRecordId:action.recordId,actionRevisionId:deferred.revisionId,sourceRevisionId:source.sourceRevisionId,normalCommands:commands,providerCalls:0,externalHandoffRecorded:false,externalActionsDispatched:0,readiness:'unknown',syntheticOnly:true,fullSupportJourneyVerified:false,fullHostedCatalogVerified:false};
}
