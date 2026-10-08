"use client";
import { useState,useRef } from 'react';
import type { createExpansionPreview } from '../../../lib/server/expansion/review';
import type { readExpansionWorkspace } from '../../../lib/server/expansion/projection';
import {requirePendingReceipt,type ExpansionPendingManager} from './pending';
type Record = Awaited<ReturnType<typeof readExpansionWorkspace>>['records'][number];
type Preview = Awaited<ReturnType<typeof createExpansionPreview>>;
export function ExpansionReview({ customerId, workloadId, record, csrfToken, onChanged, pending }: {
 customerId:string;workloadId:string|null;record:Record;csrfToken:string;onChanged:()=>Promise<void>;pending:ExpansionPendingManager;
}){
 const[preview,setPreview]=useState<Preview|null>(null),[rationale,setRationale]=useState(''),[revisit,setRevisit]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(false);
 const base=`/api/expansion/customers/${customerId}`;
 async function post(path:string,input:unknown){const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(input)});
  const body=await response.json() as {data?:unknown;error?:{message:string}};if(!response.ok){const error=Error(body.error?.message??'Review unavailable') as Error&{status:number};error.status=response.status;throw error;}return body.data;}
 async function prepare(){if(active.current||pending.blocked)return;active.current=true;setBusy(true);setPreview(null);setStatus('Preparing exact review…');try{
  const result=await post(`${base}/preview`,{workloadId,recordId:record.id,revisionId:record.workingRevisionId,kind:record.working.availability==='eligible'?'full':'metadata'});
  setPreview(result as Preview);setStatus('');}catch(error){setStatus(error instanceof Error?error.message:'Review unavailable');}finally{active.current=false;setBusy(false);}}
 async function decide(decision:string){if(!preview||active.current||pending.blocked||!rationale.trim())return;const requestKey=crypto.randomUUID();if(!pending.begin({requestKey,operation:'decide_hypothesis',workloadId,recordId:record.id}))return;active.current=true;setBusy(true);
  try{const result=await post(`${base}/commands`,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey,workloadId,recordId:record.id,revisionId:record.workingRevisionId,
   expectedVersion:preview.expectedVersion,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision,rationale,...(decision==='defer'?{revisitDate:revisit}:{})});
   requirePendingReceipt(result,{requestKey,operation:'decide_hypothesis',workloadId,recordId:record.id},customerId);pending.finish(requestKey);setPreview(null);setRationale('');await onChanged();setStatus('Owner decision saved.');
  }catch(error){if((error as {status?:number}).status&&Number((error as {status:number}).status)<500){pending.finish(requestKey);setPreview(null);}setStatus(error instanceof Error?error.message:'Decision unconfirmed');}finally{active.current=false;setBusy(false);}}

 if(!record.allowedActions.length)return null;
 return <section aria-label="Owner Review"><button type="button" className="secondary-button" disabled={busy||pending.blocked} onClick={()=>void prepare()}>Review Hypothesis</button>
  {preview&&<div className="profile-card"><h3>{preview.kind==='metadata'?'Metadata-Only Owner Review':'Exact Hypothesis Review'}</h3>
   {preview.content&&<><p>{preview.content.title}</p><p>{preview.content.problem}</p></>}
   <p>{preview.qualificationChecks.length?'Qualification checks still needed:':'Qualification checks satisfied.'}</p>
   <ul>{preview.qualificationChecks.map(check=><li key={check}>{check}</li>)}</ul>
   <label htmlFor={`review-rationale-${record.id}`}>Decision Rationale<textarea className="field" id={`review-rationale-${record.id}`} value={rationale} maxLength={2000} onChange={event=>setRationale(event.target.value)}/></label>
   {preview.allowedActions.some(action=>action==='defer')&&<label htmlFor={`review-date-${record.id}`}>Revisit Date<input className="field" type="date" id={`review-date-${record.id}`} value={revisit} onChange={event=>setRevisit(event.target.value)}/></label>}
   {preview.allowedActions.map(action=><button key={action} type="button" className="secondary-button" disabled={busy||pending.blocked||!rationale.trim()||action==='qualify'&&(preview.kind!=='full'||!!preview.qualificationChecks.length)||action==='defer'&&!revisit}
    onClick={()=>void decide(action)}>{action[0].toUpperCase()+action.slice(1)} Hypothesis</button>)}
   <button type="button" className="secondary-button" disabled={busy||pending.blocked} onClick={()=>setPreview(null)}>Close Review</button>
  </div>}{status&&<p role="status">{status}</p>}
 </section>;
}
