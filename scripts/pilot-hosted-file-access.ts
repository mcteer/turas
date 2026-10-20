import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {hostedMaximumFilesManifestSchema} from './pilot-hosted-maximum-files';
import {writeEvidence} from './pilot-evidence';
/** Current actual HTTP refusals. Neither provider protection pages nor outages
 * qualify, and response bodies are bounded before parsing or retaining metadata. */
export async function verifyHostedMaximumFileDenials(input:{scope:PilotHostedScope;headers:Headers;role:'internal-admin'|'internal-member'|'assigned-partner';manifest:unknown;signal:AbortSignal;evidenceDirectory:string}){
 const manifest=hostedMaximumFilesManifestSchema.parse(input.manifest);
 for(const key of ['projectId','teamId','target','origin','environmentMarker','workspaceId','sourceCommit','sourceDigest','catalogDigest'] as const)if(manifest.scope[key]!==input.scope[key])throw Error('Exact original file denial scope required');
 const reads=[];
 for(const entry of manifest.originals){
  const path=entry.kind==='artifact'?'/api/artifacts/'+entry.id+'/original':'/api/staffing/imports/'+entry.id+'/content';
  const cases:{name:string;headers:Headers;status:number[]}[]=[];
  if(input.role==='internal-admin'){const anonymous=new Headers(),bypass=input.headers.get('x-vercel-protection-bypass');if(bypass)anonymous.set('x-vercel-protection-bypass',bypass);cases.push({name:'anonymous',headers:anonymous,status:[401]});}
  if(entry.kind==='artifact'&&input.role!=='internal-admin'||entry.kind==='workforce'&&input.role==='assigned-partner')cases.push({name:input.role,headers:input.headers,status:[403,404]});
  for(const probe of cases){
   const response=await fetch(new URL(path,input.scope.origin),{headers:probe.headers,cache:'no-store',redirect:'manual',signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});
   if(!probe.status.includes(response.status)||response.headers.get('x-turas-code-version')!==input.scope.sourceCommit||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Current non-disclosing original refusal unavailable');}
   const reader=response.body?.getReader();if(!reader)throw Error('Actual refusal body required');let size=0;const parts:Uint8Array[]=[];
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>4096)throw Error('Original refusal exceeds metadata bound');parts.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
   const body=z.strictObject({error:z.strictObject({code:z.enum(['authentication_required','forbidden','not_found']),message:z.string().max(200)}),correlationId:z.uuid()}).parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
   if(response.status===401?body.error.code!=='authentication_required':response.status===404?body.error.code!=='not_found':body.error.code!=='forbidden')throw Error('Exact original authorization refusal required');
   reads.push({kind:entry.kind,id:entry.id,role:probe.name,status:response.status,errorCode:body.error.code,protectedBytesDisclosed:0});
  }
 }
 const result={contract:'pilot-hosted-maximum-original-denials-v1',scope:input.scope,role:input.role,reads,modelCalls:0,newProviderJobs:0,fullHostedFileCatalogVerified:false};await writeEvidence(input.evidenceDirectory,'maximum-denials-'+input.role+'.json',result);return result;
}
