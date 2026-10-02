"use client";
import { useEffect,useRef,useState,useSyncExternalStore } from "react";
import type { ExecutionResult } from "../../../lib/server/execution/commands";
export type ExecutionClientSnapshot=Readonly<{busy:boolean;message:string;uncertainKey:string|null;denied:boolean}>;
type Receipt=ExecutionResult&{requestKey:string};
type Fetcher=(url:string,options?:RequestInit)=>Promise<Response>;
export class ExecutionCommandClient {
  private listeners=new Set<()=>void>();private sequence=0;private confirmation:(()=>void)|undefined;
  snapshot:ExecutionClientSnapshot={busy:false,message:'',uncertainKey:null,denied:false};
  constructor(private csrf:string,private fetcher:Fetcher,private completed:(receipt:Receipt)=>void|Promise<void>,private denied:()=>void=()=>{}){}
  setCsrf(value:string){if(value)this.csrf=value;}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.snapshot;
  private change(patch:Partial<ExecutionClientSnapshot>){this.snapshot={...this.snapshot,...patch};for(const listener of this.listeners)listener();}
  clearAuthority(){++this.sequence;this.confirmation=undefined;this.change({busy:false,uncertainKey:null,denied:true,message:'Current access unavailable. Sign in or refresh access.'});this.denied();}
  private receipt(raw:unknown,key:string):Receipt {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Unconfirmed receipt');
    const value=raw as Partial<Receipt>;
    if(value.requestKey!==key||value.state!=='committed'||!Number.isSafeInteger(value.executionGeneration)||value.executionGeneration!<1||!Array.isArray(value.changed))throw new Error('Unconfirmed receipt');
    return value as Receipt;
  }
  async save(url:string,body:object,confirmation?:()=>void):Promise<boolean>{
    if(this.snapshot.busy||this.snapshot.uncertainKey||this.snapshot.denied)return false;
    const key=crypto.randomUUID(),ticket=++this.sequence,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
    this.confirmation=confirmation;this.change({busy:true,message:''});
    try{
      const response=await this.fetcher(url,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-csrf-token':this.csrf},body:JSON.stringify({...body,requestKey:key})});
      const envelope=await response.json() as {data?:unknown;error?:{message?:string}};
      if(ticket!==this.sequence)return false;
      if([401,403,404].includes(response.status)){this.clearAuthority();return false;}
      if(!response.ok){if(response.status>=500)throw new Error('Unknown save');this.confirmation=undefined;this.change({message:envelope.error?.message??'Change was not saved. Refresh and review.'});return false;}
      const receipt=this.receipt(envelope.data,key);this.confirmation?.();this.confirmation=undefined;this.change({message:'Saved.'});
      try{await this.completed(receipt);}catch{this.change({message:'Saved. Refresh to read the current result.'});}return true;
    }catch{if(ticket===this.sequence)this.change({uncertainKey:key,message:'Save is unconfirmed. Check its receipt before making another change.'});return false;}
    finally{clearTimeout(timer);if(ticket===this.sequence)this.change({busy:false});}
  }
  async reconcile():Promise<boolean>{
    if(this.snapshot.busy||!this.snapshot.uncertainKey||this.snapshot.denied)return false;
    const key=this.snapshot.uncertainKey,ticket=++this.sequence,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
    this.change({busy:true});
    try{
      const response=await this.fetcher(`/api/execution/receipts/${key}`,{cache:'no-store',signal:controller.signal});
      const envelope=await response.json() as {data?:unknown};if(ticket!==this.sequence)return false;
      if([401,403].includes(response.status)){this.clearAuthority();return false;}
      if(!response.ok)throw new Error('Unconfirmed receipt');const receipt=this.receipt(envelope.data,key);
      this.change({uncertainKey:null,message:'Save confirmed.'});this.confirmation?.();this.confirmation=undefined;
      try{await this.completed(receipt);}catch{this.change({message:'Save confirmed. Refresh to read the current result.'});}return true;
    }catch{if(ticket===this.sequence)this.change({message:'Save remains unconfirmed. Check again before making another change.'});return false;}
    finally{clearTimeout(timer);if(ticket===this.sequence)this.change({busy:false});}
  }
}
export function useExecutionCommand(csrf:string,completed:(receipt:Receipt)=>Promise<void>,denied:()=>void){
  const handlers=useRef({completed,denied});handlers.current={completed,denied};
  const [client]=useState(()=>new ExecutionCommandClient(csrf,(url,options)=>fetch(url,options),r=>handlers.current.completed(r),()=>handlers.current.denied()));
  useEffect(()=>client.setCsrf(csrf),[client,csrf]);
  const snapshot=useSyncExternalStore(client.subscribe,client.getSnapshot,client.getSnapshot);
  return {...snapshot,save:client.save.bind(client),reconcile:client.reconcile.bind(client),clearAuthority:client.clearAuthority.bind(client)};
}
/** Sequence fences stop a delayed old eligibility response restoring withdrawn
 * content. The caller clears derived content on denial and retains only its own safe draft. */
export function useExecutionRefresh(read:(force?:boolean)=>Promise<void>){
  const latest=useRef(read);latest.current=read;
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')void latest.current();};
    const revalidate=()=>{if(document.visibilityState==='visible')void latest.current(true);};
    refresh();const timer=window.setInterval(refresh,5000);window.addEventListener('focus',revalidate);document.addEventListener('visibilitychange',revalidate);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',revalidate);document.removeEventListener('visibilitychange',revalidate);};
  },[]);
}
