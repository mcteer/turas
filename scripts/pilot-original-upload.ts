import {put,type HandleUploadBody} from '@vercel/blob/client';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {objectKey} from '../lib/server/storage/private-objects';
import {pilotHostedRequest} from './pilot-hosted-request';
/** Same prepared capability and finish protocol as the UI. The client receives
 * a narrowly scoped upload token, never the store's read/write credential. */
export async function uploadPilotOriginal(input:{scope:PilotHostedScope;headers:Headers;domain:'artifact'|'workforce';id:string;bytes:Buffer;contentType:string;signal:AbortSignal;requireBlob:boolean;transport?:typeof fetch;clientPut?:typeof put}){
 if(input.requireBlob&&process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Hosted original requires disabled Blob SDK retries');
 const {scope,signal}=input,transport=input.transport??fetch,request=pilotHostedRequest({...input,transport});z.uuid().parse(input.id);
 if(input.bytes.length<1||input.bytes.length>10485760)throw Error('Bounded original bytes required');
 const base=input.domain==='artifact'?'/api/artifacts/intents/'+input.id:'/api/staffing/imports/'+input.id;
 const prepared=z.object({data:z.discriminatedUnion('strategy',[z.object({strategy:z.literal('local')}),z.object({strategy:z.literal('blob'),capabilityId:z.uuid(),pathname:z.string().max(1024),sizeBytes:z.number().int().positive(),validUntil:z.number().int().positive(),contentType:z.literal('application/octet-stream')})])}).parse(await request(base+'/upload','POST',{type:'prepare'})).data;
 if(prepared.strategy==='local'){
  if(input.requireBlob)throw Error('Hosted original refused local fallback');
  const headers=new Headers(input.headers);headers.set('content-type',input.contentType);headers.set('content-length',String(input.bytes.length));
  const response=await transport(new URL(base+(input.domain==='artifact'?'/bytes':'/content'),scope.origin),{method:'PUT',headers,body:new Uint8Array(input.bytes),redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  try{if(![200,204].includes(response.status)||response.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Exact local original transport unavailable');}finally{await response.body?.cancel();}return;
 }
 const namespace=input.domain==='artifact'?'artifact-staging':'workforce-staging',suffix=prepared.pathname.split('/').at(-1)!;
 if(prepared.pathname!==objectKey(scope.environmentMarker,namespace,suffix)||prepared.sizeBytes!==input.bytes.length||prepared.validUntil<=Date.now()||prepared.validUntil>Date.now()+600000)throw Error('Exact current original capability required');
 const body:HandleUploadBody={type:'blob.generate-client-token',payload:{pathname:prepared.pathname,multipart:false,clientPayload:JSON.stringify({capabilityId:prepared.capabilityId})}};
 const issued=z.object({type:z.literal('blob.generate-client-token'),clientToken:z.string().min(1).max(16384)}).parse(await request(base+'/upload','POST',body));
 signal.throwIfAborted();const result=await (input.clientPut??put)(prepared.pathname,new Blob([new Uint8Array(input.bytes)],{type:'application/octet-stream'}),{access:'private',token:issued.clientToken,contentType:'application/octet-stream',multipart:false,abortSignal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
 if(result.pathname!==prepared.pathname)throw Error('Uploaded private object identity differs');
 await request(base+'/upload','POST',{type:'finish',capabilityId:prepared.capabilityId});
}
