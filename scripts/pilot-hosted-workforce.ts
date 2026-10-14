import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {runSyntheticWorkforceRecipe} from './pilot-workforce-recipe';
import {assertHostedPaidAdmission,verifyHostedPaidJobs} from './pilot-hosted-paid';
import {uploadPilotOriginal} from './pilot-original-upload';
import {pilotHostedRequest} from './pilot-hosted-request';
export async function runHostedWorkforceJourney(input:{scope:PilotHostedScope;db:Client;headers:Headers;configuration:HostedConfiguration;authorizationDigest:string;authorizationExpiresAt:string;signal:AbortSignal;transport?:typeof fetch}){
 const {scope,signal}=input,transport=input.transport??fetch,request=pilotHostedRequest({...input,transport});
 await assertHostedPaidAdmission({...input,requiredJobs:2});
 const recipe=await runSyntheticWorkforceRecipe({...input,request,
  uploadOriginal:async(importId,bytes)=>uploadPilotOriginal({...input,domain:'workforce',id:importId,bytes,contentType:'text/csv',requireBlob:true,transport}),
  runQueuedImport:async(sourceVersionId,importId)=>{
   const deadline=Date.now()+300000;
   for(;;){
    signal.throwIfAborted();const state=z.object({data:z.object({sourceVersionId:z.uuid(),job:z.object({state:z.string()}).nullable(),extraction:z.object({complete:z.boolean()}).nullable()})}).parse(await request('/api/staffing/imports/'+importId,'GET')).data;
    if(state.sourceVersionId!==sourceVersionId)throw Error('Actual queued workforce source differs');
    if(state.extraction?.complete)return;
    if(['failed','cancelled'].includes(state.job?.state??'')||Date.now()>=deadline)throw Error('Actual hosted workforce processing incomplete');
    await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);done();},2000);const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});});
   }
  },
  readOriginal:async(importId,expected)=>{
   const response=await transport(new URL('/api/staffing/imports/'+importId+'/content',scope.origin),{headers:input.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
   if(response.status!==200||response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Exact hosted workforce original unavailable');}
   const reader=response.body?.getReader();if(!reader)throw Error('Actual private workforce original required');const parts:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>expected.length)throw Error('Workforce original exceeds expected bound');parts.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
   if(!Buffer.concat(parts).equals(expected))throw Error('Actual workforce original bytes differ');
  },
 });
 const jobs=await verifyHostedPaidJobs({...input,domainKind:'workforce',domainJobIds:[recipe.jobId],expectedImageDigests:[input.configuration.images.scanner,input.configuration.images.parser].map(image=>image.split('@sha256:')[1])});
 return {...recipe,contract:'pilot-hosted-workforce-review-v1',actualProviderJobs:jobs,providerCalls:jobs.length,hostedProof:true};
}
