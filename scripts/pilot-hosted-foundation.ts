import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import {profileCommandSchema} from '../lib/contracts/profiles';
import {reconcileOriginalAcceptedProfileReceipt} from './pilot-source-recipe';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
const candidate=z.object({recordId:z.uuid(),revisionId:z.uuid()});
const accepted=z.object({recordId:z.uuid(),revisionId:z.uuid(),recordVersion:z.number().int().nonnegative(),reviewState:z.literal('accepted')});
const review=z.object({id:z.uuid(),recordId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),recordVersion:z.number().int().nonnegative(),currentAcceptedRevisionId:z.uuid().nullable()});
/** Linked foundation using normal review commands only. Accepted records
 * are synthetic and intentionally retained for the subsequent linked journeys. */
export async function runHostedProfileFoundation(input:{scope:PilotHostedScope;db:Client;customerId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown,timeoutMs?:number)=>Promise<unknown>}){
 const {scope,db,customerId,signal,request}=input;z.uuid().parse(customerId);
 const rows=(await db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[customerId,scope.workspaceId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic linked foundation required');
 const base='/api/customers/'+customerId;
 async function command(value:unknown){signal.throwIfAborted();const body=profileCommandSchema.parse(value);
  // Preserve the original 10s write + 10s confirmation envelope. A busy receipt
  // read may wait behind that still-committing write. Only the exact read is
  // repeated, at most three times; the approval/proposal is never resubmitted.
  const deadline=Date.now()+20000;
  try{return z.object({data:z.unknown()}).parse(await request(base+'/commands','POST',body,10000)).data;}
  catch(error){
   const read=async(path:string,method:'GET')=>{signal.throwIfAborted();const remaining=deadline-Date.now();if(remaining<=0)throw Error('Original linked foundation command unconfirmed');return request(path,method,undefined,Math.min(10000,remaining));};
   const path=base+'/commands/'+body.requestKey;
   if(body.action==='accept_revision')return reconcileOriginalAcceptedProfileReceipt({request:read,path,signal,firstPostFailure:error});
   const original=z.object({data:z.object({action:z.string(),status:z.number().int(),result:z.unknown()})}).parse(await read(path,'GET')).data;
   if(original.action!==body.action||original.status<200||original.status>=300)throw Error('Original linked foundation command unconfirmed');return original.result;
  }
 }
 async function queue(revisionId:string){const page=z.object({data:z.object({pending:z.array(review),nextCursor:z.string().nullable()})}).parse(await request(base+'/review?limit=20','GET')).data;const row=page.pending.find(x=>x.id===revisionId);if(!row)throw Error('Exact linked foundation review candidate unavailable');return row;}
 async function accept(value:z.infer<typeof candidate>){const row=await queue(value.revisionId);if(row.recordId!==value.recordId||row.currentAcceptedRevisionId!==null)throw Error('Linked foundation lineage differs');const result=accepted.parse(await command({action:'accept_revision',requestKey:randomUUID(),revisionId:row.id,digest:row.contentDigest,expectedRecordVersion:row.recordVersion,expectedAcceptedRevisionId:null,rationale:'Operator review of a controlled synthetic linked foundation',partnerSafeReason:'Contains controlled synthetic delivery context only',partnerSafeAttestation:'Synthetic pilot demonstration; no actual customer fact',acknowledgeOlderObservation:false}));if(result.recordId!==value.recordId||result.revisionId!==value.revisionId)throw Error('Accepted linked foundation identity differs');return result;}
 const payload={kind:'workload_details' as const,name:'Synthetic linked pilot workload '+randomUUID().slice(0,8),purpose:'Controlled synthetic linked review, planning, delivery and reporting demonstration'};
 const workload=candidate.extend({workloadId:z.uuid()}).parse(await command({action:'propose_workload',requestKey:randomUUID(),payload}));
 const row=await queue(workload.revisionId);
 if(row.recordId!==workload.recordId||row.currentAcceptedRevisionId!==null)throw Error('Synthetic workload lineage differs');
 const shared=candidate.parse(await command({action:'propose_revision',requestKey:randomUUID(),recordId:workload.recordId,workloadId:workload.workloadId,expectedRecordVersion:row.recordVersion,expectedAcceptedRevisionId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload}));
 await accept(shared);
 const observedAt=new Date(Date.now()-1000).toISOString();
 const fact=candidate.parse(await command({action:'propose_record',requestKey:randomUUID(),workloadId:workload.workloadId,requestedAudience:'delivery',dataCategory:'delivery_context',qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic operator observation',directnessRationale:'Direct controlled synthetic demonstration',corroborationRationale:'Synthetic demonstration only',informationType:'adoption_process',dateBasis:'observation'},payload:{kind:'product_use',productKey:'synthetic-linked-'+randomUUID(),displayName:'Synthetic linked workload',state:'actual',usageDescription:'The controlled synthetic workload serves synthetic public web requests. This is a pilot fixture, not an actual customer adoption claim.',observedAt,evidenceRevisionIds:[]}}));
 await accept(fact);
 const current=z.object({data:z.object({customer:z.object({id:z.uuid(),synthetic:z.literal(true)}),acceptedFacts:z.array(z.object({id:z.uuid(),recordId:z.uuid()}))})}).parse(await request(base+'/profile','GET')).data;
 if(current.customer.id!==customerId||!current.acceptedFacts.some(x=>x.id===fact.revisionId&&x.recordId===fact.recordId))throw Error('Synthetic linked profile fact is not current');
 return {contract:'pilot-hosted-foundation-v1',customerId,workloadId:workload.workloadId,workloadRevisionId:shared.revisionId,profileRecordId:fact.recordId,profileRevisionId:fact.revisionId,normalCommands:5,providerCalls:0,syntheticOnly:true,fullLinkedJourneyVerified:false};
}
