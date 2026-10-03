"use client";
import Link from 'next/link';
import { useCallback,useEffect,useRef,useState } from 'react';
import { useExecutionCommand,useExecutionRefresh } from './client';
import { ExecutionRecords } from './records';
import { ExecutionMilestones } from './milestones';
import { ExecutionReview } from './review';
import { ExecutionTime } from './time';
import {ExecutionForecast} from './forecast';
import {ExecutionHandoff} from './handoff';
import { ExecutionAdvisory } from './advisory';
import { ExecutionChanges } from './changes';
import type {Overview,RecordView,Session,Owner,Candidate} from './types';
async function get<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await fetch(url,{cache:'no-store',signal}),body=await response.json();if(!response.ok||!body.data)throw Object.assign(new Error(body.error?.message??'Execution unavailable'),{status:response.status});return body.data as T;}
export function ExecutionOverview({customerId,engagementId}:{customerId:string;engagementId:string}){
  const sections=['Activity','Time','Milestones','Registers','Forecast','Handoff','Turi'] as const;
  const [section,setSection]=useState<(typeof sections)[number]>('Activity'),[switching,setSwitching]=useState(false);
  const [session,setSession]=useState<Session|null>(null),[view,setView]=useState<Overview|null>(null),[records,setRecords]=useState<RecordView[]>([]),[owners,setOwners]=useState<Owner[]>([]),[message,setMessage]=useState(''),[showContent,setShowContent]=useState(false),[candidate,setCandidate]=useState<Candidate|null>(null),[cursor,setCursor]=useState<string|null>(null);
  const readAbort=useRef<AbortController|null>(null);
  const flight=useRef<Promise<void>|null>(null),heading=useRef<HTMLHeadingElement|null>(null);
  const sequence=useRef(0),pageCursor=useRef<string|null>(null),scopeReady=useRef(false),reviewTrigger=useRef<HTMLElement|null>(null);
  const clear=useCallback(()=>{++sequence.current;readAbort.current?.abort();readAbort.current=null;flight.current=null;scopeReady.current=false;setShowContent(false);setView(null);setRecords([]);setOwners([]);setCandidate(null);setSession(null);setCursor(null);pageCursor.current=null;},[]);
  const refresh=useCallback((force=false)=>{if(flight.current&&!force)return flight.current;if(force)readAbort.current?.abort();const controller=new AbortController();readAbort.current=controller;const run=async()=>{const ticket=++sequence.current;try{
    const [currentSession,currentView,currentOwners]=await Promise.all([get<Session>('/api/auth/session',controller.signal),get<Overview>(`/api/execution/engagements/${engagementId}`,controller.signal),get<{owners:Owner[]}>(`/api/execution/engagements/${engagementId}/owners`,controller.signal)]);
    if(ticket!==sequence.current)return;
    if(currentView.customerId!==customerId)throw Object.assign(new Error('Execution unavailable'),{status:404});
    const page=currentView.initialized?await get<{records:RecordView[];nextCursor:string|null}>(`/api/execution/engagements/${engagementId}/records?kind=activity${pageCursor.current?`&cursor=${encodeURIComponent(pageCursor.current)}`:''}`,controller.signal):{records:[],nextCursor:null};
    if(ticket!==sequence.current)return;
    setSession(currentSession);setView(currentView);setOwners(currentOwners.owners);setRecords(page.records);setCursor(page.nextCursor);setMessage('');scopeReady.current=true;setShowContent(true);
    setCandidate(current=>current&&current.expectedVersions.execution!==currentView.version?null:current);
  }catch(error){if(ticket!==sequence.current)return;
    const status=error&&typeof error==='object'&&'status'in error?Number(error.status):503;
    if(status===409){pageCursor.current=null;setCursor(null);setRecords([]);setCandidate(null);setMessage('Execution changed. Refresh the current records.');return;}
    clear();setMessage([401,403,404].includes(status)?'Current execution access unavailable. Sign in or refresh access.':error instanceof Error?error.message:'Execution unavailable');
  }};const pending=run();flight.current=pending;void pending.finally(()=>{if(flight.current===pending)flight.current=null;if(readAbort.current===controller)readAbort.current=null;});return pending;},[engagementId,customerId,clear]);
  const commands=useExecutionCommand(session?.csrfToken??'',async()=>{pageCursor.current=null;await refresh(true);},clear);
  useExecutionRefresh(refresh);
  useEffect(()=>{clear();void refresh();return()=>{++sequence.current;};},[engagementId,customerId,clear,refresh]);
  useEffect(()=>{const hidden=()=>{if(document.visibilityState==='hidden'){++sequence.current;readAbort.current?.abort();readAbort.current=null;flight.current=null;scopeReady.current=false;setShowContent(false);setCandidate(null);}};document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);},[]);
  const save=(action:string,expectedVersions:Record<string,number>,payload:unknown,confirmed?:()=>void)=>commands.save(`/api/execution/engagements/${engagementId}/commands`,{version:'execution-v1',action,expectedVersions,payload},confirmed);
  const openReview=(next:Candidate)=>{reviewTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setCandidate(next);};
  const closeReview=()=>{setCandidate(null);if(reviewTrigger.current?.isConnected&&!reviewTrigger.current.hasAttribute("disabled"))reviewTrigger.current.focus();else heading.current?.focus();};
  const selectSection=async(next:(typeof sections)[number])=>{
    if(next===section||switching||commands.busy||commands.uncertainKey)return;
    if(!window.dispatchEvent(new Event('execution-panel-change',{cancelable:true})))return;
    setSwitching(true);setCandidate(null);pageCursor.current=null;
    try{await refresh(true);setSection(next);}finally{setSwitching(false);}
  };
  const disabled=commands.busy||!!commands.uncertainKey||!!view?.writesDisabled||!scopeReady.current;
  return <main className="profile-page"><nav aria-label="Breadcrumb" className="profile-breadcrumb"><Link href="/customers">Customers</Link><span aria-hidden="true">/</span><Link href={`/customers/${customerId}`}>Profile</Link><span aria-hidden="true">/</span><Link href={`/customers/${customerId}/engagements/${engagementId}`}>Engagement</Link><span aria-hidden="true">/</span><span>Execution</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Engagement Delivery</p><h1 ref={heading} tabIndex={-1}>Execution Log</h1><p className="muted">Reviewed work and explicit delivery decisions.</p></div></header>
    {message&&<p role="alert">{message}</p>}{commands.message&&<p role="status">{commands.message}</p>}
    {commands.uncertainKey&&<button type="button" className="secondary-button" disabled={commands.busy} onClick={()=>void commands.reconcile()}>Check save receipt</button>}
    {!view&&!message&&<p role="status">Loading current execution eligibility…</p>}
    {view&&session&&<div hidden={!showContent}>
      <section className="profile-section"><h2>Baseline and Delivery State</h2><p>Accepted baseline {view.baselineVersion} · {view.state.replaceAll('_',' ')}</p>
        {view.reviewRequired&&<p role="status" className="profile-caution">Review required. The baseline or evidence changed; refresh and reconcile before new acceptance.</p>}
        {view.writesDisabled&&<p role="status">Execution changes are temporarily disabled. Reviewed history remains readable.</p>}
        {!view.initialized?<><p>No execution workspace exists yet. Setup binds the accepted plan; it does not mark any work complete.</p>{view.capabilities.setup&&<button type="button" className="primary-button" disabled={disabled||view.reviewRequired} onClick={()=>void save('setup',{baseline:view.baselineVersion,plan:view.planVersion},{baselineId:view.baselineId})}>Set up execution</button>}</>:<p>Empty or unreviewed records do not imply healthy delivery.</p>}
      </section>
      {view.initialized&&<>
        <div className="execution-tabs" role="tablist" aria-label="Delivery Sections" onKeyDown={event=>{
          const index=sections.indexOf(section),next=event.key==='ArrowRight'?sections[(index+1)%sections.length]:event.key==='ArrowLeft'?sections[(index+sections.length-1)%sections.length]:event.key==='Home'?sections[0]:event.key==='End'?sections.at(-1):null;
          if(next){event.preventDefault();void selectSection(next).then(()=>document.getElementById(`execution-tab-${next}`)?.focus());}
        }}>{sections.map(name=><button type="button" className="execution-tab" role="tab" id={`execution-tab-${name}`} aria-controls="execution-panel" aria-selected={section===name} tabIndex={section===name?0:-1} disabled={switching||commands.busy||!!commands.uncertainKey} key={name} onClick={()=>void selectSection(name)}>{name}</button>)}</div>
        <div id="execution-panel" data-execution-generation={view.generation} role="tabpanel" aria-labelledby={`execution-tab-${section}`} aria-busy={switching}>
        {section==='Activity'&&<><ExecutionRecords view={view} records={records} owners={owners} session={session} save={save} disabled={disabled} onReview={(record,action)=>openReview({version:'execution-v1',action,expectedVersions:{execution:view.version,record:record.version},payload:{recordId:record.id,revisionId:action==='record.retract'?record.acceptedRevisionId??record.revisionId:record.revisionId,contentDigest:action==='record.retract'?record.acceptedContentDigest??record.contentDigest:record.contentDigest}})}/>
        {cursor&&<button type="button" className="secondary-button" onClick={()=>{pageCursor.current=cursor;void refresh();}}>Next activity records</button>}</>}
        {section==='Time'&&<ExecutionTime view={view} records={records} save={save} disabled={disabled} onReview={openReview}/>}
        {section==='Milestones'&&<ExecutionMilestones view={view} records={records} owners={owners} disabled={disabled} save={save} onReview={openReview}/>}
        {section==='Forecast'&&<ExecutionForecast view={view} owners={owners} session={session} disabled={disabled} save={save} onReview={openReview}/>}
        {section==='Turi'&&<ExecutionAdvisory view={view} session={session}/>}
        {section==='Handoff'&&<ExecutionHandoff view={view} owners={owners} session={session} disabled={disabled} save={save} onReview={openReview}/>}
        {section==='Registers'&&<ExecutionChanges view={view} activities={records} owners={owners} session={session} disabled={disabled} save={save} onReview={openReview}/>}
        </div>
      </>}
      {candidate&&view.capabilities.review&&<ExecutionReview engagementId={engagementId} candidate={candidate} session={session} disabled={disabled} save={body=>commands.save(`/api/execution/engagements/${engagementId}/commands`,body as object)} onClose={closeReview}/>}
    </div>}
  </main>;
}
