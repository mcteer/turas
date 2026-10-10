'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { learningFetch,learningPost,type LearningAuth,type LearningReceipt } from './client';
// Metadata-only publication controls must survive native picker window blur.
// All views still clear when hidden; private views also clear on window blur.
export function useLearningView<T>(url:string|null,metadataOnly=false){
 const [view,setView]=useState<T|null>(null),[auth,setAuth]=useState<LearningAuth|null>(null),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),generation=useRef(0);
 const clear=useCallback(()=>{++generation.current;setView(null);setAuth(null);},[]);
 const refresh=useCallback(async(withhold=true)=>{const ticket=++generation.current;if(withhold){setView(null);setAuth(null);}if(!url){setView(null);setAuth(null);setLoading(false);return;}setLoading(true);try{const [current,data]=await Promise.all([learningFetch<LearningAuth>('/api/auth/session'),learningFetch<T>(url)]);if(ticket!==generation.current||document.visibilityState==='hidden')return;setAuth(current);setView(data);setNotice('');}catch(error){if(ticket===generation.current){setView(null);setAuth(null);setNotice(error instanceof Error?error.message:'Learning unavailable');}}finally{if(ticket===generation.current)setLoading(false);}},[url]);
 useEffect(()=>{void refresh();const focus=()=>void refresh(!metadataOnly),blur=()=>{if(!metadataOnly||document.visibilityState==='hidden')clear();},visibility=()=>document.visibilityState==='hidden'?clear():void refresh();window.addEventListener('focus',focus);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(false);},30000);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);++generation.current;};},[refresh,clear,metadataOnly]);
 return {view,auth,notice,loading,refresh,clear};
}
export function useLearningMutation(auth:LearningAuth|null,scope:string,onRefresh:()=>Promise<void>){
 const [pending,setPending]=useState<string|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),active=useRef(false);
 const key=auth?`learning-command:${auth.workspace.id}:${auth.membership.id}:${scope}`:null;
 useEffect(()=>{setPending(key?sessionStorage.getItem(key):null);},[key]);
 const clearPending=()=>{if(key)sessionStorage.removeItem(key);setPending(null);};
 async function send<T>(url:string,input:Record<string,unknown>,knowledge=false){
  if(!auth||!key||active.current||pending||sessionStorage.getItem(key))throw Error('Resolve the pending request before continuing');active.current=true;setBusy(true);const requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);setPending(requestId);
  try{const receipt=await learningPost<T>(auth,url,knowledge?{...input,idempotencyKey:requestId}:{...input,contractVersion:'learning-v1',requestId});clearPending();setNotice('Recorded.');await onRefresh();return receipt;}catch(error){setNotice(error instanceof Error?error.message:'Request unconfirmed');await onRefresh();throw error;}finally{active.current=false;setBusy(false);}
 }
 const mutate=(url:string,input:Record<string,unknown>)=>send<LearningReceipt>(url,input);
 const knowledge=(url:string,input:Record<string,unknown>)=>send<{decisionId:string}>(url,input,true);
 async function reconcile(abandon=false){if(!auth||!pending||active.current)return;active.current=true;setBusy(true);try{const receipt=abandon?await learningPost<LearningReceipt>(auth,`/api/learning/requests/${pending}/resolve`,{contractVersion:'learning-v1',requestId:pending,expectedVersion:0,action:'abandon'}):await learningFetch<LearningReceipt>(`/api/learning/requests/${pending}`);if(['committed','abandoned','retired'].includes(receipt.outcome)){clearPending();setNotice(`Request ${receipt.outcome}.`);await onRefresh();}else setNotice(receipt.outcome==='pending'?'Request is pending. Check again.':'No committed result found. Close the request before a new action.');}catch(error){setNotice(error instanceof Error?error.message:'Reconciliation unavailable');}finally{active.current=false;setBusy(false);}}
 return {pending,busy,notice,mutate,knowledge,reconcile};
}
