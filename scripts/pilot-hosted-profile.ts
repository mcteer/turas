import {randomUUID} from 'node:crypto';
import type {Client as Database} from 'pg';
import {z} from 'zod';
import {profileCommandSchema,type ProfileCommand} from '../lib/contracts/profiles';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';

/** Fixed synthetic review boundary through normal authenticated commands. SQL
 * checks scope only; no accepted state or human feedback is inserted by SQL. */
export async function runHostedProfileReviewJourney(input:{scope:PilotHostedScope;db:Database;headers:Headers;customerId:string;signal:AbortSignal;transport?:typeof fetch}){
 const {scope,db,headers,customerId,signal}=input,transport=input.transport??fetch,origin=new URL(scope.origin).origin;
 const rows=(await db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[customerId,scope.workspaceId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic profile scope required');
 const base='/api/customers/'+z.uuid().parse(customerId),cases:string[]=[];
 async function request(path:string,method:'GET'|'POST',body?:unknown){
  signal.throwIfAborted();
  const response=await transport(origin+base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(response.headers.get('x-turas-code-version')!==scope.sourceCommit||!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Hosted profile response unavailable or release differs');}
  const reader=response.body?.getReader();if(!reader)throw Error('Hosted profile body unavailable');let bytes=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>1048576)throw Error('Hosted profile response exceeds bound');chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString());}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 }
 async function command(value:ProfileCommand){
  const parsed=profileCommandSchema.parse(value);
  // Reconcile only the original request key after an uncertain response. Never
  // issue a replacement mutation or count an absent receipt as success.
  try{return z.object({data:z.unknown()}).parse(await request('/commands','POST',parsed)).data;}
  catch{const receipt=z.object({data:z.object({action:z.string(),status:z.number().int(),result:z.unknown()})}).parse(await request('/commands/'+parsed.requestKey,'GET')).data;
   if(receipt.action!==parsed.action||receipt.status<200||receipt.status>=300)throw Error('Original profile command not confirmed');return receipt.result;}
 }
 const proposal=z.object({recordId:z.uuid(),revisionId:z.uuid(),reviewState:z.literal('pending')});
 const reviewed=z.object({recordId:z.uuid(),revisionId:z.uuid(),recordVersion:z.number().int().nonnegative(),reviewState:z.literal('accepted')});
 const pending=z.object({id:z.uuid(),recordId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),recordVersion:z.number().int().nonnegative(),currentAcceptedRevisionId:z.uuid().nullable()});
 async function queue(revisionId:string){
  const page=z.object({data:z.object({pending:z.array(pending),nextCursor:z.string().nullable()})}).parse(await request('/review?limit=20','GET')).data;
  const row=page.pending.find(item=>item.id===revisionId);if(!row)throw Error('Exact review candidate unavailable in bounded queue');return row;
 }
 async function facts(){return z.object({data:z.object({customer:z.object({id:z.uuid(),synthetic:z.literal(true)}),acceptedFacts:z.array(z.object({id:z.uuid(),recordId:z.uuid()}))})}).parse(await request('/profile','GET')).data;}
 const productKey='pilot-review-'+randomUUID(),observedAt=new Date(Date.now()-1000).toISOString();
 const fields={workloadId:null,requestedAudience:'delivery' as const,dataCategory:'delivery_context' as const,evidenceRevisionIds:[],qualityInput:{rubricVersion:'evidence-quality-v1' as const,R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic operator observation',directnessRationale:'Direct demonstration in the synthetic pilot',corroborationRationale:'Synthetic validation only',informationType:'adoption_process' as const,dateBasis:'observation' as const}};
 const payload={kind:'product_use' as const,productKey,displayName:'Synthetic pilot review boundary',state:'evaluating' as const,usageDescription:'Synthetic demonstration; not a customer adoption claim',observedAt,evidenceRevisionIds:[]};
 const first=proposal.parse(await command({action:'propose_record',requestKey:randomUUID(),...fields,payload}));
 const before=await facts();if(before.customer.id!==customerId||before.acceptedFacts.some(row=>row.recordId===first.recordId))throw Error('Pending proposal appeared as accepted fact');cases.push('pending-is-not-fact');
 async function accept(candidate:z.infer<typeof proposal>,prior:string|null){
  const row=await queue(candidate.revisionId);if(row.recordId!==candidate.recordId||row.currentAcceptedRevisionId!==prior)throw Error('Exact review lineage differs');
  const result=reviewed.parse(await command({action:'accept_revision',requestKey:randomUUID(),revisionId:row.id,digest:row.contentDigest,expectedRecordVersion:row.recordVersion,expectedAcceptedRevisionId:prior,rationale:'Operator review of a controlled synthetic pilot demonstration',partnerSafeReason:'Controlled synthetic demonstration',partnerSafeAttestation:'Contains synthetic delivery context only',acknowledgeOlderObservation:false}));
  if(result.recordId!==candidate.recordId||result.revisionId!==candidate.revisionId)throw Error('Accepted profile identity differs');return result;
 }
 const accepted=await accept(first,null);
 if(!(await facts()).acceptedFacts.some(row=>row.id===first.revisionId&&row.recordId===first.recordId))throw Error('Accepted revision not current');cases.push('exact-review-accepted');
 const correction=proposal.parse(await command({action:'propose_revision',requestKey:randomUUID(),recordId:first.recordId,expectedRecordVersion:accepted.recordVersion,expectedAcceptedRevisionId:first.revisionId,...fields,payload:{...payload,state:'retired',usageDescription:'Corrected synthetic demonstration; no customer adoption claim'}}));
 const corrected=await accept(correction,first.revisionId),after=await facts();
 if(after.acceptedFacts.some(row=>row.id===first.revisionId)||!after.acceptedFacts.some(row=>row.id===correction.revisionId))throw Error('Correction failed to replace accepted revision');cases.push('correction-current');
 const retracted=z.object({recordId:z.uuid(),revisionId:z.uuid(),state:z.literal('retracted'),recordVersion:z.number().int().nonnegative()}).parse(await command({action:'retract_revision',requestKey:randomUUID(),revisionId:correction.revisionId,expectedRecordVersion:corrected.recordVersion,rationale:'End the controlled synthetic review boundary demonstration'}));
 if(retracted.recordId!==first.recordId||retracted.revisionId!==correction.revisionId||(await facts()).acceptedFacts.some(row=>row.recordId===first.recordId))throw Error('Retraction left an accepted fact');cases.push('retraction-current');
 return {contract:'pilot-hosted-profile-review-v1',journey:'J003',cases:cases.map(id=>({id,state:'pass' as const})),passedCases:cases.length,providerCalls:0,normalProfileCommands:5,syntheticOnly:true,fullLinkedJourneyVerified:false};
}
