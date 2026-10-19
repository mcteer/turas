import {createHash} from 'node:crypto';
import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {retrievalResponseSchema} from '../lib/contracts/retrieval';
import {runHostedProfileFoundation} from './pilot-hosted-foundation';
import {runHostedSourceJourney} from './pilot-hosted-source';
import {runHostedPlanJourney} from './pilot-hosted-plan';
import {runHostedDeliveryReview,runHostedMilestoneReview} from './pilot-hosted-delivery';
import {runHostedReportJourney} from './pilot-hosted-report';
import {pilotHostedRequest} from './pilot-hosted-request';
import {assertHostedPaidAdmission} from './pilot-hosted-paid';
import {runHostedKnowledgeBaseline} from './pilot-hosted-knowledge';
import {uploadPilotOriginal} from './pilot-original-upload';
import {runHostedStaffingCommitment} from './pilot-hosted-staffing';
import {runHostedWorkforceJourney} from './pilot-hosted-workforce';

async function pause(signal:AbortSignal){
 signal.throwIfAborted();await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);done();},2000);const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});});
}
/** Runs the ordinary linked chain; acceptance and file processing are never
 * written by owner SQL or replaced with local executor/renderer callbacks. */
export async function runHostedLinkedJourney(input:{scope:PilotHostedScope;db:Client;headers:Headers;customerId:string;ownerMembershipId:string;configuration:HostedConfiguration;authorizationDigest:string;authorizationExpiresAt:string;authorization?:unknown;signal:AbortSignal;transport?:typeof fetch}){
 const {scope,db,signal}=input,transport=input.transport??fetch;
 if(input.configuration.embeddingProviderConfigured)throw Error('Paid embedding traffic has no authority in this infrastructure journey');
 const request=pilotHostedRequest({scope,headers:input.headers,signal,transport});
 await assertHostedPaidAdmission({...input,requiredJobs:6});
 async function bytes(path:string,maximum:number){
  const response=await transport(new URL(path,scope.origin),{headers:input.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(response.status!==200||response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Exact hosted file unavailable or serving release differs');}
  const reader=response.body?.getReader();if(!reader)throw Error('Actual hosted file required');const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum)throw Error('Hosted file exceeds exact bound');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}return Buffer.concat(parts);
 }
 const foundation=await runHostedProfileFoundation({...input,request});
 const source=await runHostedSourceJourney({...input,workloadId:foundation.workloadId,request,
  uploadBytes:async(intentId,value)=>uploadPilotOriginal({...input,domain:'artifact',id:intentId,bytes:value,contentType:'application/octet-stream',requireBlob:true,transport}),
  runQueuedExtraction:async versionId=>{
   const deadline=Date.now()+300000;
   for(;;){signal.throwIfAborted();const view=z.object({data:z.object({id:z.uuid(),state:z.string()})}).parse(await request('/api/artifacts/'+versionId,'GET')).data;
    if(view.id!==versionId)throw Error('Queued source identity differs');if(view.state==='ready')return;
    if(['failed','cancelled','deleting','deleted','withdrawn','partial'].includes(view.state)||Date.now()>=deadline)throw Error('Actual hosted source extraction incomplete');await pause(signal);
   }
  },readOriginal:async(versionId,expected)=>{if(!(await bytes('/api/artifacts/'+versionId+'/original',expected.length)).equals(expected))throw Error('Actual hosted original bytes differ');},
 });
 const workforce=await runHostedWorkforceJourney(input);
 const knowledge=await runHostedKnowledgeBaseline({...input,sourceRevisionId:source.profileRevisionId,request});
 const search=retrievalResponseSchema.parse(z.object({data:z.unknown()}).parse(await request('/api/retrieval/search','POST',{scope:'customer',customerId:input.customerId,workloadId:foundation.workloadId,query:'controlled synthetic workload serves synthetic public web requests',use:'discovery',limit:5})).data);
 if(search.mode!=='lexical_degraded')throw Error('No paid embedding admitted for this hosted infrastructure journey');
 const cited=search.results.find(row=>row.sourceRevisionId===source.profileRevisionId);if(!cited)throw Error('Ordinary exact reviewed source is not searchable');
 const plan=await runHostedPlanJourney({...input,workloadId:foundation.workloadId,citationId:cited.citationId,expectedSourceRevisionId:source.profileRevisionId,request});
 const staffing=await runHostedStaffingCommitment({...input,workloadId:foundation.workloadId,engagementId:plan.engagementId,planId:plan.planId,baselineId:plan.baselineId,planRevisionId:plan.revisionId,resourceId:workforce.resourceId,skillId:workforce.skillId,request});
 const delivery=await runHostedDeliveryReview({...input,engagementId:plan.engagementId,baselineId:plan.baselineId,request});
 const milestone=await runHostedMilestoneReview({...input,engagementId:plan.engagementId,baselineId:plan.baselineId,activityRevisionId:delivery.revisionId,request});
 const artifactIds:string[]=[];
 const reports=await runHostedReportJourney({...input,engagementId:plan.engagementId,workloadId:foundation.workloadId,request,authorRequest:request,
  runQueuedRender:async revisionId=>{
   const job=(await db.query("SELECT id,deadline_at FROM report_jobs WHERE environment_id=$1 AND revision_id=$2 AND kind='render'",[scope.environmentMarker,revisionId])).rows;
   if(job.length!==1)throw Error('Exact normally queued hosted report required');const deadline=Date.now()+300000;
   for(;;){signal.throwIfAborted();const state=(await db.query('SELECT state FROM report_jobs WHERE id=$1',[job[0].id])).rows[0]?.state;
    if(state==='completed')return;if(['failed','cancelled'].includes(state)||Date.now()>=deadline)throw Error('Actual hosted report rendering incomplete');await pause(signal);
   }
  },readArtifact:async artifact=>{artifactIds.push(artifact.id);const actual=await bytes('/api/reports/artifacts/'+artifact.id,artifact.sizeBytes);if(actual.length!==artifact.sizeBytes||createHash('sha256').update(actual).digest('hex')!==artifact.contentDigest||actual.subarray(0,artifact.format==='pdf'?5:2).toString()!==(artifact.format==='pdf'?'%PDF-':'PK'))throw Error('Actual hosted report artifact differs');},
 });
 return {contract:'pilot-hosted-linked-chain-v1',customerId:input.customerId,foundation,source,workforce,knowledge,plan,staffing,delivery,milestone,reports,artifactIds,citationId:cited.citationId,normalReviewOnly:true,modelCalls:0,outboundSendAttempts:0,humanFeedbackRecorded:false,fullHostedCatalogVerified:false};
}
