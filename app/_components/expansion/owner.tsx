"use client";
import { useEffect, useState, useRef } from 'react';
import type { readExpansionOwners } from '../../../lib/server/expansion/owners';
import {requirePendingReceipt,type ExpansionPendingManager} from './pending';
type Owners = Awaited<ReturnType<typeof readExpansionOwners>>;
export function ExpansionOwner({ customerId, csrfToken, onChanged, pending }: {customerId:string;csrfToken:string;onChanged:()=>Promise<void>;pending:ExpansionPendingManager}){
 const[view,setView]=useState<Owners|null>(null),[selected,setSelected]=useState(''),[rationale,setRationale]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(false);
 const base=`/api/expansion/customers/${customerId}/owner`;
 useEffect(()=>{const controller=new AbortController();void fetch(base,{cache:'no-store',signal:controller.signal}).then(async response=>{
  if(!response.ok)throw Error('Owner assignment unavailable');const body=await response.json() as {data?:Owners};if(!body.data)throw Error('Owner assignment unavailable');
  setView(body.data);setSelected(body.data.assignment.membershipId??'');
 }).catch(error=>{if(error.name!=='AbortError')setStatus('Owner assignment unavailable');});return()=>controller.abort();},[base]);
 async function save(){
  if(active.current||pending.blocked||!view||!rationale.trim())return;const requestKey=crypto.randomUUID();if(!pending.begin({requestKey,operation:'assign_owner',workloadId:null}))return;active.current=true;setBusy(true);
  try{const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({contractVersion:'expansion-v1',operation:'assign_owner',requestKey,
   expectedVersion:view.assignment.version,membershipId:selected||null,rationale})});const body=await response.json() as {data?:unknown;error?:{message:string}};
   if(!response.ok){if(response.status<500)pending.finish(requestKey);throw Error(body.error?.message??'Assignment unconfirmed');}
   requirePendingReceipt(body.data,{requestKey,operation:'assign_owner',workloadId:null},customerId);pending.finish(requestKey);setRationale('');await onChanged();const refreshed=await fetch(base,{cache:'no-store'}).then(response=>response.json()) as {data?:Owners};if(refreshed.data)setView(refreshed.data);setStatus('Account-owner assignment saved.');
  }catch(error){setStatus(error instanceof Error?error.message:'Assignment unconfirmed');}finally{active.current=false;setBusy(false);}
 }

 if(!view?.canManage)return status?<p role="status">{status}</p>:null;
 return <details className="profile-card"><summary>Manage Account Owner</summary><p>Only the designated owner can qualify, defer, dismiss, or reopen this customer’s hypotheses.</p>
  <label htmlFor="expansion-account-owner">Account Owner</label><select id="expansion-account-owner" className="field" value={selected} disabled={busy||pending.blocked} onChange={event=>setSelected(event.target.value)}>
   <option value="">Unassigned</option>{view.candidates.map(candidate=><option key={candidate.membershipId} value={candidate.membershipId}>{candidate.displayName}</option>)}</select>
  <label htmlFor="expansion-assignment-rationale">Assignment Rationale<textarea id="expansion-assignment-rationale" className="field" maxLength={2000} value={rationale} disabled={busy||pending.blocked} onChange={event=>setRationale(event.target.value)}/></label>
  <button type="button" className="primary-button" disabled={busy||pending.blocked||!rationale.trim()} onClick={()=>void save()}>Save Account Owner</button>
  {status&&<p role="status">{status}</p>}
 </details>;
}
