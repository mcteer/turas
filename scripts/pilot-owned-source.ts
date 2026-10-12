import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {artifactIntentBatchSchema,artifactVersionDtoSchema,artifactLifecycleActionSchema} from '../lib/contracts/artifacts';
import {profileCommandSchema} from '../lib/contracts/profiles';
const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
const proposalSchema=z.object({recordId:z.uuid(),revisionId:z.uuid(),reviewState:z.literal('pending'),selectionId:z.uuid()});
/** Fixed synthetic source and ordinary review. Actual local executor admission
 * is mandatory; this cannot authorize hosted scanner/parser spending. */
export async function runOwnedSourceJourney(input:{scope:PilotHostedScope;db:Client;customerId:string;workloadId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;uploadBytes:(intentId:string,bytes:Buffer)=>Promise<void>;runQueuedExtraction:(versionId:string)=>Promise<void>;readOriginal:(versionId:string,expected:Buffer)=>Promise<void>}){
 const {scope,db,customerId,workloadId,signal,request}=input;
 if(new URL(scope.origin).hostname!=='127.0.0.1'||!scope.environmentMarker.startsWith('test-pilot-')||process.env.TURAS_PILOT_OWNED!=='1'||process.env.TURAS_JOB_EXECUTOR!=='local')throw Error('Source execution is owned local only; no hosted paid admission implemented');
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
 let reviewed:unknown;try{reviewed=unwrap(await request('/api/customers/'+customerId+'/commands','POST',decision));}catch(error){const receipt=z.object({action:z.literal('accept_revision'),status:z.number().int(),result:z.unknown()}).parse(unwrap(await request('/api/customers/'+customerId+'/commands/'+reviewKey,'GET')));if(receipt.status<200||receipt.status>=300)throw error;reviewed=receipt.result;}
 const accepted=z.object({recordId:z.uuid(),revisionId:z.uuid(),reviewState:z.literal('accepted')}).parse(reviewed);
 if(accepted.recordId!==proposal.recordId||accepted.revisionId!==proposal.revisionId)throw Error('Exact accepted uploaded source identity differs');
 return {contract:'pilot-owned-source-v1',journey:'J004',versionId:view.id,lifecycleGeneration:view.lifecycleGeneration,profileRevisionId:proposal.revisionId,profileRecordId:proposal.recordId,selectionId:proposal.selectionId,sourceBytes:original.length,actualOriginalVerified:true,normalCommands:5,providerCalls:0,hostedProof:false,fullSourceJourneyVerified:false};
}
export function sourceWithdrawalCommand(lifecycleGeneration:number){return artifactLifecycleActionSchema.parse({action:'withdraw',expectedGeneration:lifecycleGeneration,reason:'End controlled synthetic source demonstration',idempotencyKey:randomUUID()});}
