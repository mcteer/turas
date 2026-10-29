import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {PilotHostedResponseError} from './pilot-hosted-request';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {artifactIntentBatchSchema,artifactVersionDtoSchema,artifactLifecycleActionSchema} from '../lib/contracts/artifacts';
import {profileCommandSchema} from '../lib/contracts/profiles';
const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
const proposalSchema=z.object({recordId:z.uuid(),revisionId:z.uuid(),reviewState:z.literal('pending'),selectionId:z.uuid()});
export async function reconcileOriginalAcceptedProfileReceipt(input:{
 request:(path:string,method:'GET')=>Promise<unknown>;path:string;
 signal:AbortSignal;firstPostFailure:unknown;
}){
 const failures:unknown[]=[];
 for(let attempt=0;attempt<3;attempt++){
  try{input.signal.throwIfAborted();}catch(error){throw new AggregateError([input.firstPostFailure,...failures,error],'Original acceptance receipt aborted; POST was not replayed',{cause:input.firstPostFailure});}
  let receipt:{action:'accept_revision';status:number;result:unknown};
  try{receipt=z.object({action:z.literal('accept_revision'),status:z.number().int(),result:z.unknown()}).parse(unwrap(await input.request(input.path,'GET')));}
  catch(error){
   failures.push(error);
   if(error instanceof PilotHostedResponseError&&error.status===503&&error.releaseMatches&&attempt<2){
    try{await delay(100,undefined,{signal:input.signal});}catch(abort){throw new AggregateError([input.firstPostFailure,...failures,abort],'Original acceptance receipt aborted; POST was not replayed',{cause:input.firstPostFailure});}continue;
   }
   throw new AggregateError([input.firstPostFailure,...failures],'Original acceptance receipt unresolved; POST was not replayed',{cause:input.firstPostFailure});
  }
  if(receipt.status<200||receipt.status>=300)throw input.firstPostFailure;
  // Safe metadata only. Private harness logs retain the first POST failure even
  // when its original committed receipt is later confirmed; logging cannot fail reconciliation.
  try{console.warn(JSON.stringify({event:'pilot.original_acceptance_receipt_confirmed',postFailureName:input.firstPostFailure instanceof Error&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(input.firstPostFailure.name)?input.firstPostFailure.name:'Error',postFailureStatus:input.firstPostFailure instanceof PilotHostedResponseError?input.firstPostFailure.status:null,receiptStatus:receipt.status,receiptReadAttempts:attempt+1,postReplayCount:0}));}catch{/* Passive metadata cannot change the confirmed receipt. */}
  return receipt.result;
 }
 throw new AggregateError([input.firstPostFailure,...failures],'Original acceptance receipt unresolved; POST was not replayed',{cause:input.firstPostFailure});
}
/** Shared normal synthetic recipe. The caller must separately admit its
 * actual executor and financial scope; this function grants no provider authority. */
