'use client';
import {useEffect,useRef,useState} from 'react';
type PendingReportCommand={url:string;body:Record<string,unknown>};
// Tab memory survives route changes; protected commands are never written to browser storage.
const pendingCommands=new Map<string,PendingReportCommand>();let activeSession='';
export async function reportGet<T>(url:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch(url,{cache:'no-store',signal}),body=await response.json();
 if(!response.ok || !body.data)throw Object.assign(new Error(body.error?.message??'Reports unavailable'),{status:response.status,code:body.error?.code});return body.data;
}
export function useReportCommand(csrfToken:string,onConfirmed:()=>Promise<void>){
 const pending=useRef<PendingReportCommand|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),scope=useRef(0);
 useEffect(()=>{++scope.current;if(csrfToken && activeSession && activeSession!==csrfToken)pendingCommands.clear();if(csrfToken)activeSession=csrfToken;pending.current=pendingCommands.get(csrfToken)??null;setUncertain(Boolean(pending.current));setBusy(false);return()=>{++scope.current;};},[csrfToken]);
 async function dispatch(command:{url:string;body:Record<string,unknown>}){
  const ticket=scope.current;setBusy(true);setMessage('');let received=false;
  try{
   const response=await fetch(command.url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(command.body)});received=true;
   const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error?.message??'Report command failed'),{status:response.status});
   pendingCommands.delete(csrfToken);if(ticket!==scope.current)return null;pending.current=null;setUncertain(false);await onConfirmed();return body.data;
  }catch(error){
   if(ticket!==scope.current)return null;
   if(!received || error instanceof SyntaxError || Number((error as {status?:number}).status)>=500){setUncertain(true);setMessage('The acknowledgement is missing. Check the original request before continuing.');}
   else{pendingCommands.delete(csrfToken);pending.current=null;setUncertain(false);setMessage(error instanceof Error?error.message:'Report command failed');}
   return null;
  }finally{if(ticket===scope.current)setBusy(false);}
 }
 async function save(url:string,body:Record<string,unknown>){if(!csrfToken || busy || pending.current || pendingCommands.has(csrfToken))return null;const command={url,body:{...body,requestKey:crypto.randomUUID()}};pending.current=command;pendingCommands.set(csrfToken,command);return dispatch(command);}
 async function recover(){if(!pending.current || busy)return;const ticket=scope.current;setBusy(true);try{await reportGet(`/api/reports/receipts/${pending.current.body.requestKey}`);pendingCommands.delete(csrfToken);if(ticket!==scope.current)return;pending.current=null;setUncertain(false);setMessage('Original request confirmed.');await onConfirmed();}catch(error){if(ticket===scope.current)setMessage(error instanceof Error?error.message:'Original request is unresolved.');}finally{if(ticket===scope.current)setBusy(false);}}
 async function retryExact(){if(pending.current && !busy)return dispatch(pending.current);return null;}
 return {save,recover,retryExact,busy,uncertain,message,setMessage};
}
