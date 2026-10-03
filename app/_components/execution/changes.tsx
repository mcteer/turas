"use client";
import Link from "next/link";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import {useExecutionRefresh,useExecutionPanelGuard} from "./client";
import {executionDateInZone} from "../../../lib/execution/dates";
import type {Overview,RecordView,Owner,Session,Mutation,Candidate,ExecutionRecordContent,ExecutionSource} from "./types";
type Kind="raid"|"decision"|"scope_change";
type Register=Extract<ExecutionRecordContent,{kind:Kind}>;
const names={raid:"RAID",decision:"Decisions",scope_change:"Scope Changes"};
function blank(kind:Kind,baselineId:string):Register {
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const base={title:"",narrative:"",audience:"delivery" as const,eventDate:executionDateInZone(timezone),timezone,
    workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:"Owner not assigned",references:[]};
  if(kind==="raid")return {...base,kind,raidType:"risk",status:"open",severity:"medium",impact:"",reviewDate:null,unknownDateReason:"Review date not assigned",acceptedExceptionRationale:null};
  if(kind==="decision")return {...base,kind,decisionDate:base.eventDate,decider:"",rationale:""};
  return {...base,kind,state:"proposed",oldBaselineId:baselineId,replacementBaselineId:null,impact:""};
}
export function ExecutionChanges({view,activities,owners,session,save,disabled,onReview}:{view:Overview;activities:RecordView[];owners:Owner[];session:Session;save:Mutation;disabled:boolean;onReview:(candidate:Candidate)=>void}) {
  const [kind,setKind]=useState<Kind>("raid"),[rows,setRows]=useState<RecordView[]>([]),[draft,setDraft]=useState<Register>(()=>blank("raid",view.baselineId));
  const [editing,setEditing]=useState<RecordView|null>(null),[message,setMessage]=useState(""),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null);
  const [history,setHistory]=useState<{generation:number;revisions:RecordView[];nextCursor:string|null;recordId:string}|null>(null);
  const dirty=useRef(0),baseline=useRef(view.baselineId),sequence=useRef(0),abort=useRef<AbortController|null>(null),flight=useRef<Promise<void>|null>(null);
  const reset=()=>{setEditing(null);setDraft(blank(kind,view.baselineId));baseline.current=view.baselineId;dirty.current=0;};
  useExecutionPanelGuard(dirty);
  const change=(patch:Partial<Register>)=>{dirty.current++;setDraft(d=>({...d,...patch} as Register));};
  const refresh=useCallback((force=false)=>{
    if(flight.current&&!force)return flight.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const ticket=++sequence.current;
    const run=(async()=>{try{
      const response=await fetch(`/api/execution/engagements/${view.engagementId}/records?${new URLSearchParams({kind,limit:"50",...(cursor?{cursor}:{})})}`,{cache:"no-store",signal:controller.signal});
      const body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw Object.assign(new Error(body.error?.message??"Register unavailable"),{status:response.status});
      const records:RecordView[]=body.data.records;setRows(records);setNext(body.data.nextCursor);setMessage("");setHistory(h=>h?.generation===body.data.generation?h:null);
      setEditing(current=>{if(!current)return current;const row=records.find(r=>r.id===current.id);
        if(!row?.content){setDraft(blank(kind,view.baselineId));dirty.current=0;setMessage("Evidence changed. Private editor content was cleared.");return null;}return current;});
    }catch(error){if(ticket!==sequence.current||controller.signal.aborted)return;setRows([]);setHistory(null);setNext(null);
      const status=error&&typeof error==="object"&&"status" in error?Number(error.status):503;
      if([401,403,404].includes(status)){setDraft(blank(kind,view.baselineId));setEditing(null);dirty.current=0;}
      if(status===409)setCursor(null);setMessage(error instanceof Error?error.message:"Register unavailable");
    }})();flight.current=run;void run.finally(()=>{if(flight.current===run)flight.current=null;});return run;
  },[view.engagementId,view.baselineId,kind,cursor]);
  useExecutionRefresh(refresh);
  useEffect(()=>{void refresh(true);},[refresh,view.generation]);
  useEffect(()=>()=>{++sequence.current;abort.current?.abort();},[]);
  useLayoutEffect(()=>{if(draft.references.some(ref=>ref.kind==="execution_record"&&!activities.some(a=>a.revisionId===ref.sourceRevisionId&&a.state==="accepted"&&!a.reviewRequired&&a.content))){
    setDraft(blank(kind,view.baselineId));setEditing(null);dirty.current=0;setMessage("Supporting work changed. Editor content was cleared.");
  }},[activities,draft.references,kind,view.baselineId]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};
    const navigate=(e:MouseEvent)=>{if(dirty.current&&e.target instanceof Element&&e.target.closest("a[href]")&&!window.confirm("Discard unsaved register changes?")){e.preventDefault();e.stopPropagation();}};
    window.addEventListener("beforeunload",warn);document.addEventListener("click",navigate,true);return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",navigate,true);};},[]);
  function review(row:RecordView,action:string){onReview({version:"execution-v1",action,expectedVersions:{execution:view.version,record:row.version},
    payload:{recordId:row.id,revisionId:action==="record.retract"?row.acceptedRevisionId:row.revisionId,contentDigest:action==="record.retract"?row.acceptedContentDigest:row.contentDigest},
    display:[{title:(row.content as Register|null)?.title??"Exact historical record",detail:`${names[kind]} · revision ${row.revisionNumber} · ${row.state}`}]});}
  async function readHistory(recordId:string,cursor?:string){const ticket=++sequence.current;setHistory(null);try{
    const response=await fetch(`/api/execution/engagements/${view.engagementId}/records?${new URLSearchParams({recordId,history:"1",...(cursor?{cursor}:{})})}`,{cache:"no-store"}),body=await response.json();
    if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error();setHistory({...body.data,recordId});
  }catch{setMessage("History unavailable. Refresh current access.");}}
  const evidence=activities.filter(r=>r.state==="accepted"&&!r.reviewRequired&&r.content),baselineChanged=baseline.current!==view.baselineId&&draft.kind!=="scope_change";
  return <section className="profile-section" aria-label="Registers and Scope Changes"><div className="profile-header"><div><h2>Registers and Scope Changes</h2><p className="muted">Reviewed concerns, human decisions, and controlled changes to delivery.</p></div></div>
    <label>Register<select className="field" value={kind} onChange={e=>{if(dirty.current&&!window.confirm("Discard unsaved register changes?"))return;const next=e.target.value as Kind;setKind(next);setRows([]);setCursor(null);setHistory(null);setEditing(null);setDraft(blank(next,view.baselineId));baseline.current=view.baselineId;dirty.current=0;}}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {message&&<p role="status">{message}</p>}{!rows.length&&!message&&<p>No {names[kind].toLowerCase()} records in this view.</p>}
    {rows.map(row=>{const content=row.content as Register|null;return <article className="profile-card" key={row.id} aria-label={`${names[kind]} record ${content?.title??"withheld"}`}>
      <div className="profile-header"><h3>{content?.title??"Source Content Withheld"}</h3><span className="profile-eyebrow">{row.state}</span></div>
      {row.reviewRequired&&<p role="status">Review required. This record has historical baseline context or unavailable evidence.</p>}
      {content&&<><p>{content.narrative}</p>{content.kind==="raid"?<><p>{content.raidType} · {content.severity} · {content.status.replaceAll("_"," ")}</p><p>Review date: {content.reviewDate??content.unknownDateReason}</p><p>Impact: {content.impact}</p>{content.raidType==="assumption"&&<p>Assumption remains uncertain; this review does not establish a customer fact.</p>}</>:content.kind==="decision"?<><p>{content.decisionDate} · {content.decider}</p><p>{content.rationale}</p></>:<><p>{content.state.replaceAll("_"," ")}</p><p>{content.impact}</p><p>Original baseline: {content.oldBaselineId}</p>{content.replacementBaselineId&&<p>Replacement: {content.replacementBaselineId}</p>}</>}</>}
      <div className="execution-actions"><button type="button" className="secondary-button" onClick={()=>void readHistory(row.id)}>Register history</button>
        {content&&row.canRevise&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>{setEditing(row);setDraft(structuredClone(content));baseline.current=row.baselineId;dirty.current=0;}}>Revise register record</button>}
        {content&&row.canSubmit&&<button type="button" className="primary-button" disabled={disabled} onClick={()=>void save("record.submit",{execution:view.version,record:row.version},{recordId:row.id,revisionId:row.revisionId,contentDigest:row.contentDigest})}>Submit register record</button>}
        {row.canReview&&<><button type="button" className="primary-button" disabled={disabled} onClick={()=>review(row,"record.accept")}>Review register record</button><button type="button" className="secondary-button" disabled={disabled} onClick={()=>review(row,"record.reject")}>Reject register record</button></>}
        {row.canRetract&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>review(row,"record.retract")}>Retract register acceptance</button>}
      </div></article>;})}
    {next&&<button type="button" className="secondary-button" onClick={()=>{if(!dirty.current||window.confirm("Discard unsaved register changes?")){reset();setCursor(next);}}}>Next register records</button>}
    {history&&<section className="profile-card"><h3>Register Revision History</h3>{history.revisions.map(row=><p key={row.revisionId}>Revision {row.revisionNumber} · {row.state} · {row.reviewRequired?"Review required":(row.content as Register|null)?.title??"Content withheld"}</p>)}{history.nextCursor&&<button className="secondary-button" type="button" onClick={()=>void readHistory(history.recordId,history.nextCursor!)}>Next register history</button>}<button type="button" className="secondary-button" onClick={()=>setHistory(null)}>Close register history</button></section>}
    <form className="plan-editor" onSubmit={e=>{e.preventDefault();const submitted=dirty.current;void save(editing?"record.revise":"record.create",editing?{execution:view.version,record:editing.version}:{execution:view.version},
      editing?{recordId:editing.id,record:draft}:{baselineId:baseline.current,record:draft},()=>{if(dirty.current===submitted)reset();});}}>
      <h3>{editing?"Revise Register Record":"Add a Register Record"}</h3>
      {baselineChanged&&<p role="alert">The baseline changed. Start a new draft against the current plan.</p>}
      <label>Register title<input className="field" required maxLength={200} value={draft.title} onChange={e=>change({title:e.target.value})}/></label>
      <label>Register context<textarea className="field" aria-label="Register context" required maxLength={8000} value={draft.narrative} onChange={e=>change({narrative:e.target.value})}/></label>
      <div className="profile-form-grid"><label>Register event date<input className="field" required type="date" value={draft.eventDate} onChange={e=>change({eventDate:e.target.value})}/></label>
        <label>Register time zone<input className="field" required value={draft.timezone} onChange={e=>change({timezone:e.target.value})}/></label>
        <label>Register audience<select className="field" value={draft.audience} onChange={e=>change({audience:e.target.value as "internal"|"delivery"})}><option value="delivery">Delivery</option>{session.membership.kind==="internal"&&<option value="internal">Internal</option>}</select></label>
        <label>Register owner<select className="field" value={draft.ownerMembershipId??""} onChange={e=>change({ownerMembershipId:e.target.value||null,unknownOwnerReason:e.target.value?null:"Owner not assigned"})}><option value="">Unknown owner</option>{owners.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </div>
      {!draft.ownerMembershipId&&<label>Register unknown owner reason<input className="field" required maxLength={500} value={draft.unknownOwnerReason??""} onChange={e=>change({unknownOwnerReason:e.target.value})}/></label>}
      {draft.kind==="raid"&&<><div className="profile-form-grid"><label>Concern type<select className="field" value={draft.raidType} onChange={e=>change({raidType:e.target.value as typeof draft.raidType})}>{["risk","assumption","issue","dependency"].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label>Concern severity<select className="field" value={draft.severity} onChange={e=>change({severity:e.target.value as typeof draft.severity})}>{["low","medium","high","critical"].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label>Concern status<select className="field" value={draft.status} onChange={e=>change({status:e.target.value as typeof draft.status,acceptedExceptionRationale:e.target.value==="accepted_exception"?"":null})}>{["open","monitoring","resolved","accepted_exception"].map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
        <label>Concern review date<input className="field" type="date" value={draft.reviewDate??""} onChange={e=>change({reviewDate:e.target.value||null,unknownDateReason:e.target.value?null:"Review date not assigned"})}/></label></div>
        {!draft.reviewDate&&<label>Unknown review date reason<input className="field" required maxLength={2000} value={draft.unknownDateReason??""} onChange={e=>change({unknownDateReason:e.target.value})}/></label>}
        {draft.status==="accepted_exception"&&<label>Accepted exception rationale<textarea className="field" aria-label="Accepted exception rationale" required maxLength={2000} value={draft.acceptedExceptionRationale??""} onChange={e=>change({acceptedExceptionRationale:e.target.value})}/></label>}
        {draft.status==="resolved"&&!draft.references.length&&<p>Resolution requires eligible reviewed evidence.</p>}</>}
      {draft.kind==="decision"&&<><div className="profile-form-grid"><label>Decision date<input className="field" required type="date" value={draft.decisionDate} onChange={e=>change({decisionDate:e.target.value})}/></label><label>Decision maker<input className="field" required maxLength={200} value={draft.decider} onChange={e=>change({decider:e.target.value})}/></label></div>
        <label>Decision rationale<textarea className="field" aria-label="Decision rationale" required maxLength={2000} value={draft.rationale} onChange={e=>change({rationale:e.target.value})}/></label>
        <fieldset><legend>Decisions to Supersede</legend>{rows.filter(r=>r.state==="accepted"&&r.id!==editing?.id&&r.content&&!r.reviewRequired).map(r=><label className="execution-check" key={r.id}><input type="checkbox" checked={draft.supersededDecisionIds?.includes(r.id)??false} onChange={e=>{const ids=e.target.checked?[...(draft.supersededDecisionIds??[]),r.id]:(draft.supersededDecisionIds??[]).filter(id=>id!==r.id);change({supersededDecisionIds:ids.length?ids:undefined});}}/>{(r.content as Register).title}</label>)}</fieldset></>}
      {draft.kind==="scope_change"&&<><p>Original baseline: {draft.oldBaselineId}</p><label>Scope change state<select className="field" value={draft.state} onChange={e=>change({state:e.target.value as typeof draft.state})}>{["proposed","approved_for_planning","rejected","implemented","withdrawn"].map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
        <label>Accepted replacement baseline<select className="field" value={draft.replacementBaselineId??""} onChange={e=>change({replacementBaselineId:e.target.value||null})}><option value="">No accepted replacement selected</option>{view.baselineId!==draft.oldBaselineId&&<option value={view.baselineId}>Accepted baseline {view.baselineVersion}</option>}</select></label>
        <p className="muted">Approval for planning does not accept a new plan or change staffing. Implementation requires an accepted replacement and complete mapping.</p></>}
      {draft.kind!=="decision"&&<label>Delivery impact<textarea className="field" aria-label="Delivery impact" required maxLength={2000} value={draft.impact} onChange={e=>change({impact:e.target.value})}/></label>}
      <fieldset><legend>Supporting Reviewed Work</legend><p className="muted">Link an accepted activity and its underlying evidence.</p>{evidence.map(r=><label className="execution-check" key={r.id}><input type="checkbox" disabled={draft.references.length>=20&&!draft.references.some(ref=>ref.sourceRevisionId===r.revisionId)} checked={draft.references.some(ref=>ref.sourceRevisionId===r.revisionId)} onChange={e=>change({references:e.target.checked?[...draft.references,{kind:"execution_record",id:r.id,sourceRevisionId:r.revisionId,generation:r.revisionNumber,contentDigest:r.contentDigest} satisfies ExecutionSource]:draft.references.filter(ref=>ref.sourceRevisionId!==r.revisionId)})}/>{(r.content as ExecutionRecordContent).title}</label>)}</fieldset>
      <div className="execution-actions"><button type="submit" className="primary-button" disabled={disabled||baselineChanged||(draft.kind==="raid"&&draft.status==="resolved"&&!draft.references.length)}>Save register draft</button><button type="button" className="secondary-button" onClick={()=>{if(!dirty.current||window.confirm("Discard unsaved register changes?"))reset();}}>Start a new register draft</button></div>
    </form>
    <BaselineMapping view={view} disabled={disabled} onReview={onReview}/>
    <p><Link href={`/customers/${view.customerId}`}>Open Customer Plans</Link> to review and accept a replacement through the planning workflow.</p>
  </section>;
}
function BaselineMapping({view,disabled,onReview}:{view:Overview;disabled:boolean;onReview:(candidate:Candidate)=>void}){
  const [mapped,setMapped]=useState<Record<string,string>>({}),[added,setAdded]=useState<string[]>([]),scope=view.reconciliation;
  useEffect(()=>{setMapped({});setAdded([]);},[scope?.oldBaselineId,scope?.newBaselineId]);
  if(!scope)return null;
  const used=new Set(scope.oldItems.flatMap(i=>mapped[`${i.kind}/${i.key}`]&&mapped[`${i.kind}/${i.key}`]!=="__retired__"?[`${i.kind}/${mapped[`${i.kind}/${i.key}`]}`]:[]));
  const mappedCount=scope.oldItems.filter(i=>mapped[`${i.kind}/${i.key}`]&&mapped[`${i.kind}/${i.key}`]!=="__retired__").length;
  const complete=used.size===mappedCount&&scope.oldItems.every(i=>!!mapped[`${i.kind}/${i.key}`])&&scope.newItems.every(i=>used.has(`${i.kind}/${i.key}`)||added.includes(`${i.kind}/${i.key}`));
  return <section className="profile-card" aria-label="Baseline Reconciliation"><h3>Reconcile the Accepted Baseline</h3><p>Map each original item once, or retire it. Mark every unmatched new item as added. Completion and original actuals are preserved separately.</p>
    {!scope.newEligible&&<p role="status">Replacement evidence is unavailable. Reconciliation requires current eligible sources.</p>}
    {scope.oldItems.map(i=><label key={`${i.kind}/${i.key}`}>Map {i.kind.replaceAll("_"," ")} {i.key}<select className="field" aria-label={`Map ${i.kind} ${i.key}`} disabled={!view.capabilities.review||disabled} value={mapped[`${i.kind}/${i.key}`]??""} onChange={e=>{const key=`${i.kind}/${i.key}`,value=e.target.value;setMapped(m=>({...m,[key]:value}));setAdded(a=>a.filter(v=>v!==`${i.kind}/${value}`));}}><option value="">Choose a reviewed mapping</option><option value="__retired__">Retire this item</option>{scope.newItems.filter(n=>n.kind===i.kind).map(n=><option key={n.key} value={n.key} disabled={used.has(`${i.kind}/${n.key}`)&&mapped[`${i.kind}/${i.key}`]!==n.key}>{n.title} ({n.key})</option>)}</select></label>)}
    <fieldset><legend>Explicitly Added Items</legend>{scope.newItems.filter(i=>!used.has(`${i.kind}/${i.key}`)).map(i=><label className="execution-check" key={`${i.kind}/${i.key}`}><input type="checkbox" disabled={!view.capabilities.review||disabled} checked={added.includes(`${i.kind}/${i.key}`)} onChange={e=>setAdded(a=>e.target.checked?[...a,`${i.kind}/${i.key}`]:a.filter(v=>v!==`${i.kind}/${i.key}`))}/>Add {i.title} ({i.key})</label>)}</fieldset>
    {view.capabilities.review&&<button type="button" className="primary-button" disabled={disabled||!complete||!scope.newEligible} onClick={()=>{
      const items=[...scope.oldItems.map(i=>({kind:i.kind,oldKey:i.key,newKey:mapped[`${i.kind}/${i.key}`]==="__retired__"?null:mapped[`${i.kind}/${i.key}`],disposition:mapped[`${i.kind}/${i.key}`]==="__retired__"?"retired":"mapped"})),
        ...scope.newItems.filter(i=>added.includes(`${i.kind}/${i.key}`)).map(i=>({kind:i.kind,oldKey:null,newKey:i.key,disposition:"added"}))];
      onReview({version:"execution-v1",action:"baseline.reconcile",expectedVersions:{execution:view.version,oldBaseline:scope.oldBaselineVersion,newBaseline:scope.newBaselineVersion,plan:scope.planVersion},
        payload:{oldBaselineId:scope.oldBaselineId,newBaselineId:scope.newBaselineId,items},display:items.map(i=>({title:`${i.oldKey??"Added"} → ${i.newKey??"Retired"}`,detail:i.kind.replaceAll("_"," ")}))});
    }}>Review baseline mapping</button>}
  </section>;
}