export async function runSyntheticSourceRecipe(input:{scope:PilotHostedScope;db:Client;customerId:string;workloadId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;uploadBytes:(intentId:string,bytes:Buffer)=>Promise<void>;runQueuedExtraction:(versionId:string)=>Promise<void>;readOriginal:(versionId:string,expected:Buffer)=>Promise<void>}){
 const {scope,db,customerId,workloadId,signal,request}=input;
 for(const id of [customerId,workloadId])z.uuid().parse(id);
 const rows=(await db.query('SELECT c.synthetic FROM customer_references c JOIN customer_workloads w ON w.customer_id=c.id AND w.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND w.id=$3',[customerId,scope.workspaceId,workloadId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic source scope required');
 signal.throwIfAborted();
 const conversation=z.object({id:z.uuid(),customerId:z.uuid()}).parse(unwrap(await request('/api/conversations','POST',{customerId,requestKey:randomUUID(),title:'Synthetic uploaded linked source'})));
 if(conversation.customerId!==customerId)throw Error('Exact source conversation required');
 const original=Buffer.from('Controlled synthetic pilot source. The synthetic workload serves public web requests. This fixture is not actual customer evidence.');
 const batch=z.object({intents:z.array(z.object({id:z.uuid()})).length(1)}).parse(unwrap(await request('/api/artifacts/intents','POST',artifactIntentBatchSchema.parse({conversationId:conversation.id,customerId,workloadId,idempotencyKey:randomUUID(),files:[{name:'synthetic-linked-source.txt',expectedSizeBytes:original.length,declaredType:'text/plain',sourcePublishedOn:null,sourceObservedOn:null,rightsNote:'Controlled synthetic source created for the owned linked pilot check',audience:'delivery',dataCategory:'delivery_context'}]}))));
 const intentId=batch.intents[0].id;await input.uploadBytes(intentId,original);
 const completed=z.object({versionId:z.uuid(),state:z.literal('completed')}).parse(unwrap(await request('/api/artifacts/intents/'+intentId+'/complete','POST',{idempotencyKey:randomUUID()})));
 await input.runQueuedExtraction(completed.versionId);
 const view=artifactVersionDtoSchema.parse(unwrap(await request('/api/artifacts/'+completed.versionId,'GET')));
 if(view.id!==completed.versionId||view.state!=='ready'||!view.canPropose||!view.publishedRunId||view.sizeBytes!==original.length)throw Error('Actual complete source extraction required');
 await input.readOriginal(view.id,original);
 const units=z.object({items:z.array(z.object({id:z.uuid(),text:z.string().min(1)})).min(1).max(20)}).parse(unwrap(await request('/api/artifacts/'+view.id+'/units?limit=20','GET')));
 const unit=units.items[0],excerpt=unit.text;if(excerpt!==original.toString('utf8'))throw Error('Exact located original excerpt required');
 const proposalKey=randomUUID(),command=profileCommandSchema.parse({action:'propose_record',requestKey:proposalKey,workloadId,requestedAudience:'delivery',dataCategory:'delivery_context',qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic source author',directnessRationale:'Located synthetic original passage',corroborationRationale:'Synthetic demonstration only',informationType:'adoption_process',dateBasis:'observation'},payload:{kind:'product_use',productKey:'synthetic-uploaded-'+randomUUID(),displayName:'Synthetic uploaded source claim',state:'actual',usageDescription:excerpt,observedAt:new Date(Date.now()-1000).toISOString(),evidenceRevisionIds:[]}});
 const body={selection:{versionId:view.id,runId:view.publishedRunId,lifecycleGeneration:view.lifecycleGeneration,ranges:[{unitId:unit.id,start:0,end:Array.from(excerpt).length}],excerpt,excerptDigest:createHash('sha256').update(excerpt).digest('hex'),audience:'delivery',dataCategory:'delivery_context'},command};
 // On uncertainty, read the exact original receipt and stop. Do not submit a
 // replacement proposal or guess a selection identity from customer records.
 let proposed:unknown;try{proposed=unwrap(await request('/api/artifacts/'+view.id+'/proposals','POST',body));}catch(error){await request('/api/customers/'+customerId+'/commands/'+proposalKey,'GET').catch(()=>undefined);throw error;}
 const proposal=proposalSchema.parse(proposed);
 const queue=z.object({pending:z.array(z.object({id:z.uuid(),recordId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),recordVersion:z.number().int().nonnegative(),currentAcceptedRevisionId:z.uuid().nullable()})).max(20)}).parse(unwrap(await request('/api/customers/'+customerId+'/review?limit=20','GET')));
 const candidate=queue.pending.find(row=>row.id===proposal.revisionId);
 if(!candidate||candidate.recordId!==proposal.recordId||candidate.currentAcceptedRevisionId!==null)throw Error('Exact pending uploaded source review required');
 const reviewKey=randomUUID();const decision=profileCommandSchema.parse({action:'accept_revision',requestKey:reviewKey,revisionId:candidate.id,digest:candidate.contentDigest,expectedRecordVersion:candidate.recordVersion,expectedAcceptedRevisionId:null,rationale:'Operator review of exact located synthetic uploaded source',partnerSafeReason:'Controlled synthetic delivery source',partnerSafeAttestation:'Only synthetic data; no real customer fact',acknowledgeOlderObservation:false});
 let reviewed:unknown;try{reviewed=unwrap(await request('/api/customers/'+customerId+'/commands','POST',decision));}catch(error){reviewed=await reconcileOriginalAcceptedProfileReceipt({request,path:'/api/customers/'+customerId+'/commands/'+reviewKey,signal,firstPostFailure:error});}
 const accepted=z.object({recordId:z.uuid(),revisionId:z.uuid(),reviewState:z.literal('accepted')}).parse(reviewed);
 if(accepted.recordId!==proposal.recordId||accepted.revisionId!==proposal.revisionId)throw Error('Exact accepted uploaded source identity differs');
 return {contract:'pilot-synthetic-source-recipe-v1',journey:'J004',versionId:view.id,extractionRunId:view.publishedRunId,lifecycleGeneration:view.lifecycleGeneration,profileRevisionId:proposal.revisionId,profileRecordId:proposal.recordId,selectionId:proposal.selectionId,sourceBytes:original.length,actualOriginalVerified:true,normalCommands:5,fullSourceJourneyVerified:false};
}
export function sourceWithdrawalCommand(lifecycleGeneration:number){return artifactLifecycleActionSchema.parse({action:'withdraw',expectedGeneration:lifecycleGeneration,reason:'End controlled synthetic source demonstration',idempotencyKey:randomUUID()});}
