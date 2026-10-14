import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readHostedBaseline,type HostedBaselineInput,type HostedJourneyRequest as Request} from './pilot-hosted-baseline';
import {expansionCommandSchema,expansionOwnerCommandSchema,expansionSourceSchema} from '../lib/server/expansion/schema';
import {expansionWorkspaceProjectionSchema,expansionReceiptSchema} from '../lib/server/expansion/projection-schema';
import {PilotHostedResponseError} from './pilot-hosted-request';

/** A controlled synthetic hypothesis preserves unknown benefit and use. Exact
 * owner assignment and previews govern defer/reopen/dismiss; qualification must
 * remain denied. No model, research, commercial promise or external action. */
export async function runHostedExpansionBoundary(input:HostedBaselineInput&{authorRequest:Request}){
 const {scope,db,customerId,workloadId,planId,revisionId,engagementId,ownerMembershipId,authorRequest,reviewerRequest,signal}=input;
 const dependency=await readHostedBaseline(input),source=expansionSourceSchema.parse({id:randomUUID(),kind:dependency.kind,sourceRevisionId:dependency.sourceRevisionId,generation:dependency.generation,contentDigest:dependency.contentDigest,locator:dependency.locator});
 const base='/api/expansion/customers/'+customerId,query='?workloadId='+workloadId+'&limit=20';
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 async function read(recordId?:string){signal.throwIfAborted();return expansionWorkspaceProjectionSchema.parse(unwrap(await reviewerRequest(base+query+(recordId?'&recordId='+recordId:''),'GET')));}
 const initial=await read();if(initial.customerId!==customerId||initial.workloadId!==workloadId||initial.records.length||initial.assignment.membershipId!==null||!initial.canManageOwner)throw Error('Fresh synthetic hypothesis and unassigned account owner required');
 let commands=0;
 async function command(path:string,body:{requestKey:string;[key:string]:unknown},request:Request){
  signal.throwIfAborted();let result:unknown;
  try{result=z.object({receipt:z.unknown()}).parse(unwrap(await request(path,'POST',body))).receipt;}
  catch(error){try{result=unwrap(await request('/api/expansion/receipts/'+body.requestKey,'GET'));}catch{throw error;}}
  const value=expansionReceiptSchema.parse(result);if(value.customerId!==customerId||value.operation!==body.operation)throw Error('Original expansion operation differs');commands++;return value;
 }
 const assigned=await command(base+'/owner',expansionOwnerCommandSchema.parse({contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:initial.assignment.version,membershipId:ownerMembershipId,rationale:'Assign the controlled synthetic discovery to its scoped internal owner.'}),reviewerRequest);
 const owned=await read();if(assigned.outcome!=='assigned'||owned.assignment.membershipId!==ownerMembershipId||!owned.assignment.active||owned.assignment.version!==assigned.version)throw Error('Normal account-owner assignment differs');
 const nextReviewDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const content={contractVersion:'expansion-v1',title:'Synthetic pilot expansion discovery',productKey:'synthetic-pilot-product',productLabel:'Synthetic Pilot Product',problemKey:'synthetic-discovery-'+randomUUID(),intent:'new_product',problem:'Controlled synthetic workflow: discover whether any actual expansion need exists.',customerBenefit:'Unknown. This synthetic demonstration establishes no actual customer benefit.',currentUse:{kind:'unknown',reason:'No accepted source establishes use of this synthetic example product.'},benefit:{kind:'unknown',reason:'No benefit, target or commercial outcome has been established.'},assertions:[],unknowns:[{text:'Actual customer need and expected benefit',reason:'The accepted synthetic workload source supports context only.'}],prerequisites:[],constraints:[{text:'No purchase, adoption, financial outcome or commercial stage is established.',sourceKeys:[],unknownReason:'Controlled synthetic example only.'}],alternatives:[{kind:'retain_current_practice',title:'Retain the Current Practice',rationale:'Preserve the reviewed baseline while discovery is incomplete.'}],proposedEngagement:'Synthetic discovery only; no committed engagement.',nextStep:{action:'Review the unknown need and benefit with the actual account owner.',validationCriterion:'Separate eligible evidence and a scoped owner decision are required.',owner:{kind:'membership',membershipId:ownerMembershipId}},nextReviewDate};
 const proposed=await command(base+'/commands',expansionCommandSchema.parse({contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId,expectedVersion:owned.scopeGeneration,content,sourceRefs:[source],selectedEngagementIds:[engagementId],deliveryLinks:[{kind:'plan_revision',planId,revisionId}]}),authorRequest);
 if(!proposed.recordId||!proposed.revisionId||proposed.outcome!=='proposed')throw Error('Normal synthetic hypothesis proposal required');
 const recordId=proposed.recordId,proposedRevisionId=proposed.revisionId;
 function exact(value:Awaited<ReturnType<typeof read>>,disposition:'proposed'|'deferred'|'dismissed'){
  const record=value.records.find(row=>row.id===recordId);
  if(!record||record.workingRevisionId!==proposedRevisionId||record.disposition!==disposition||record.working.availability!=='eligible'||record.working.payload?.content.benefit.kind!=='unknown'||record.working.payload.content.currentUse.kind!=='unknown')throw Error('Current unknown-benefit hypothesis differs');return record;
 }
 async function preview(){
  return z.object({previewDigest:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().positive(),expectedAssignmentVersion:z.number().int().nonnegative(),availability:z.literal('eligible'),allowedActions:z.array(z.enum(['qualify','defer','dismiss','reopen'])),qualificationChecks:z.array(z.string()).min(1)}).parse(unwrap(await reviewerRequest(base+'/preview','POST',{workloadId,recordId,revisionId:proposedRevisionId,kind:'full'})));
 }
 const fresh=exact(await read(recordId),'proposed'),qualification=await preview();
 if(fresh.version!==qualification.expectedVersion||!qualification.allowedActions.includes('qualify'))throw Error('Exact qualification boundary preview required');
 const denied=expansionCommandSchema.parse({contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId,expectedVersion:qualification.expectedVersion,recordId,revisionId:proposedRevisionId,decision:'qualify',rationale:'Verify that a controlled synthetic unknown-benefit hypothesis cannot be qualified.',previewDigest:qualification.previewDigest,expectedAssignmentVersion:qualification.expectedAssignmentVersion});
 let qualificationDenied=false;
 try{await reviewerRequest(base+'/commands','POST',denied);}catch(error){if(error instanceof PilotHostedResponseError&&error.status===409&&error.releaseMatches&&error.errorCode==='qualification_incomplete')qualificationDenied=true;else throw error;}
 const afterDenial=exact(await read(recordId),'proposed');
 if(!qualificationDenied||afterDenial.version!==fresh.version||afterDenial.lastDecision!==null)throw Error('Unknown benefit was qualified or denial remains uncertain');
 for(const [decision,disposition] of [['defer','deferred'],['reopen','proposed'],['dismiss','dismissed'],['reopen','proposed']] as const){
  const review=await preview();if(!review.allowedActions.includes(decision))throw Error('Explicit expansion transition unavailable');
  const result=await command(base+'/commands',expansionCommandSchema.parse({contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId,expectedVersion:review.expectedVersion,recordId,revisionId:proposedRevisionId,decision,rationale:'Controlled synthetic '+decision+'; actual need and benefit remain unestablished.',previewDigest:review.previewDigest,expectedAssignmentVersion:review.expectedAssignmentVersion,...(decision==='defer'?{revisitDate:nextReviewDate}:{})}),reviewerRequest);
  const current=exact(await read(recordId),disposition);
  if(result.recordId!==recordId||result.revisionId!==proposedRevisionId||result.outcome!==disposition||current.lastDecision?.action!==decision||current.version!==result.version)throw Error('Normal expansion decision differs');
 }
 const stored=(await db.query('SELECT disposition,working_revision_id FROM expansion_hypotheses WHERE id=$1 AND workspace_id=$2 AND customer_id=$3',[recordId,scope.workspaceId,customerId])).rows[0];
 if(stored?.disposition!=='proposed'||stored.working_revision_id!==proposedRevisionId)throw Error('Persisted expansion boundary differs');
 return {contract:'pilot-hosted-expansion-boundary-v1',journey:'J011',recordId,revisionId:proposedRevisionId,sourceRevisionId:source.sourceRevisionId,normalCommands:commands,qualificationDenied:true,providerCalls:0,benefit:'unknown',currentUse:'unknown',externalActionsDispatched:0,syntheticOnly:true,fullExpansionJourneyVerified:false,fullHostedCatalogVerified:false};
}
