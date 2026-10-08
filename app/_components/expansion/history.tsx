"use client";
import {useState} from 'react';
import type {readExpansionWorkspace} from '../../../lib/server/expansion/projection';
type View=Awaited<ReturnType<typeof readExpansionWorkspace>>;
type History=NonNullable<View['records'][number]['history']>;
export function ExpansionHistory({customerId,workloadId,recordId}:{customerId:string;workloadId:string|null;recordId:string}){
 const[history,setHistory]=useState<History|null>(null),[selected,setSelected]=useState<History['selected']>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const[cursors,setCursors]=useState<(string|null)[]>([null]),[page,setPage]=useState(0);
 async function request(cursor?:string|null,revisionId?:string){
  const params=new URLSearchParams({recordId,limit:'10'});if(workloadId)params.set('workloadId',workloadId);if(cursor)params.set('cursor',cursor);if(revisionId)params.set('revisionId',revisionId);
  const response=await fetch(`/api/expansion/customers/${customerId}?${params}`,{cache:'no-store'}),body=await response.json() as {data?:View;error?:{message:string}};
  if(!response.ok||!body.data?.records[0]?.history)throw Error(body.error?.message??'History unavailable');return body.data.records[0].history;
 }
 async function load(cursor:string|null=null,index=0){setBusy(true);setStatus('Loading current-authorized history…');setSelected(null);
  try{const value=await request(cursor);setHistory(value);setPage(index);setStatus('');}catch(error){setHistory(null);setStatus(error instanceof Error?error.message:'History unavailable');}finally{setBusy(false);}}
 async function open(id:string){setBusy(true);setSelected(null);try{const value=await request(null,id);setSelected(value.selected);setStatus('');}catch(error){setStatus(error instanceof Error?error.message:'Historical content unavailable');}finally{setBusy(false);}}
 return <section aria-label="Hypothesis History"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void load()}>View History</button>
  {status&&<p role="status">{status}</p>}{history&&<div className="profile-card"><h3>Revision History</h3><p>Historical content is checked against current evidence when opened.</p>
   <ul>{history.revisions.map(revision=><li key={revision.id}>Revision {revision.ordinal} · {revision.createdAt}
    <button type="button" className="secondary-button" disabled={busy||!revision.contentRetained} onClick={()=>void open(revision.id)}>Open Revision {revision.ordinal}</button>
    {!revision.contentRetained&&<span> Content Purged</span>}</li>)}</ul>
   {page>0&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void load(cursors[page-1]??null,page-1)}>Previous History Page</button>}
   {history.nextCursor&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{const cursor=history.nextCursor;setCursors(old=>[...old.slice(0,page+1),cursor]);void load(cursor,page+1);}}>Next History Page</button>}
   <button type="button" className="secondary-button" onClick={()=>{setHistory(null);setSelected(null);}}>Close History</button>
   {selected&&<article><h4>{selected.payload?.content.title??'Evidence Changed — Review Required'}</h4>{selected.payload?<><p>{selected.payload.content.problem}</p><p>{selected.payload.content.customerBenefit}</p><p>Historical content carries no new qualification.</p></>:<p>Historical prose is withheld because its original inputs changed or expired.</p>}</article>}
  </div>}
 </section>;
}
