"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { flushSync } from "react-dom";
function belongsToView(node:HTMLElement,endpoint:string){for(let current:HTMLElement|null=node;current;current=current.parentElement)if(current.getAttribute("data-partner-view")===endpoint)return true;return false;}
const tabHidden=()=>document.visibilityState==="hidden";
export type PartnerClientScope={commandNamespace:string;actorPrincipalId:string;actorMembershipId:string};
export type PartnerClientSession={principal:{id:string};membership:{id:string;kind:string;role:string};csrfToken:string};

// Protected bodies are transient. A refresh always removes the old projection;
// a failed or superseded response can never restore it.
export function usePartnerView<T>(endpoint:string,enabled=true){
 const endpointRef=useRef(endpoint);endpointRef.current=endpoint;
 const bookmark=useRef<{id:string;start:number|null;end:number|null}|null>(null);
 const generation=useRef(0),controller=useRef<AbortController|null>(null),identity=useRef<string|null>(null);
 const [result,setResult]=useState<{endpoint:string;data:T & PartnerClientScope;session:PartnerClientSession}|null>(null),[status,setStatus]=useState("Loading delivery work…");
 const clear=useCallback(()=>{const active=document.activeElement;if(active instanceof HTMLElement&&active.id.startsWith("partner-")&&belongsToView(active,endpointRef.current))bookmark.current={id:active.id,start:active instanceof HTMLTextAreaElement||active instanceof HTMLInputElement?active.selectionStart:null,end:active instanceof HTMLTextAreaElement||active instanceof HTMLInputElement?active.selectionEnd:null};generation.current++;controller.current?.abort();controller.current=null;setResult(null);},[]);
 const refresh=useCallback(async()=>{
  clear();if(!enabled)return;if(tabHidden()){setStatus("Delivery work is hidden until this tab is active.");return;}
  const current=generation.current,abort=new AbortController();controller.current=abort;setStatus("Loading delivery work…");
  try{const [response,auth]=await Promise.all([fetch(endpoint,{cache:"no-store",credentials:"same-origin",signal:abort.signal}),fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:abort.signal})]);const [envelope,authEnvelope]=await Promise.all([response.json(),auth.json()]);
   if(current!==generation.current||abort.signal.aborted||tabHidden())return;
   const nextIdentity=auth.ok&&authEnvelope.data?JSON.stringify([authEnvelope.data.principal.id,authEnvelope.data.membership.id,authEnvelope.data.membership.kind,authEnvelope.data.membership.role,authEnvelope.data.csrfToken]):null;
   if(nextIdentity&&identity.current!==null&&identity.current!==nextIdentity){window.dispatchEvent(new Event("turas.partner.access-cleared"));window.location.reload();return;}
   if(!auth.ok||!response.ok||!envelope.data||envelope.data.contractVersion!=="partner-enablement-v1"||envelope.data.actorPrincipalId!==authEnvelope.data?.principal?.id||envelope.data.actorMembershipId!==authEnvelope.data?.membership?.id){if([401,403,404].includes(response.status)||auth.status===401){for(const key of Object.keys(sessionStorage))if(key.startsWith("turas.partner.pending:"))sessionStorage.removeItem(key);window.dispatchEvent(new Event("turas.partner.access-cleared"));}throw Error(response.status===401||auth.status===401?"Sign in again to view delivery work.":"Delivery work is unavailable. Retry to check current access.");}
   identity.current=nextIdentity;setResult({endpoint,data:envelope.data as T & PartnerClientScope,session:authEnvelope.data});setStatus("");requestAnimationFrame(()=>{const saved=bookmark.current;if(!saved||current!==generation.current||tabHidden())return;const node=document.getElementById(saved.id);if(node&&belongsToView(node,endpoint)&&(document.activeElement===document.body||document.activeElement?.id===saved.id)){node.focus();if((node instanceof HTMLTextAreaElement||node instanceof HTMLInputElement)&&saved.start!==null&&saved.end!==null)try{node.setSelectionRange(saved.start,saved.end);}catch{}}bookmark.current=null;});
  }catch(error){if(current===generation.current&&!abort.signal.aborted){bookmark.current=null;setResult(null);setStatus(error instanceof Error?error.message:"Delivery work is unavailable.");}}
 },[clear,endpoint,enabled]);
 useEffect(()=>{
  void refresh();const regain=()=>{flushSync(clear);void refresh();},visibility=()=>{flushSync(clear);if(document.visibilityState==="visible")void refresh();};
  window.addEventListener("focus",regain);window.addEventListener("pageshow",regain);window.addEventListener("popstate",regain);document.addEventListener("visibilitychange",visibility);
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);
  return()=>{clear();window.clearInterval(timer);window.removeEventListener("focus",regain);window.removeEventListener("pageshow",regain);window.removeEventListener("popstate",regain);document.removeEventListener("visibilitychange",visibility);};
 },[clear,refresh]);
 return {view:enabled&&result?.endpoint===endpoint?result.data:null,session:enabled&&result?.endpoint===endpoint?result.session:null,status,refresh,clear,generation:generation.current};
}
