"use client";
import {upload} from '@vercel/blob/client';
/** Upload transport only; domain completion/review remains with each caller. */
export async function uploadPrivateOriginal(input:{domain:'artifact'|'workforce';id:string;file:File;csrfToken:string;localContentType:string}):Promise<Response>{
 const base=input.domain==='artifact'?`/api/artifacts/intents/${input.id}`:`/api/staffing/imports/${input.id}`;
 const headers={'content-type':'application/json','x-csrf-token':input.csrfToken};
 const prepared=await fetch(base+'/upload',{method:'POST',cache:'no-store',headers,body:JSON.stringify({type:'prepare'})});if(!prepared.ok)return prepared;
 const data=(await prepared.json() as {data?:{strategy?:string;capabilityId?:string;pathname?:string;sizeBytes?:number}}).data;
 if(data?.strategy==='local')return fetch(base+(input.domain==='artifact'?'/bytes':'/content'),{method:'PUT',headers:{'content-type':input.localContentType,'x-csrf-token':input.csrfToken},body:input.file});
 if(data?.strategy!=='blob'||!data.capabilityId||!data.pathname||data.sizeBytes!==input.file.size||!/^e_[a-f0-9]{64}\/(artifact-staging|workforce-staging)\/[a-f0-9-]{36,64}$/.test(data.pathname))throw Error('Upload preparation unavailable');
 await upload(data.pathname,new Blob([input.file],{type:'application/octet-stream'}),{access:'private',handleUploadUrl:base+'/upload',clientPayload:JSON.stringify({capabilityId:data.capabilityId}),headers:{'x-csrf-token':input.csrfToken}});
 return fetch(base+'/upload',{method:'POST',cache:'no-store',headers,body:JSON.stringify({type:'finish',capabilityId:data.capabilityId})});
}
