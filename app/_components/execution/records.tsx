"use client";
import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import type {Overview,RecordView,Session,Owner,Mutation,ExecutionRecordContent,ExecutionSource} from './types';
export function ExecutionRecords({view,records,owners,session,save,disabled,onReview}:{view:Overview;records:RecordView[];owners:Owner[];session:Session;save:Mutation;disabled:boolean;onReview:(record:RecordView,action:string)=>void}){
  const [editing,setEditing]=useState<RecordView|null>(null),[draft,setDraft]=useState<ExecutionRecordContent>(blank()),[query,setQuery]=useState(''),[results,setResults]=useState<{citationId:string;title:string}[]>([]),[message,setMessage]=useState('');
  const [history,setHistory]=useState<{id:string;revisions:Array<{revisionId:string;state:string;reviewRequired:boolean;content:unknown}>;nextCursor:string|null}|null>(null);
  const dirty=useRef(0),submitted=useRef(0),sequence=useRef(0);
  function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function blank():ExecutionRecordContent{return {kind:'activity',subtype:'work',title:'',narrative:'',audience:'delivery',eventDate:localDate(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Owner not yet assigned',references:[]};}
  const change=(patch:Partial<ExecutionRecordContent>)=>{dirty.current++;setDraft(current=>({...current,...patch} as ExecutionRecordContent));};
  useLayoutEffect(()=>{if(editing){const current=records.find(r=>r.id===editing.id);if(!current||current.reviewRequired||!current.content){setEditing(null);setDraft(blank());dirty.current=0;setMessage('Source changed. Editor content was cleared.');}}},[records,editing]);
  useEffect(()=>{const clear=()=>{setResults([]);};const timer=window.setInterval(clear,5000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};
    const navigate=(event:MouseEvent)=>{const link=event.target instanceof Element?event.target.closest('a[href]'):null;if(!dirty.current||!link||link.getAttribute('target')==='_blank'||link.hasAttribute('download'))return;const target=new URL(link.getAttribute('href')!,location.href);if(target.origin===location.origin&&(target.pathname!==location.pathname||target.search!==location.search)&&!window.confirm('Discard unsaved activity changes?')){event.preventDefault();event.stopPropagation();}};
    window.addEventListener('beforeunload',warn);document.addEventListener('click',navigate,true);return()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',navigate,true);};},[]);
  async function search(){const ticket=++sequence.current;setMessage('');try{const response=await fetch('/api/retrieval/search',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify({scope:'combined',customerId:view.customerId,query,use:'discovery',limit:5})});const body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error('Evidence search unavailable');setResults(body.data.results);}catch{setResults([]);setMessage('Evidence search unavailable. Refresh current access.');}}
  async function attach(citationId:string){const ticket=++sequence.current;try{const response=await fetch(`/api/retrieval/citations/${citationId}`,{cache:'no-store'}),body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data?.locators?.[0])throw new Error('Evidence changed');const c=body.data;
    const reference={id:crypto.randomUUID(),kind:c.sourceKind==='published_shared'?'shared_knowledge':c.sourceKind,sourceRevisionId:c.sourceRevisionId,generation:c.sourceGeneration,contentDigest:c.contentDigest,locator:c.locators[0],citationId:c.citationId} as ExecutionSource;
    if(!draft.references.some(r=>r.kind===reference.kind&&r.sourceRevisionId===reference.sourceRevisionId))change({references:[...draft.references,reference]});setResults([]);setMessage('Exact evidence revision selected. Its eligibility is checked at save and review.');
  }catch{setResults([]);setMessage('Evidence changed; select a current source.');}}
  async function readHistory(recordId:string,cursor?:string){const ticket=++sequence.current;setHistory(null);try{const response=await fetch(`/api/execution/engagements/${view.engagementId}/records?history=1&recordId=${recordId}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store'}),body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error('History unavailable');setHistory({id:recordId,...body.data});}catch{setHistory(null);setMessage('History unavailable. Refresh current access.');}}
  useLayoutEffect(()=>{setHistory(null);},[records]);
  function edit(record:RecordView){if(!record.content)return;setEditing(record);setDraft(structuredClone(record.content) as ExecutionRecordContent);dirty.current=0;setMessage('');}
  return <section className="profile-section" aria-label="Activity Records"><h2>Activity Records</h2>
    {!records.length&&<p>No reviewed activity yet. This is an empty delivery log.</p>}
    {records.filter(r=>r.kind==='activity').map(record=><article key={record.id} className="profile-card">
      <h3>{record.content?(record.content as ExecutionRecordContent).title:'Source content withheld'}</h3><p>{record.state} · {record.audience} · revision {record.revisionNumber}</p>
      {record.reviewRequired?<p role="status">Review required. Current evidence is unavailable.</p>:<p>{(record.content as ExecutionRecordContent)?.narrative}</p>}
      <p className="evidence-citation">Record {record.id}</p>{record.content&&!record.reviewRequired&&(record.content as ExecutionRecordContent).references.map(ref=><p key={ref.id} className="evidence-citation">Evidence: {ref.kind.replaceAll("_"," ")} · revision {ref.sourceRevisionId}</p>)}<button type="button" className="secondary-button" onClick={()=>void readHistory(record.id)}>Read activity history</button>
      {record.content&&record.canRevise&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>edit(record)}>Revise activity</button>}
      {record.content&&record.canSubmit&&<button type="button" className="primary-button" disabled={disabled} onClick={()=>void save('record.submit',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest})}>Submit activity</button>}
      {record.canReview&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>onReview(record,'record.reject')}>Review rejection</button>}
      {record.canReview&&<button type="button" className="primary-button" disabled={disabled} onClick={()=>onReview(record,'record.accept')}>Review activity</button>}
      {record.canRetract&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>onReview(record,'record.retract')}>Review retraction</button>}
    </article>)}
    {history&&<section aria-label="Activity Revision History"><h3>Activity Revision History</h3>{history.revisions.map(r=><article className="profile-card" key={r.revisionId}><p>{r.state} · revision {r.revisionId}</p>{r.reviewRequired||!r.content?<p>Source content withheld. Review required.</p>:<p>{(r.content as {narrative:string}).narrative}</p>}</article>)}{history.nextCursor&&<button type="button" className="secondary-button" onClick={()=>void readHistory(history.id,history.nextCursor!)}>Next history revisions</button>}<button type="button" className="secondary-button" onClick={()=>setHistory(null)}>Close activity history</button></section>}
    <form className="plan-editor" onSubmit={event=>{event.preventDefault();submitted.current=dirty.current;void save(editing?'record.revise':'record.create',editing?{execution:view.version,record:editing.version}:{execution:view.version},editing?{recordId:editing.id,record:draft}:{baselineId:view.baselineId,record:draft},()=>{if(dirty.current===submitted.current){setDraft(blank());setEditing(null);dirty.current=0;}});}}>
      <h3>{editing?'Revise Activity':'Record an Activity'}</h3>
      <label>Activity title<input value={draft.title} maxLength={200} required onChange={e=>change({title:e.target.value})}/></label>
      <label>Observed work<textarea value={draft.narrative} maxLength={8000} required onChange={e=>change({narrative:e.target.value})}/></label>
      <label>Observed date<input type="date" value={draft.eventDate} required onChange={e=>change({eventDate:e.target.value})}/></label>
      <label>Time zone<input value={draft.timezone} required onChange={e=>change({timezone:e.target.value})}/></label>
      <label>Audience<select value={draft.audience} onChange={e=>change({audience:e.target.value as 'internal'|'delivery'})}><option value="delivery">Delivery</option>{session.membership.kind==='internal'&&<option value="internal">Internal</option>}</select></label>
      <label>Work package<select value={draft.workPackageKey??''} onChange={e=>change({workPackageKey:e.target.value||null})}><option value="">No package</option>{view.workPackages.map(p=><option value={p.key} key={p.key}>{p.title}</option>)}</select></label>
      <fieldset><legend>Milestone links</legend>{view.milestones.map(m=><label key={m.key}><input type="checkbox" checked={draft.milestoneKeys.includes(m.key)} onChange={e=>change({milestoneKeys:e.target.checked?[...draft.milestoneKeys,m.key]:draft.milestoneKeys.filter(k=>k!==m.key)})}/>{m.title}</label>)}</fieldset>
      <label>Activity owner<select value={draft.ownerMembershipId??''} onChange={e=>change({ownerMembershipId:e.target.value||null,unknownOwnerReason:e.target.value?null:'Owner not yet assigned'})}><option value="">Unknown owner</option>{owners.map(o=><option value={o.id} key={o.id}>{o.label}</option>)}</select></label>
      {draft.ownerMembershipId===null&&<label>Unknown owner reason<input required value={draft.unknownOwnerReason??''} maxLength={500} onChange={e=>change({unknownOwnerReason:e.target.value})}/></label>}
      <fieldset><legend>Exact evidence revisions</legend><p>Only currently eligible reviewed evidence can support acceptance.</p>
        <label>Search evidence<input value={query} maxLength={500} onChange={e=>setQuery(e.target.value)}/></label><button type="button" className="secondary-button" disabled={disabled||!query.trim()||draft.references.length>=20} onClick={()=>void search()}>Find evidence</button>
        {results.map(r=><button type="button" key={r.citationId} className="secondary-button" onClick={()=>void attach(r.citationId)}>Select {r.title}</button>)}
        {draft.references.map(r=><p key={r.id}>{r.kind.replaceAll('_',' ')} · revision {r.sourceRevisionId}<button type="button" className="secondary-button" onClick={()=>change({references:draft.references.filter(i=>i.id!==r.id)})}>Remove evidence</button></p>)}
      </fieldset>
      {message&&<p role="status">{message}</p>}<button type="submit" className="primary-button" disabled={disabled||view.reviewRequired}>Save activity draft</button>
      {editing&&<button type="button" className="secondary-button" onClick={()=>{if(!dirty.current||window.confirm('Discard unsaved activity changes?')){setEditing(null);setDraft(blank());dirty.current=0;}}}>Cancel activity revision</button>}
    </form>
  </section>;
}
