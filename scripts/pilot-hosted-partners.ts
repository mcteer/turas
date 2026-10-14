import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import {partnerCheckpointCommandSchema,partnerCheckpointReviewSchema,partnerCheckpointDecisionSchema,partnerAttemptContentSchema,partnerContractVersion,partnerGuideDraftCommandSchema,partnerGuideReviewSchema,partnerGuideReviewCommandSchema,partnerAssignmentReviewSchema,partnerAssignmentCommandSchema,partnerGuideContentSchema} from '../lib/contracts/partners';
const viewSchema=z.object({assignmentId:z.uuid(),customerId:z.uuid(),membershipId:z.uuid(),version:z.number().int().nonnegative(),availability:z.literal('eligible'),checkpoints:z.array(z.object({checkpointId:z.uuid(),attempts:z.array(z.object({attemptId:z.uuid(),revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),state:z.string(),currentCredit:z.boolean()}))})),progress:z.object({verifiedRequired:z.number().int(),totalRequired:z.number().int(),percentage:z.number()})});
type Request=(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;
/** Existing exact assignment only. Normal partner submission and separate
 * administrator review; no SQL acceptance, provider work or human feedback. */
export async function runPartnerTraining(input:{db:Client;workspaceId:string;customerId:string;assignmentId:string;membershipId:string;content:unknown;partnerRequest:Request;reviewerRequest:Request;signal:AbortSignal}){
 const {db,workspaceId,customerId,assignmentId,membershipId,partnerRequest,reviewerRequest,signal}=input;
 for(const id of [workspaceId,customerId,assignmentId,membershipId])z.uuid().parse(id);
 const rows=(await db.query(`SELECT c.synthetic FROM customer_references c JOIN partner_learning_assignments a ON a.customer_id=c.id AND a.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND a.id=$3 AND a.membership_id=$4 AND a.state='active'`,[customerId,workspaceId,assignmentId,membershipId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic partner assignment required');
 const content=partnerAttemptContentSchema.parse(input.content);
 if(!content.sources.some(s=>['accepted_profile','approved_excerpt','accepted_execution'].includes(s.kind)))throw Error('Separately accepted demonstration required');
 const unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 async function read(){signal.throwIfAborted();const view=viewSchema.parse(unwrap(await partnerRequest('/api/partners/assignments/'+assignmentId,'GET')));if(view.assignmentId!==assignmentId||view.customerId!==customerId||view.membershipId!==membershipId)throw Error('Partner assignment differs');return view;}
 async function command(request:Request,body:Record<string,unknown>){signal.throwIfAborted();let result:unknown;try{result=unwrap(await request('/api/partners/commands','POST',body));}catch(error){try{result=unwrap(await request('/api/partners/requests/'+body.requestId,'GET'));}catch{throw error;}}
  const receipt=z.object({requestId:z.uuid(),outcome:z.literal('committed'),targetId:z.uuid(),version:z.number().int().nonnegative()}).parse(result);if(receipt.requestId!==body.requestId||receipt.targetId!==assignmentId)throw Error('Original partner command receipt differs');return receipt;
 }
 let view=await read();if(view.checkpoints.length!==1||view.checkpoints[0].attempts.length!==0||view.progress.totalRequired!==1||view.progress.verifiedRequired!==0)throw Error('Fresh single-checkpoint demonstration required');
 const checkpointId=view.checkpoints[0].checkpointId;
 await command(partnerRequest,partnerCheckpointCommandSchema.parse({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:view.version,action:'checkpoint.save',assignmentId,checkpointId,content}));
 view=await read();const attempt=view.checkpoints[0].attempts[0];if(!attempt||attempt.state!=='draft'||attempt.currentCredit||view.progress.percentage!==0)throw Error('Draft became verified learning');
 await command(partnerRequest,partnerCheckpointCommandSchema.parse({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:view.version,action:'checkpoint.submit',assignmentId,checkpointId,attemptId:attempt.attemptId,revisionId:attempt.revisionId,contentDigest:attempt.contentDigest}));
 view=await read();if(view.checkpoints[0].attempts[0]?.state!=='submitted'||view.progress.percentage!==0)throw Error('Submission became verified learning');
 const review=partnerCheckpointReviewSchema.parse({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:view.version,action:'checkpoint.verify',assignmentId,checkpointId,attemptId:attempt.attemptId,revisionId:attempt.revisionId,contentDigest:attempt.contentDigest,rationale:'Review the exact independently accepted synthetic demonstration',selfReview:false});
 const preview=z.object({previewId:z.uuid(),assignmentId:z.uuid(),version:z.number().int().nonnegative()}).parse(unwrap(await reviewerRequest('/api/partners/previews','POST',review)));
 if(preview.assignmentId!==assignmentId||preview.version!==view.version)throw Error('Exact checkpoint preview differs');
 await command(reviewerRequest,partnerCheckpointDecisionSchema.parse({...review,requestId:randomUUID(),previewId:preview.previewId}));
 view=await read();if(view.checkpoints[0].attempts[0]?.state!=='verified'||!view.checkpoints[0].attempts[0]?.currentCredit||view.progress.verifiedRequired!==1||view.progress.percentage!==100)throw Error('Reviewed demonstration not currently verified');
 return {contract:'pilot-partner-training-v1',journey:'J013',assignmentId,checkpointId,attemptId:attempt.attemptId,normalCommands:3,reviewPreviews:1,providerCalls:0,learningIsNotDeliveryAcceptance:true,humanFeedbackRecorded:false,fullPartnerJourneyVerified:false};
}

export async function runPartnerGuide(input:{db:Client;workspaceId:string;customerId:string;engagementId:string;baselineId:string;acceptedRevisionId:string;membershipId:string;content:unknown;authorRequest:Request;reviewerRequest:Request;signal:AbortSignal}){
 const {db,workspaceId,customerId,engagementId,baselineId,acceptedRevisionId,membershipId,authorRequest,reviewerRequest,signal}=input;
 for(const id of [workspaceId,customerId,engagementId,baselineId,acceptedRevisionId,membershipId])z.uuid().parse(id);
 const rows=(await db.query(`SELECT c.synthetic FROM customer_references c JOIN engagements e ON e.customer_id=c.id AND e.workspace_id=c.workspace_id JOIN milestone_baselines b ON b.id=e.active_baseline_id WHERE c.id=$1 AND c.workspace_id=$2 AND e.id=$3 AND b.id=$4 AND b.revision_id=$5`,[customerId,workspaceId,engagementId,baselineId,acceptedRevisionId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic accepted partner baseline required');
 const content=partnerGuideContentSchema.parse(input.content),envelope=()=>({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:0});
 const unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 const receiptSchema=z.object({requestId:z.uuid(),targetId:z.uuid(),version:z.number().int().nonnegative(),outcome:z.literal('committed')});
 async function command(request:Request,body:Record<string,unknown>){signal.throwIfAborted();let raw:unknown;try{raw=unwrap(await request('/api/partners/commands','POST',body));}catch(error){try{raw=unwrap(await request('/api/partners/requests/'+body.requestId,'GET'));}catch{throw error;}}const receipt=receiptSchema.parse(raw);if(receipt.requestId!==body.requestId)throw Error('Original guide command differs');return receipt;}
 const created=await command(authorRequest,partnerGuideDraftCommandSchema.parse({...envelope(),action:'guide.create',customerId,engagementId,acceptedRevisionId,baselineId,content}));
 const read=async()=>z.object({guideId:z.uuid(),revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().nonnegative(),reviewState:z.string(),availability:z.literal('eligible')}).parse(unwrap(await authorRequest('/api/partners/guides/'+created.targetId,'GET')));
 let guide=await read();if(guide.guideId!==created.targetId||guide.reviewState!=='draft')throw Error('Exact draft guide required');
 const submitted=await command(authorRequest,partnerGuideDraftCommandSchema.parse({...envelope(),action:'guide.submit',guideId:created.targetId,revisionId:guide.revisionId,contentDigest:guide.contentDigest,expectedVersion:guide.version}));
 const review=partnerGuideReviewSchema.parse({...envelope(),action:'guide.publish',guideId:created.targetId,revisionId:guide.revisionId,contentDigest:guide.contentDigest,expectedVersion:submitted.version,rationale:'Review exact controlled synthetic lesson and original sources',selfReview:false});
 const preview=z.object({previewId:z.uuid(),guideId:z.uuid(),revisionId:z.uuid(),version:z.number().int().nonnegative()}).parse(unwrap(await reviewerRequest('/api/partners/previews','POST',review)));
 if(preview.guideId!==guide.guideId||preview.revisionId!==guide.revisionId||preview.version!==submitted.version)throw Error('Exact guide review preview differs');
 await command(reviewerRequest,partnerGuideReviewCommandSchema.parse({...review,requestId:randomUUID(),previewId:preview.previewId}));
 guide=await read();if(guide.reviewState!=='published')throw Error('Normal guide publication unavailable');
 const assignment=partnerAssignmentReviewSchema.parse({...envelope(),action:'assignment.create',guideId:guide.guideId,revisionId:guide.revisionId,membershipId,rationale:'Assign exact controlled synthetic training guide',selfReview:false});
 const assignmentPreview=z.object({previewId:z.uuid(),guideId:z.uuid(),revisionId:z.uuid(),membershipId:z.uuid(),version:z.literal(0)}).parse(unwrap(await reviewerRequest('/api/partners/previews','POST',assignment)));
 if(assignmentPreview.guideId!==guide.guideId||assignmentPreview.revisionId!==guide.revisionId||assignmentPreview.membershipId!==membershipId)throw Error('Exact partner assignment preview differs');
 const assigned=await command(reviewerRequest,partnerAssignmentCommandSchema.parse({...assignment,requestId:randomUUID(),previewId:assignmentPreview.previewId}));
 return {contract:'pilot-partner-guide-v1',journey:'J013',guideId:guide.guideId,revisionId:guide.revisionId,assignmentId:assigned.targetId,normalCommands:4,reviewPreviews:2,providerCalls:0,fullPartnerJourneyVerified:false};
}
