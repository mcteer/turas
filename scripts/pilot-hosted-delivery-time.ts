import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {executionCommandSchema,executionPreviewSchema} from '../lib/server/execution/schema';
import type {HostedJourneyRequest} from './pilot-hosted-baseline';

/** Explicit synthetic effort entered on behalf of the imported resource. This
 * demonstrates effort review, never customer completion or measured benefit. */
export async function runHostedDeliveryTime(input:{customerId:string;engagementId:string;baselineId:string;resourceId:string;activityRevisionId:string;signal:AbortSignal;reviewerRequest:HostedJourneyRequest}){
 const {customerId,engagementId,baselineId,resourceId,activityRevisionId,signal,reviewerRequest:request}=input;
 for(const id of [customerId,engagementId,baselineId,resourceId,activityRevisionId])z.uuid().parse(id);
 const base='/api/execution/engagements/'+engagementId,date=new Date().toISOString().slice(0,10),unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 async function view(){signal.throwIfAborted();const value=z.object({customerId:z.uuid(),engagementId:z.uuid(),baselineId:z.uuid(),version:z.number().int().positive()}).parse(unwrap(await request(base,'GET')));if(value.customerId!==customerId||value.engagementId!==engagementId||value.baselineId!==baselineId)throw Error('Exact time baseline required');return value;}
 const receiptSchema=z.object({state:z.literal('committed'),requestKey:z.uuid(),changed:z.array(z.object({id:z.uuid(),version:z.number().int().positive()}))});
 async function command(raw:unknown){signal.throwIfAborted();const body=executionCommandSchema.parse(raw);let result:unknown;try{result=unwrap(await request(base+'/commands','POST',body));}catch(error){try{result=unwrap(await request('/api/execution/receipts/'+body.requestKey,'GET'));}catch{throw error;}}const receipt=receiptSchema.parse(result);if(receipt.requestKey!==body.requestKey)throw Error('Original time command differs');return {body,receipt};}
 const created=await command({version:'execution-v1',action:'time.create',requestKey:randomUUID(),expectedVersions:{execution:(await view()).version},payload:{time:{baselineId,resourceId,workPackageKey:'proof',serviceDate:date,timezone:'UTC',minutes:30,billable:false,activityRevisionId,allocationRevisionId:null,note:'Controlled synthetic effort input; no actual customer work or outcome is asserted',onBehalfRationale:'Operator transcribes controlled synthetic effort for the imported synthetic resource'}}});
 if(created.receipt.changed.length!==2)throw Error('Exact synthetic time identity required');const id=created.receipt.changed[0].id;
 const rowSchema=z.object({id:z.uuid(),revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().positive(),state:z.string(),approvedRevisionId:z.uuid().nullable(),minutes:z.literal(30),resourceId:z.uuid(),baselineId:z.uuid(),activityRevisionId:z.uuid()});
 async function row(){const page=z.object({entries:z.array(rowSchema)}).parse(unwrap(await request(base+'/time?from='+date+'&to='+date+'&entryId='+id+'&limit=1','GET')));const value=page.entries[0];if(page.entries.length!==1||value.id!==id||value.resourceId!==resourceId||value.baselineId!==baselineId||value.activityRevisionId!==activityRevisionId)throw Error('Exact synthetic time read required');return value;}
 let current=await row();await command({version:'execution-v1',action:'time.submit',requestKey:randomUUID(),expectedVersions:{execution:(await view()).version,time:current.version},payload:{entryId:id,revisionId:current.revisionId,contentDigest:current.contentDigest}});
 current=await row();if(current.state!=='submitted')throw Error('Submitted time required');
 const candidate=executionPreviewSchema.parse({version:'execution-v1',action:'time.approve',expectedVersions:{execution:(await view()).version},payload:{entries:[{entryId:id,revisionId:current.revisionId,contentDigest:current.contentDigest,version:current.version,exceptions:{on_behalf:'Operator verifies synthetic resource attribution',unplanned:'This synthetic effort was not booked against the future allocation',unknown_capacity:'Today has no reviewed synthetic calendar; capacity remains unknown'}}]}});
 const preview=z.object({previewDigest:z.string().regex(/^[a-f0-9]{64}$/),previewExpiresAt:z.iso.datetime(),expectedVersions:z.object({execution:z.number().int().positive()})}).parse(unwrap(await request(base+'/preview','POST',candidate)));
 if(preview.expectedVersions.execution!==candidate.expectedVersions.execution)throw Error('Exact time review version differs');
 const accepted=await command({...candidate,...preview,requestKey:randomUUID(),rationale:'Operator reviews the exact controlled synthetic time and each explicit exception'});
 const replay=receiptSchema.parse(unwrap(await request(base+'/commands','POST',accepted.body)));
 if(JSON.stringify(replay)!==JSON.stringify(accepted.receipt))throw Error('Original time decision replay differs');
 const final=await row();if(final.state!=='approved'||final.approvedRevisionId!==current.revisionId||final.revisionId!==current.revisionId||final.version!==accepted.receipt.changed.find(x=>x.id===id)?.version)throw Error('Exact approved time differs');
 return {contract:'pilot-hosted-delivery-time-v1',journey:'J008',customerId,engagementId,baselineId,resourceId,activityRevisionId,entryId:id,revisionId:final.revisionId,approvalRequestKey:accepted.body.requestKey,serviceDate:date,approvedMinutes:final.minutes,normalCommands:3,replayedCommands:1,reviewPreviews:1,providerCalls:0,customerCompletionEstablished:false};
}
