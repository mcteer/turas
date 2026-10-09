"use client";
import { useEffect,useRef,useState } from "react";
import { partnerContractVersion,type PartnerReceipt } from "../../../lib/contracts/partners";
import type { PartnerClientScope,PartnerClientSession } from "./revalidation";
type Pending={contractVersion:typeof partnerContractVersion;requestId:string;targetId:string|null};
const validId=(id:unknown)=>typeof id==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const prefix="turas.partner.pending:";
function readPending(namespace:string){try{const raw=sessionStorage.getItem(prefix+namespace);if(!raw)return null;const p=JSON.parse(raw);if(p.contractVersion!==partnerContractVersion||!validId(p.requestId)||p.targetId!==null&&!validId(p.targetId)||Object.keys(p).some(k=>!["contractVersion","requestId","targetId"].includes(k)))throw Error();return p as Pending;}catch{return null;}}
export function usePartnerMutations(view:PartnerClientScope|null,session:PartnerClientSession|null,onClear:()=>void,onConfirmed:()=>Promise<void>){
 const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState("");const active=useRef<Pending|null>(null),namespace=useRef<string|null>(null),controller=useRef<AbortController|null>(null);
 const persist=(p:Pending|null)=>{active.current=p;setPending(p);if(namespace.current){if(p)sessionStorage.setItem(prefix+namespace.current,JSON.stringify(p));else sessionStorage.removeItem(prefix+namespace.current);}};
 useEffect(()=>{if(!view)return;if(namespace.current!==view.commandNamespace){controller.current?.abort();namespace.current=view.commandNamespace;const remembered=readPending(view.commandNamespace);active.current=remembered;setPending(remembered);setStatus(remembered?"A previous request is unconfirmed. Check its status before continuing.":"");}},[view]);
 useEffect(()=>{const cleared=()=>{controller.current?.abort();active.current=null;namespace.current=null;setPending(null);setBusy(false);setStatus("");};window.addEventListener("turas.partner.access-cleared",cleared);return()=>{controller.current?.abort();window.removeEventListener("turas.partner.access-cleared",cleared);};},[]);
 const lastReconciled=useRef<object|null>(null);
 useEffect(()=>{if(view&&session&&active.current&&!busy&&lastReconciled.current!==view){lastReconciled.current=view;void reconcile();}},[view,session,busy]);
 async function mutate<T=PartnerReceipt>(path:string,input:Record<string,unknown>,targetId:string|null):Promise<T>{
  if(!view||!session||active.current||busy)throw Error("Check current access and any pending request first.");const requestId=crypto.randomUUID(),scope=view.commandNamespace,abort=new AbortController();controller.current=abort;namespace.current=scope;persist({contractVersion:partnerContractVersion,requestId,targetId});setBusy(true);setStatus("");
  try{const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},body:JSON.stringify({...input,contractVersion:partnerContractVersion,requestId}),signal:abort.signal});const envelope=await response.json();
   if(namespace.current!==scope||envelope.data&&envelope.data.commandNamespace!==scope)throw Error("The account changed. Check the request under its original account.");
   if(!response.ok){if(response.status<500){persist(null);if([401,403,404].includes(response.status)){for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key);onClear();}}throw Error(envelope.error?.message??"Request unconfirmed. Check its status before continuing.");}
   if(envelope.data?.contractVersion!==partnerContractVersion||!envelope.data.requestId&&!envelope.data.previewId||envelope.data.requestId&&envelope.data.requestId!==requestId)throw Error("Request unconfirmed. Check its status before continuing.");persist(null);return envelope.data as T;
  }catch(error){setStatus(error instanceof Error?error.message:"Request unconfirmed. Check its status before continuing.");throw error;}finally{setBusy(false);controller.current=null;}
 }
 async function reconcile(resolve=false){if(!active.current||!session||!view)return;const remembered=active.current,scope=view.commandNamespace;setBusy(true);
  try{const response=await fetch(`/api/partners/requests/${remembered.requestId}`,{method:resolve?"POST":"GET",cache:"no-store",credentials:"same-origin",...(resolve?{headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},body:JSON.stringify({expectedVersion:0})}:{})});const envelope=await response.json();if(namespace.current!==scope)return;
   if([401,403,404,410].includes(response.status)){persist(null);onClear();setStatus("The old request is unavailable under current access.");return;}if(!response.ok)throw Error("Request remains unconfirmed.");const receipt=envelope.data;if(receipt.requestId!==remembered.requestId||receipt.commandNamespace!==scope)throw Error("Request remains unconfirmed.");if(["committed","abandoned","retired"].includes(receipt.outcome)){if(receipt.outcome==="committed"){await onConfirmed();if(namespace.current!==scope)return;}persist(null);setStatus(receipt.outcome==="committed"?"Request confirmed.":"Old request resolved. Start a new action when ready.");}else setStatus(receipt.outcome==="not_found"?"No committed request was found. Resolve the old request before starting a new action.":"Request is still pending.");
  }catch(error){setStatus(error instanceof Error?error.message:"Request remains unconfirmed.");}finally{setBusy(false);}
 }
 return {pending,busy,status,mutate,reconcile};
}
