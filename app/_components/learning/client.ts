'use client';
export type LearningAuth={csrfToken:string;membership:{id:string;kind:'internal'|'partner';role:string};workspace:{id:string}};
export class LearningClientFailure extends Error{constructor(message:string,readonly status:number|null){super(message);}}
export async function learningFetch<T>(url:string,options?:RequestInit):Promise<T>{
 let response:Response;try{response=await fetch(url,{cache:'no-store',...options});}catch{throw new LearningClientFailure('Request unconfirmed. Check its status.',null);}
 let body:{data?:T;error?:{message?:string}};try{body=await response.json();}catch{throw new LearningClientFailure('Response unavailable. Check request status.',null);}
 if(!response.ok||body.data===undefined)throw new LearningClientFailure(body.error?.message??'Learning unavailable',response.status);return body.data;
}
export const learningPost=<T>(auth:LearningAuth,url:string,input:unknown,extra:Record<string,string>={})=>learningFetch<T>(url,{method:'POST',headers:{...extra,'content-type':'application/json','x-csrf-token':auth.csrfToken},body:JSON.stringify(input)});
export type LearningReceipt={requestId:string;outcome:string;targetId:string|null;version:number|null};
