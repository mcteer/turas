"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { readExecutionTime, readExecutionTimeOptions } from "../../../lib/server/execution/time";
import type { TimeInput } from "../../../lib/server/execution/time-schema";
import { useExecutionRefresh, useExecutionPanelGuard } from "./client";
import type { Overview, RecordView, Mutation, Candidate } from "./types";
type Entry = Awaited<ReturnType<typeof readExecutionTime>>["entries"][number];
type Options = Awaited<ReturnType<typeof readExecutionTimeOptions>>;
const today = () => { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
function blank(baselineId:string):TimeInput { return {baselineId,resourceId:"",workPackageKey:"",serviceDate:today(),
  timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,minutes:60,billable:true,activityRevisionId:"",allocationRevisionId:null,note:"",onBehalfRationale:null}; }
async function read<T>(url:string,signal:AbortSignal):Promise<T>{const response=await fetch(url,{signal,cache:"no-store"});const body=await response.json();
  if(!response.ok||!body.data)throw Object.assign(new Error(body.error?.message??"Time unavailable"),{status:response.status});return body.data;}
export function ExecutionTime({view,records,save,disabled,onReview}:{view:Overview;records:RecordView[];save:Mutation;disabled:boolean;onReview:(candidate:Candidate)=>void}){
  const noteId=useId(),onBehalfId=useId();
  const [entries,setEntries]=useState<Entry[]>([]),[options,setOptions]=useState<Options>({subjects:[],allocations:[]}),[message,setMessage]=useState("");
  const [period,setPeriod]=useState({from:new Date(Date.now()-30*86400000).toISOString().slice(0,10),to:today()}),[query,setQuery]=useState("");
  const [draft,setDraft]=useState<TimeInput>(()=>blank(view.baselineId)),[editing,setEditing]=useState<Entry|null>(null),[selected,setSelected]=useState<string[]>([]);
  const [history,setHistory]=useState<Entry[]|null>(null),[nextCursor,setNextCursor]=useState<string|null>(null),[cursor,setCursor]=useState<string|null>(null);
  const [reviewOnly,setReviewOnly]=useState(false);
  const dirty=useRef(0),sequence=useRef(0),controller=useRef<AbortController|null>(null),flight=useRef<Promise<void>|null>(null),draftRef=useRef(draft);draftRef.current=draft;
  useExecutionPanelGuard(dirty);
  const change=(patch:Partial<TimeInput>)=>{dirty.current++;setDraft(d=>({...d,...patch}));};
  const clearDraft=()=>{setDraft(blank(view.baselineId));setEditing(null);dirty.current=0;};
  const refresh=useCallback((force=false)=>{
    if(flight.current&&!force)return flight.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;const ticket=++sequence.current;
    const run=(async()=>{try{
      const d=draftRef.current;const base=`/api/execution/engagements/${view.engagementId}/time`;
      const [list,choices]=await Promise.all([read<Awaited<ReturnType<typeof readExecutionTime>>>(`${base}?${new URLSearchParams({...period,...(cursor?{cursor}:{}),...(reviewOnly?{review:"1"}:{})})}`,abort.signal),
        read<Options>(`${base}/options?${new URLSearchParams({date:d.serviceDate,query,...(d.resourceId?{resourceId:d.resourceId}:{})})}`,abort.signal)]);
      if(ticket!==sequence.current)return;setEntries(list.entries);setOptions(choices);setNextCursor(list.nextCursor);setMessage("");
      setHistory(current=>current?.some(h=>!list.entries.some(e=>e.id===h.id&&e.version===h.version&&!e.reviewRequired))?null:current);
      setSelected(current=>current.filter(id=>list.entries.some(e=>e.id===id&&e.canReview)));
      setEditing(current=>{if(!current)return current;const live=list.entries.find(e=>e.id===current.id);
        if(!live){setDraft(blank(view.baselineId));dirty.current=0;return null;}
        if(live.reviewRequired&&!current.reviewRequired){setDraft(d=>({...d,note:""}));return {...current,reviewRequired:true};}
        return current;});
      setDraft(current=>{if(current.resourceId||dirty.current)return current;const own=choices.subjects.find(s=>s.own);return own?{...current,resourceId:own.id,timezone:own.timezone}:current;});
    }catch(error){if(ticket!==sequence.current||abort.signal.aborted)return;setEntries([]);setOptions({subjects:[],allocations:[]});setHistory(null);setSelected([]);
      const status=error&&typeof error==="object"&&"status" in error?Number(error.status):503;
      if([401,403,404].includes(status)){setDraft(blank(view.baselineId));setEditing(null);dirty.current=0;}
      if(status===409)setCursor(null);setMessage(error instanceof Error?error.message:"Time unavailable");
    }})();flight.current=run;void run.finally(()=>{if(flight.current===run)flight.current=null;});return run;
  },[view.engagementId,view.baselineId,period,cursor,query,reviewOnly]);
  useExecutionRefresh(refresh);
  useEffect(()=>{void refresh(true);},[refresh,view.generation,draft.serviceDate,draft.resourceId]);
  useEffect(()=>()=>{++sequence.current;controller.current?.abort();},[]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue="";}};
    const navigate=(event:MouseEvent)=>{const a=event.target instanceof Element?event.target.closest("a[href]"):null;if(dirty.current&&a&&!window.confirm("Discard unsaved time changes?")){event.preventDefault();event.stopPropagation();}};
    window.addEventListener("beforeunload",warn);document.addEventListener("click",navigate,true);return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",navigate,true);};},[]);
  function review(rows:Entry[],action:string){onReview({version:"execution-v1",action,expectedVersions:{execution:view.version},payload:{entries:rows.map(e=>({entryId:e.id,
    revisionId:action==="time.reverse"?e.approvedRevisionId:e.revisionId,contentDigest:action==="time.reverse"?e.approvedContentDigest:e.contentDigest,version:e.version,exceptions:{}}))},
    display:rows.map(e=>({title:`${e.minutes} minutes · ${e.serviceDate}`,detail:`${e.timezone} · ${e.billable?"Billable":"Nonbillable"} · revision ${e.revisionNumber}`}))});}
  function edit(entry:Entry){setEditing(entry);setDraft({baselineId:entry.baselineId,resourceId:entry.resourceId,workPackageKey:entry.workPackageKey,
    serviceDate:entry.serviceDate,timezone:entry.timezone,minutes:entry.minutes,billable:entry.billable,activityRevisionId:entry.activityRevisionId,
    allocationRevisionId:entry.allocationRevisionId,note:entry.note??"",onBehalfRationale:entry.onBehalfRationale});dirty.current=0;}
  async function readHistory(entry:Entry){const abort=new AbortController(),ticket=++sequence.current;setHistory(null);try{
    const result=await read<Awaited<ReturnType<typeof readExecutionTime>>>(`/api/execution/engagements/${view.engagementId}/time?${new URLSearchParams({...period,entryId:entry.id,history:"1",limit:"50"})}`,abort.signal);
    if(ticket===sequence.current)setHistory(result.entries);
  }catch{setMessage("Time history unavailable. Refresh current access.");}}
  const subject=options.subjects.find(s=>s.id===draft.resourceId),onBehalf=view.capabilities.review&&!!subject&&!subject.own;
  const reviewedActivities=records.filter(r=>r.kind==="activity"&&r.state==="accepted"&&!r.reviewRequired&&r.content);
  return <section className="profile-section" aria-label="Time and Actuals"><div className="profile-header"><div><h2>Time and Actuals</h2><p className="muted">Daily effort becomes an actual only after review. Private notes stay with the author, subject, and reviewer.</p></div></div>
    {message&&<p role="status">{message}</p>}
    <div className="profile-form-grid"><label>Time from<input className="field" type="date" value={period.from} onChange={e=>{setCursor(null);setPeriod(p=>({...p,from:e.target.value}));}}/></label><label>Time to<input className="field" type="date" value={period.to} onChange={e=>{setCursor(null);setPeriod(p=>({...p,to:e.target.value}));}}/></label></div>
    {view.capabilities.review&&<label className="execution-check"><input type="checkbox" checked={reviewOnly} onChange={e=>{setReviewOnly(e.target.checked);setCursor(null);}}/>Submitted time only</label>}
    {!entries.length&&!message&&<p>No time entries in this period.</p>}
    {entries.map(e=><article className="profile-card" key={e.id} aria-label={`Time entry ${e.minutes} minutes`}><div className="profile-header"><div><h3>{e.minutes} Minutes</h3><p>{e.serviceDate} · {e.timezone} · {e.billable?"Billable":"Nonbillable"}</p></div><span className="profile-eyebrow">{e.state}</span></div>
      {e.approvedRevisionId&&e.approvedRevisionId!==e.revisionId&&<p>Prior approved revision remains counted while this correction is pending.</p>}
      {e.reviewRequired?<p role="status">Source or subject review required. Private notes are withheld; approved numerical history is retained.</p>:<p>{e.note}</p>}
      <div className="execution-actions">
        {e.canReview&&<label className="execution-check"><input type="checkbox" checked={selected.includes(e.id)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,e.id]:ids.filter(id=>id!==e.id))}/>Select for time review</label>}
        <button type="button" className="secondary-button" onClick={()=>void readHistory(e)}>Time history</button>
        {e.canRevise&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>edit(e)}>Correct time</button>}
        {e.canSubmit&&<button type="button" className="primary-button" disabled={disabled} onClick={()=>void save("time.submit",{execution:view.version,time:e.version},{entryId:e.id,revisionId:e.revisionId,contentDigest:e.contentDigest})}>Submit time</button>}
        {e.canReview&&<><button type="button" className="primary-button" disabled={disabled} onClick={()=>review([e],"time.approve")}>Review time</button><button type="button" className="secondary-button" disabled={disabled} onClick={()=>review([e],"time.reject")}>Reject time</button></>}
        {e.canReverse&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>review([e],"time.reverse")}>Reverse approved time</button>}
      </div></article>)}
    {selected.length>0&&<button type="button" className="primary-button" disabled={disabled||selected.length>25} onClick={()=>review(entries.filter(e=>selected.includes(e.id)),"time.approve")}>Review selected time ({selected.length})</button>}
    {nextCursor&&<button type="button" className="secondary-button" onClick={()=>setCursor(nextCursor)}>Next time entries</button>}
    {history&&<section className="profile-card"><h3>Time Revision History</h3>{history.map(e=><p key={e.revisionId}>Revision {e.revisionNumber} · {e.serviceDate} · {e.minutes} minutes · {e.state}</p>)}<button type="button" className="secondary-button" onClick={()=>setHistory(null)}>Close time history</button></section>}
    <form className="plan-editor" onSubmit={event=>{event.preventDefault();const current=dirty.current;void save(editing?"time.revise":"time.create",editing?{execution:view.version,time:editing.version}:{execution:view.version},
      {...(editing?{entryId:editing.id}:{}),time:{...draft,onBehalfRationale:onBehalf?draft.onBehalfRationale:null}},()=>{if(dirty.current===current)clearDraft();});}}>
      <h3>{editing?"Correct a Time Entry":"Record Daily Time"}</h3>
      {view.capabilities.review&&<label>Find time subject<input className="field" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search resource names"/></label>}
      <div className="profile-form-grid"><label>Time subject<select className="field" required value={draft.resourceId} onChange={e=>{const s=options.subjects.find(s=>s.id===e.target.value);change({resourceId:e.target.value,timezone:s?.timezone??draft.timezone,allocationRevisionId:null});}}><option value="">Select a resource</option>{options.subjects.map(s=><option key={s.id} value={s.id}>{s.label}{s.own?" (you)":""}{s.active?"":" · inactive"}</option>)}</select></label>
        <label>Service date<input className="field" required type="date" value={draft.serviceDate} onChange={e=>change({serviceDate:e.target.value,allocationRevisionId:null})}/></label>
        <label>Time entry zone<input className="field" required value={draft.timezone} onChange={e=>change({timezone:e.target.value})}/></label>
        <label>Minutes worked<input className="field" required type="number" min={1} max={1440} step={1} value={draft.minutes} onChange={e=>change({minutes:Number(e.target.value)})}/></label>
        <label>Time work package<select className="field" required value={draft.workPackageKey} onChange={e=>change({workPackageKey:e.target.value,allocationRevisionId:null})}><option value="">Select a work package</option>{editing&&draft.workPackageKey&&!view.workPackages.some(w=>w.key===draft.workPackageKey)&&<option value={draft.workPackageKey}>Historical work package</option>}{view.workPackages.map(w=><option key={w.key} value={w.key}>{w.title}</option>)}</select></label>
        <label>Reviewed activity<select className="field" required value={draft.activityRevisionId} onChange={e=>change({activityRevisionId:e.target.value})}><option value="">Select reviewed work</option>{editing&&draft.activityRevisionId&&!reviewedActivities.some(r=>r.revisionId===draft.activityRevisionId)&&<option value={draft.activityRevisionId}>Unavailable activity · numerical correction only</option>}{reviewedActivities.map(r=><option key={r.revisionId} value={r.revisionId}>{(r.content as {title:string}).title}</option>)}</select></label>
        <label>Confirmed allocation<select className="field" value={draft.allocationRevisionId??""} onChange={e=>{const a=options.allocations.find(a=>a.revisionId===e.target.value);change({allocationRevisionId:e.target.value||null,...(a?{billable:a.billable}:{})});}}><option value="">No matching allocation</option>{options.allocations.filter(a=>a.workPackageKey===draft.workPackageKey).map(a=><option key={a.revisionId} value={a.revisionId}>{a.minutes} planned minutes · {a.billable?"billable":"nonbillable"}</option>)}</select></label>
        <label className="execution-check"><input type="checkbox" checked={draft.billable} onChange={e=>change({billable:e.target.checked})}/>Billable effort</label>
      </div>
      {onBehalf&&<><label htmlFor={onBehalfId}>On-behalf entry rationale</label><textarea className="field" id={onBehalfId} required maxLength={2000} value={draft.onBehalfRationale??""} onChange={e=>change({onBehalfRationale:e.target.value})}/></>}
      <label htmlFor={noteId}>Private time note</label><textarea className="field" id={noteId} required maxLength={2000} value={draft.note} onChange={e=>change({note:e.target.value})}/>
      {editing?.reviewRequired&&<p role="status">Historical evidence is unavailable. Enter a fresh note for this numerical correction; approval requires the current reviewer exceptions.</p>}
      <p className="muted">Use whole minutes for one resource-local date. Missing bookings or capacity require separate reviewer explanations.</p>
      <div className="execution-actions"><button className="primary-button" type="submit" disabled={disabled||!draft.resourceId||!draft.activityRevisionId}>Save time draft</button>{editing&&<button type="button" className="secondary-button" onClick={()=>{if(!dirty.current||window.confirm("Discard unsaved time changes?"))clearDraft();}}>Cancel time correction</button>}</div>
    </form>
  </section>;
}
