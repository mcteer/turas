"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {useExecutionRefresh,useExecutionPanelGuard} from "./client";
import type {Overview,RecordView,Session,Owner,Mutation,Candidate,ExecutionRecordContent,ExecutionSource} from "./types";
export type DeliveryKind="effort_budget"|"estimate"|"handoff"|"closeout"|"outcome";
export const deliveryNames:Record<DeliveryKind,string>={effort_budget:"Work Budgets",estimate:"Remaining Estimates",handoff:"Handoffs",closeout:"Closeouts",outcome:"Outcomes"};
export type DeliveryProps={view:Overview;session:Session;owners:Owner[];disabled:boolean;save:Mutation;onReview:(candidate:Candidate)=>void};
export type DeliveryFields={draft:ExecutionRecordContent;change:(patch:Partial<ExecutionRecordContent>)=>void;view:Overview;catalog:RecordView[]};
export function blankDelivery(kind:DeliveryKind,view:Overview):ExecutionRecordContent{
  const common={kind,title:"",narrative:"",audience:"delivery" as const,eventDate:new Date().toISOString().slice(0,10),timezone:"UTC",workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:"Owner not assigned",references:[]};
  if(kind==="effort_budget"||kind==="estimate")return {...common,kind,workPackageKey:view.workPackages[0]?.key??"",minutes:0,...(kind==="estimate"?{asOf:new Date().toISOString(),explicitZero:false}:{})} as ExecutionRecordContent;
  if(kind==="outcome")return {...common,kind,status:"not_measured",measure:null,unit:null,currentValue:null,baselineValue:null,comparisonValue:null,baselineUnknownReason:null,comparisonUnknownReason:null,measurementStart:null,measurementEnd:null,limitationReason:"Measurement has not been collected"};
  return {...common,kind,deliverables:[],receiver:{kind:"external",label:""},acknowledgement:{state:"not_recorded",eventDate:null,evidenceReferenceIds:[]},openObligationIds:[],...(kind==="closeout"?{handoffRevisionId:""}:{})} as ExecutionRecordContent;
}
async function read(url:string,signal:AbortSignal){const response=await fetch(url,{cache:"no-store",signal}),body=await response.json();if(!response.ok||!body.data)throw Object.assign(new Error(body.error?.message??"Records unavailable"),{status:response.status});return body.data as {records:RecordView[];generation:number;nextCursor:string|null};}
export function DeliveryRecords({kinds,renderFields,renderContent,...props}:DeliveryProps&{kinds:DeliveryKind[];renderFields:(fields:DeliveryFields)=>ReactNode;renderContent:(content:ExecutionRecordContent)=>ReactNode}){
  const {view,session,owners,save,disabled,onReview}=props;
  const [kind,setKind]=useState(kinds[0]),[draft,setDraft]=useState(()=>blankDelivery(kinds[0],view)),[editing,setEditing]=useState<RecordView|null>(null);
  const [rows,setRows]=useState<RecordView[]>([]),[catalog,setCatalog]=useState<RecordView[]>([]),[message,setMessage]=useState(""),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null);
  const [history,setHistory]=useState<{revisions:RecordView[];nextCursor:string|null;recordId:string}|null>(null);
  const dirty=useRef(0),baseline=useRef(view.baselineId),abort=useRef<AbortController|null>(null),sequence=useRef(0),flight=useRef<Promise<void>|null>(null);
  const local=useRef({draft,editing});local.current={draft,editing};
  useExecutionPanelGuard(dirty);
  const reset=()=>{setEditing(null);setDraft(blankDelivery(kind,view));dirty.current=0;baseline.current=view.baselineId;};
  const change=(patch:Partial<ExecutionRecordContent>)=>{dirty.current++;setDraft(d=>({...d,...patch} as ExecutionRecordContent));};
  const refresh=useCallback((force=false)=>{
    if(flight.current&&!force)return flight.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const ticket=++sequence.current;
    const run=(async()=>{try{
      const root=`/api/execution/engagements/${view.engagementId}/records?`,page=await read(root+new URLSearchParams({kind,limit:"50",...(cursor?{cursor}:{})}),controller.signal);
      const accepted:RecordView[]=[];let after:string|null=null;
      do{const found=await read(root+new URLSearchParams({state:"accepted",limit:"50",...(after?{cursor:after}:{})}),controller.signal);
        if(found.generation!==page.generation)throw new Error("Execution changed. Refresh current records.");accepted.push(...found.records);after=found.nextCursor;
        if(accepted.length>=200&&after)throw new Error("Too many evidence records. Narrow the engagement before editing.");
      }while(after);
      if(ticket!==sequence.current)return;
      const eligible=accepted.filter(r=>r.content&&!r.reviewRequired);setRows(page.records);setCatalog(eligible);setNext(page.nextCursor);setMessage("");setHistory(null);
      const current=local.current;
      if((current.editing&&!page.records.some(r=>r.id===current.editing!.id&&r.content&&!r.reviewRequired))||current.draft.references.some(ref=>ref.kind==="execution_record"&&!eligible.some(r=>r.revisionId===ref.sourceRevisionId))){
        setEditing(null);setDraft(blankDelivery(kind,view));dirty.current=0;setMessage("Supporting evidence changed. Private editor content was cleared.");
      }
    }catch(error){if(ticket!==sequence.current||controller.signal.aborted)return;setRows([]);setCatalog([]);setHistory(null);setNext(null);
      // An evidence-backed editor must not retain derived private content after
      // an unsuccessful eligibility check. Unsaved source-free input can remain.
      if(local.current.editing||local.current.draft.references.length||[401,403,404].includes(Number((error as {status?:number}).status))){setEditing(null);setDraft(blankDelivery(kind,view));dirty.current=0;}
      if((error as {status?:number}).status===409)setCursor(null);setMessage(error instanceof Error?error.message:"Records unavailable");
    }})();flight.current=run;void run.finally(()=>{if(flight.current===run)flight.current=null;});return run;
  },[view.engagementId,view.baselineId,kind,cursor]);
  useExecutionRefresh(refresh);useEffect(()=>{void refresh(true);},[refresh,view.generation]);
  useEffect(()=>()=>{++sequence.current;abort.current?.abort();},[]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};const navigate=(e:MouseEvent)=>{if(dirty.current&&e.target instanceof Element&&e.target.closest("a[href]")&&!window.confirm("Discard unsaved delivery changes?")){e.preventDefault();e.stopPropagation();}};
    window.addEventListener("beforeunload",warn);document.addEventListener("click",navigate,true);return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",navigate,true);};},[]);
  useLayoutEffect(()=>{setHistory(null);},[view.generation]);
  function review(row:RecordView,action:string){onReview({version:"execution-v1",action,expectedVersions:{execution:view.version,record:row.version},payload:{recordId:row.id,revisionId:action==="record.retract"?row.acceptedRevisionId:row.revisionId,contentDigest:action==="record.retract"?row.acceptedContentDigest:row.contentDigest},display:[{title:(row.content as ExecutionRecordContent|null)?.title??"Historical Record",detail:`${deliveryNames[kind]} · revision ${row.revisionNumber} · ${row.state}`}]});}
  async function readHistory(recordId:string,cursor?:string){const ticket=sequence.current;try{const response=await fetch(`/api/execution/engagements/${view.engagementId}/records?${new URLSearchParams({recordId,history:"1",...(cursor?{cursor}:{})})}`,{cache:"no-store"}),body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error();setHistory({...body.data,recordId});}catch{setHistory(null);setMessage("History unavailable. Refresh current access.");}}
  return <section className="profile-section" aria-label="Delivery Records"><h2>Delivery Records</h2>
    <label>Record type<select className="field" value={kind} onChange={e=>{if(dirty.current&&!window.confirm("Discard unsaved delivery changes?"))return;const k=e.target.value as DeliveryKind;setKind(k);setDraft(blankDelivery(k,view));setEditing(null);setRows([]);setCatalog([]);setCursor(null);setHistory(null);dirty.current=0;baseline.current=view.baselineId;}}>{kinds.map(k=><option key={k} value={k}>{deliveryNames[k]}</option>)}</select></label>
    {message&&<p role="status">{message}</p>}{!rows.length&&!message&&<p className="muted">No {deliveryNames[kind].toLowerCase()} in this view.</p>}
    {rows.map(row=>{const content=row.content as ExecutionRecordContent|null;return <article key={row.id} className="profile-card" aria-label={`Delivery record ${content?.title??"withheld"}`}>
      <div className="profile-header"><h3>{content?.title??"Source Content Withheld"}</h3><span className="profile-eyebrow">{row.state}</span></div>
      <p className="muted">Revision {row.revisionNumber} · {row.audience}</p>{row.reviewRequired&&<p role="status">Review required. The baseline or supporting evidence changed.</p>}
      {content&&<><p>{content.narrative}</p>{renderContent(content)}</>}
      <div className="execution-actions"><button className="secondary-button" type="button" onClick={()=>void readHistory(row.id)}>Delivery history</button>
        {content&&row.canRevise&&<button className="secondary-button" type="button" disabled={disabled} onClick={()=>{if(dirty.current&&!window.confirm("Discard unsaved delivery changes?"))return;setEditing(row);setDraft(structuredClone(content));dirty.current=0;baseline.current=row.baselineId;}}>Revise delivery record</button>}
        {content&&row.canSubmit&&<button className="primary-button" type="button" disabled={disabled} onClick={()=>void save("record.submit",{execution:view.version,record:row.version},{recordId:row.id,revisionId:row.revisionId,contentDigest:row.contentDigest})}>Submit delivery record</button>}
        {row.canReview&&<><button className="primary-button" type="button" disabled={disabled} onClick={()=>review(row,"record.accept")}>Review delivery record</button><button className="secondary-button" type="button" disabled={disabled} onClick={()=>review(row,"record.reject")}>Reject delivery record</button></>}
        {row.canRetract&&<button className="secondary-button" type="button" disabled={disabled} onClick={()=>review(row,"record.retract")}>Retract delivery acceptance</button>}
      </div></article>;})}
    {next&&<button className="secondary-button" type="button" onClick={()=>{if(!dirty.current||window.confirm("Discard unsaved delivery changes?")){reset();setCursor(next);}}}>Next delivery records</button>}
    {history&&<section className="profile-card"><h3>Delivery Revision History</h3>{history.revisions.map(r=><p key={r.revisionId}>Revision {r.revisionNumber} · {r.state} · {r.reviewRequired?"Review required":(r.content as ExecutionRecordContent|null)?.title??"Content withheld"}</p>)}{history.nextCursor&&<button className="secondary-button" type="button" onClick={()=>void readHistory(history.recordId,history.nextCursor!)}>Next delivery history</button>}<button className="secondary-button" type="button" onClick={()=>setHistory(null)}>Close delivery history</button></section>}
    {session.membership.kind==="internal"&&<form className="plan-editor" onSubmit={e=>{e.preventDefault();const at=dirty.current;void save(editing?"record.revise":"record.create",editing?{execution:view.version,record:editing.version}:{execution:view.version},editing?{recordId:editing.id,record:draft}:{baselineId:baseline.current,record:draft},()=>{if(dirty.current===at)reset();});}}>
      <h3>{editing?"Revise Delivery Record":"Add a Delivery Record"}</h3>
      {baseline.current!==view.baselineId&&<p role="alert">The baseline changed. Start a new draft against the current plan.</p>}
      <label>Delivery title<input className="field" required maxLength={200} value={draft.title} onChange={e=>change({title:e.target.value})}/></label>
      <label>Delivery context<textarea className="field" required maxLength={8000} value={draft.narrative} onChange={e=>change({narrative:e.target.value})}/></label>
      <div className="profile-form-grid"><label>Event date<input className="field" required type="date" value={draft.eventDate} onChange={e=>change({eventDate:e.target.value})}/></label><label>Event time zone<input className="field" required value={draft.timezone} onChange={e=>change({timezone:e.target.value})}/></label>
        <label>Delivery audience<select className="field" value={draft.audience} onChange={e=>change({audience:e.target.value as "delivery"|"internal"})}><option value="delivery">Delivery</option><option value="internal">Internal</option></select></label>
        <label>Delivery owner<select className="field" value={draft.ownerMembershipId??""} onChange={e=>change({ownerMembershipId:e.target.value||null,unknownOwnerReason:e.target.value?null:"Owner not assigned"})}><option value="">Unknown owner</option>{owners.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label></div>
      {!draft.ownerMembershipId&&<label>Unknown delivery owner reason<input className="field" required maxLength={500} value={draft.unknownOwnerReason??""} onChange={e=>change({unknownOwnerReason:e.target.value})}/></label>}
      <fieldset><legend>Supporting Reviewed Evidence</legend><p className="muted">Each selection binds the exact accepted record and its underlying evidence.</p>
        {catalog.filter(r=>r.id!==editing?.id).map(r=><label className="execution-check" key={r.id}><input type="checkbox" disabled={draft.references.length>=20&&!draft.references.some(ref=>ref.sourceRevisionId===r.revisionId)} checked={draft.references.some(ref=>ref.sourceRevisionId===r.revisionId)} onChange={e=>change({references:e.target.checked?[...draft.references,{id:r.id,kind:"execution_record",sourceRevisionId:r.revisionId,generation:r.revisionNumber,contentDigest:r.contentDigest} satisfies ExecutionSource]:draft.references.filter(ref=>ref.sourceRevisionId!==r.revisionId)})}/>{(r.content as ExecutionRecordContent).title}</label>)}
        {!catalog.length&&<p>No eligible accepted evidence in this engagement.</p>}
      </fieldset>
      {renderFields({draft,change,view,catalog})}
      <div className="execution-actions"><button className="primary-button" type="submit" disabled={disabled||view.reviewRequired||baseline.current!==view.baselineId}>Save delivery draft</button><button className="secondary-button" type="button" onClick={()=>{if(!dirty.current||window.confirm("Discard unsaved delivery changes?"))reset();}}>Start a new delivery draft</button></div>
    </form>}
  </section>;
}
