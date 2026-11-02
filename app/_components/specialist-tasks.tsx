'use client';
import {useEffect,useState} from 'react';
import {specialistListSchema,type SpecialistStatus} from '../../lib/contracts/specialist-discussions';
const labels={'customer-update':'Customer Research',solution:'Implementation Research','best-practices':'Vercel Best Practices'};
const states={admitted:'Queued',working:'Working',waiting_input:'Waiting for your answer',stopping:'Stopping',completed:'Completed',failed:'Failed',cancelled:'Stopped',unavailable:'Unavailable'};
export function SpecialistTasks({conversationId,csrfToken}:{conversationId:string;csrfToken:string}){
 const [items,setItems]=useState<SpecialistStatus[]>([]),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<Set<string>>(()=>new Set());
 useEffect(()=>{
  let active=true;
  async function refresh(){try{
   const response=await fetch(`/api/conversations/${conversationId}/specialists`,{cache:'no-store'});
   if(!active)return;
   if(!response.ok){if(response.status===403||response.status===404)setItems([]);return;}
   const parsed=specialistListSchema.safeParse((await response.json()).data);
   if(active&&parsed.success)setItems(previous=>parsed.data.items.map(item=>previous.find(old=>old.discussionId===item.discussionId&&old.state==='stopping')&&(['admitted','working','waiting_input'].includes(item.state)||item.state==='completed'&&item.canContinue)?{...item,state:'stopping',canContinue:false,canCancel:false,reasonCode:'stopping'}:item));
  }catch{/* A failed refresh never fabricates a terminal outcome. */}}
  void refresh();const timer=setInterval(()=>void refresh(),2000);
  return ()=>{active=false;clearInterval(timer);};
 },[conversationId]);
 async function stop(id:string){
  if(pending.has(id))return;
  setPending(previous=>new Set(previous).add(id));setNotice('');
  try{
   const response=await fetch(`/api/conversations/${conversationId}/specialists/${id}/cancel`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({requestKey:crypto.randomUUID()})});
   if(!response.ok){setNotice('The Stop request could not be confirmed. Refresh task status before trying again.');return;}
   setItems(previous=>previous.map(item=>item.discussionId===id?{...item,state:'stopping',canCancel:false,canContinue:false,reasonCode:'stopping'}:item));
  }catch{setNotice('The Stop request could not be confirmed. Refresh task status before trying again.');}
  finally{setPending(previous=>{const next=new Set(previous);next.delete(id);return next;});}
 }
 if(!items.length)return null;
 return <section aria-label="Specialist tasks" className="specialist-tasks">
  <ul>{items.map(item=><li key={item.discussionId}>
   <span>{labels[item.specialistKind]} — {states[item.state]}{item.reasonCode==='expired'?' (expired)':''}</span>{' '}
   {item.canCancel&&<button type="button" className="secondary-button" disabled={pending.has(item.discussionId)} onClick={()=>void stop(item.discussionId)} aria-label={`${item.state==='completed'?'Close':'Stop'} ${labels[item.specialistKind]}`}>{pending.has(item.discussionId)?'Stopping…':item.state==='completed'?'Close':'Stop'}</button>}
  </li>)}</ul>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
