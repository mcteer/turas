import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {executionCommandSchema,executionPreviewSchema,executionRecordSchema} from '../lib/server/execution/schema';
import type {HostedJourneyRequest} from './pilot-hosted-baseline';

/** Ordinary scoped register decisions retain explicit unknown outcomes and an
 * unrecorded receiving acknowledgement. They never invent a customer outcome. */
export async function runHostedDeliveryRegisters(input:{customerId:string;engagementId:string;baselineId:string;activityId:string;activityRevisionId:string;signal:AbortSignal;authorRequest:HostedJourneyRequest;reviewerRequest:HostedJourneyRequest}){
 const {customerId,engagementId,baselineId,signal,authorRequest,reviewerRequest}=input;
 for(const id of [customerId,engagementId,baselineId,input.activityId,input.activityRevisionId])z.uuid().parse(id);
 const base='/api/execution/engagements/'+engagementId,unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 const rowSchema=z.object({id:z.uuid(),revisionId:z.uuid(),revisionNumber:z.number().int().positive(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().positive(),state:z.string()});
 async function view(){signal.throwIfAborted();const value=z.object({engagementId:z.uuid(),customerId:z.uuid(),baselineId:z.uuid(),version:z.number().int().positive()}).parse(unwrap(await reviewerRequest(base,'GET')));if(value.engagementId!==engagementId||value.customerId!==customerId||value.baselineId!==baselineId)throw Error('Exact delivery register baseline required');return value;}
 async function row(id:string){const page=z.object({records:z.array(rowSchema)}).parse(unwrap(await reviewerRequest(base+'/records?recordId='+id+'&limit=1','GET')));if(page.records.length!==1||page.records[0].id!==id)throw Error('Exact delivery register required');return page.records[0];}
 const receiptSchema=z.object({state:z.literal('committed'),requestKey:z.uuid(),changed:z.array(z.object({id:z.uuid(),version:z.number().int().positive()}))});
 let commands=0,replayedCommands=0;
 async function command(raw:unknown,request:HostedJourneyRequest){const body=executionCommandSchema.parse(raw);signal.throwIfAborted();let result:unknown;try{result=unwrap(await request(base+'/commands','POST',body));}catch(error){try{result=unwrap(await request('/api/execution/receipts/'+body.requestKey,'GET'));}catch{throw error;}}const value=receiptSchema.parse(result);if(value.requestKey!==body.requestKey)throw Error('Original register command differs');commands++;return {body,value};}
 const activity=await row(input.activityId);if(activity.state!=='accepted'||activity.revisionId!==input.activityRevisionId)throw Error('Exact accepted activity reference required');
 const reference={id:activity.id,kind:'execution_record',sourceRevisionId:activity.revisionId,generation:activity.revisionNumber,contentDigest:activity.contentDigest};
 const common={title:'Synthetic pilot reviewed delivery register',narrative:'Controlled synthetic workflow observation only; no actual customer result is claimed.',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:['proof_reviewed'],ownerMembershipId:null,unknownOwnerReason:'Receiving ownership remains explicitly unknown in this synthetic exercise',references:[reference]};
 const records=[
  {...common,kind:'raid',raidType:'risk',status:'monitoring',severity:'low',impact:'Synthetic follow-up remains open and owned through explicit unknown ownership',reviewDate:null,unknownDateReason:'No real customer review date is established',acceptedExceptionRationale:null},
  {...common,kind:'scope_change',state:'approved_for_planning',oldBaselineId:baselineId,replacementBaselineId:null,impact:'Controlled proposed discovery remains subject to separate plan acceptance'},
  {...common,kind:'handoff',deliverables:[{milestoneKey:'proof_reviewed',evidenceReferenceId:reference.id}],receiver:{kind:'external',label:'Synthetic receiving owner'},acknowledgement:{state:'not_recorded',eventDate:null,evidenceReferenceIds:[]},openObligationIds:[]},
  {...common,kind:'outcome',status:'not_measured',measure:null,unit:null,currentValue:null,baselineValue:null,comparisonValue:null,baselineUnknownReason:null,comparisonUnknownReason:null,measurementStart:null,measurementEnd:null,limitationReason:'No actual customer measurement was collected; synthetic workflow only'},
 ];
 const accepted=[];
 for(const raw of records){
  const content=executionRecordSchema.parse(raw),head=await view();
  const created=await command({version:'execution-v1',action:'record.create',requestKey:randomUUID(),expectedVersions:{execution:head.version},payload:{baselineId,record:content}},authorRequest);
  if(created.value.changed.length!==2)throw Error('Exact created register identity required');
  const id=created.value.changed[0].id;let current=await row(id),next=await view();
  await command({version:'execution-v1',action:'record.submit',requestKey:randomUUID(),expectedVersions:{execution:next.version,record:current.version},payload:{recordId:id,revisionId:current.revisionId,contentDigest:current.contentDigest}},authorRequest);
  current=await row(id);next=await view();if(current.state!=='submitted')throw Error('Submitted register required');
  const candidate=executionPreviewSchema.parse({version:'execution-v1',action:'record.accept',expectedVersions:{execution:next.version,record:current.version},payload:{recordId:id,revisionId:current.revisionId,contentDigest:current.contentDigest}});
  const preview=z.object({previewDigest:z.string().regex(/^[a-f0-9]{64}$/),previewExpiresAt:z.iso.datetime(),expectedVersions:z.object({execution:z.number().int().positive(),record:z.number().int().positive()})}).parse(unwrap(await reviewerRequest(base+'/preview','POST',candidate)));
  if(preview.expectedVersions.execution!==next.version||preview.expectedVersions.record!==current.version)throw Error('Exact register review preview differs');
  const decision=await command({...candidate,...preview,requestKey:randomUUID(),rationale:'Separate operator review of exact synthetic delivery register and explicit limitations'},reviewerRequest);
  const replay=receiptSchema.parse(unwrap(await reviewerRequest(base+'/commands','POST',decision.body)));replayedCommands++;
  if(JSON.stringify(replay)!==JSON.stringify(decision.value))throw Error('Original register replay differs');
  const final=await row(id);if(final.state!=='accepted'||final.revisionId!==current.revisionId||final.version!==decision.value.changed.find(x=>x.id===id)?.version)throw Error('Exact accepted register differs');
  accepted.push({kind:content.kind,recordId:id,revisionId:final.revisionId,requestKey:decision.body.requestKey});
 }
 return {contract:'pilot-hosted-delivery-registers-v1',journey:'J008',customerId,engagementId,baselineId,accepted,normalCommands:commands,replayedCommands,reviewPreviews:records.length,customerOutcomeEstablished:false,receivingAcknowledgementRecorded:false,providerCalls:0,fullDeliveryJourneyVerified:false};
}
