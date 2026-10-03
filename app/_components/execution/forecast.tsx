"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useExecutionRefresh} from "./client";
import {DeliveryRecords,type DeliveryProps,type DeliveryFields} from "./delivery-records";
import type {ExecutionRecordContent} from "./types";
import type {readExecutionSummary} from "../../../lib/server/execution/summary";
export type ExecutionSummary=Awaited<ReturnType<typeof readExecutionSummary>>;
export function useExecutionSummary(engagementId:string,generation:number){
  const today=new Date().toISOString().slice(0,10),[period,setPeriod]=useState({from:today,to:today}),[summary,setSummary]=useState<ExecutionSummary|null>(null),[message,setMessage]=useState("");
  const sequence=useRef(0),abort=useRef<AbortController|null>(null),flight=useRef<Promise<void>|null>(null);
  const refresh=useCallback((force=false)=>{if(flight.current&&!force)return flight.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const ticket=++sequence.current;
    const run=(async()=>{try{const response=await fetch(`/api/execution/engagements/${engagementId}/summary?${new URLSearchParams(period)}`,{cache:"no-store",signal:controller.signal}),body=await response.json();
      if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error(body.error?.message??"Summary unavailable");setSummary(body.data);setMessage("");
    }catch(error){if(ticket!==sequence.current||controller.signal.aborted)return;setSummary(null);setMessage(error instanceof Error?error.message:"Summary unavailable");}})();flight.current=run;void run.finally(()=>{if(flight.current===run)flight.current=null;});return run;
  },[engagementId,period]);
  useExecutionRefresh(refresh);useEffect(()=>{setSummary(null);void refresh(true);},[refresh,generation]);useEffect(()=>()=>{++sequence.current;abort.current?.abort();},[]);
  return {summary,message,period,setPeriod};
}
const reason=(value:string)=>value.replaceAll("_"," ");
function hours(value:string){const n=BigInt(value),absolute=n<0n?-n:n;return `${n<0n?"−":""}${absolute/60n} h ${absolute%60n} min`;}
function metric(label:string,value:string|null,note?:string){return <div className="execution-metric" key={label}><dt>{label}</dt><dd>{value===null?"Incomplete":`${value} min`}{value!==null&&<span className="execution-hours">{hours(value)}</span>}{note&&<p className="muted">{note}</p>}</dd></div>;}
export function ExecutionForecast(props:DeliveryProps){
  const {summary,message,period,setPeriod}=useExecutionSummary(props.view.engagementId,props.view.generation),[dates,setDates]=useState(period);
  return <><section className="profile-section" aria-label="Effort Forecast"><h2>Effort Forecast</h2><p className="muted">Approved actuals and reviewed remaining work. Every quantity is in whole minutes.</p>
    <form className="execution-period" onSubmit={e=>{e.preventDefault();setPeriod({...dates});}}><label>Period start<input className="field" required type="date" value={dates.from} onChange={e=>setDates(d=>({...d,from:e.target.value}))}/></label><label>Period end<input className="field" required type="date" value={dates.to} onChange={e=>setDates(d=>({...d,to:e.target.value}))}/></label><button className="secondary-button" type="submit">Apply period</button></form>
    {message&&<p role="alert">{message}</p>}{!summary&&!message&&<p role="status">Checking reviewed forecast inputs…</p>}
    {summary&&<><p className="muted">As of {summary.asOf} · baseline {props.view.baselineVersion} · generation {summary.generation}</p>
      <dl className="execution-metrics">{metric("Lifetime Actual",summary.effort.actualLifetimeMinutes,"All approved delivery, including historical baselines")}{metric("Remaining Effort",summary.effort.remainingMinutes,"Current reviewed estimates")}{metric("Forecast Total",summary.effort.forecastMinutes,"Lifetime actual + remaining effort")}{metric("Current-Baseline Work Budget",summary.effort.budgetMinutes,"Reviewed point budgets")}{metric("Current-Baseline Work Variance",summary.effort.varianceMinutes,"Mapped actual + remaining − budget")}</dl>
      {(summary.effort.forecastReason||summary.effort.varianceReason)&&<p className="profile-caution" role="status">{[...new Set([summary.effort.forecastReason,summary.effort.varianceReason].filter(Boolean))].map(r=>reason(r!)).join(" · ")}. Known actuals remain included.</p>}
      {summary.effort.unmappedHistoricalMinutes!=="0"&&<p>Retired or unmapped historical actual: {summary.effort.unmappedHistoricalMinutes} min</p>}
      <h3>Work Package Coverage</h3><div className="execution-package-list">{summary.effort.workPackages.map(p=><article className="profile-card" key={p.key}><h4>{props.view.workPackages.find(w=>w.key===p.key)?.title??p.key}</h4><p>Actual {p.actualMinutes} min · Budget {p.budgetMinutes===null?"unknown":`${p.budgetMinutes} min`} · Remaining {p.remainingMinutes===null?"incomplete":`${p.remainingMinutes} min`}</p>{p.estimateReason&&<p role="status">{reason(p.estimateReason)}</p>}{p.estimateAsOf&&<p className="muted">Estimate as of {p.estimateAsOf}</p>}
        {summary.planEffortProvenance.filter((range:{key:string})=>range.key===p.key).map((range:{key:string;effort:unknown})=>{const effort=range.effort as {state?:string;minimum?:number;maximum?:number;reason?:string};return <p className="muted" key={range.key}>Plan effort: {effort.state==="hours"?`${effort.minimum}–${effort.maximum} hours`:`unknown${effort.reason?` — ${effort.reason}`:""}`}</p>;})}
      </article>)}</div>
      <h3>Selected Period</h3><p>{summary.period.from} through {summary.period.to}, using each approved time entry’s captured service date.</p><dl className="execution-metrics">{metric("Period Actual",summary.effort.actualPeriodMinutes)}{metric("Billable Actual",summary.effort.billablePeriodMinutes)}{metric("Nonbillable Actual",summary.effort.nonbillablePeriodMinutes)}{metric("Confirmed Planned",summary.effort.plannedPeriodMinutes)}{metric("Tentative Planned",summary.effort.tentativePeriodMinutes)}</dl>
      {summary.effort.plannedReviewRequired&&<p role="status">Planned commitments need review against the current baseline.</p>}
      <ReviewedStatus summary={summary}/><details><summary>Calculation Receipt</summary><p className="evidence-citation">{summary.receipt.id} · {summary.receipt.formulaVersion} · {summary.receipt.inputDigest}</p></details>
    </>}
  </section>{props.view.capabilities.utilization&&<ActualUtilization engagementId={props.view.engagementId} generation={props.view.generation} period={period}/>}<DeliveryRecords {...props} kinds={["effort_budget","estimate"]} renderFields={EffortFields} renderContent={EffortContent}/></>;
}
export function ReviewedStatus({summary}:{summary:ExecutionSummary}){
  return <section aria-label="Reviewed Delivery Status"><h3>Reviewed Delivery Status</h3><dl className="execution-status-counts">{Object.entries(summary.status.milestoneCounts).map(([state,count])=><div key={state}><dt>{reason(state)}</dt><dd>{count}</dd></div>)}</dl>
    {summary.status.reviewRequiredRecords>0&&<p role="status">{summary.status.reviewRequiredRecords} visible records require review.</p>}
    <h4>Open Blockers</h4>{summary.status.blockers.length?summary.status.blockers.map(b=><p key={b.id}>{b.title} · {b.severity} · {b.reviewDate??b.unknownDateReason}</p>):<p className="muted">No reviewed high or critical issues or dependencies in this view.</p>}
    <h4>Dates and Latest Activity</h4>{summary.status.overdue.map(o=><p key={`${o.kind}/${o.key}`}>{o.title} · overdue since {o.date}</p>)}{summary.status.unknownDates.map(d=><p className="muted" key={`${d.kind}/${d.key}`}>{d.key}: {d.reason}</p>)}
    <p>{summary.status.latestActivity?`${summary.status.latestActivity.eventDate} · ${summary.status.latestActivity.title}`:"No eligible reviewed activity."}</p>
    <details><summary>Evidence Observation Ages</summary>{summary.status.evidenceAge.length?summary.status.evidenceAge.map(e=><p className="evidence-citation" key={`${e.kind}/${e.sourceRevisionId}`}>{reason(e.kind)} · {e.sourceRevisionId} · {e.ageDays===null?"Observation age unknown":`${e.ageDays} UTC calendar days`}</p>):<p>No eligible observation dates in this view.</p>}</details>
  </section>;
}
function EffortFields({draft,change,view}:DeliveryFields){
  if(draft.kind!=="estimate"&&draft.kind!=="effort_budget")return null;
  return <><div className="profile-form-grid"><label>Effort work package<select className="field" required value={draft.workPackageKey??""} onChange={e=>change({workPackageKey:e.target.value})}>{view.workPackages.map(p=><option key={p.key} value={p.key}>{p.title}</option>)}</select></label><label>{draft.kind==="estimate"?"Remaining minutes":"Budget minutes"}<input className="field" required type="number" min={0} max={6000000} step={1} value={draft.minutes} onChange={e=>change({minutes:e.target.valueAsNumber})}/></label></div>
    {draft.kind==="estimate"&&<><label>Estimate as of (UTC)<input className="field" required value={draft.asOf} onChange={e=>change({asOf:e.target.value})}/></label><label className="execution-check"><input type="checkbox" checked={draft.explicitZero} onChange={e=>change({explicitZero:e.target.checked})}/>Explicitly confirm zero remaining work</label><p className="muted">An estimate must account for approved actuals through its as-of instant. Estimates older than seven UTC calendar days need review.</p></>}
  </>;
}
function EffortContent(content:ExecutionRecordContent){return content.kind==="effort_budget"?<p>Work budget: {content.minutes} min · {content.workPackageKey}</p>:content.kind==="estimate"?<p>Remaining: {content.minutes} min · {content.workPackageKey} · as of {content.asOf}{content.explicitZero?" · zero explicitly confirmed":""}</p>:null;}
function ActualUtilization({engagementId,generation,period}:{engagementId:string;generation:number;period:{from:string;to:string}}){
  type Utilization=Awaited<ReturnType<typeof import("../../../lib/server/execution/summary").readExecutionUtilization>>;
  const [query,setQuery]=useState(""),[search,setSearch]=useState(""),[subjects,setSubjects]=useState<Array<{id:string;label:string}>>([]),[selected,setSelected]=useState<string[]>([]),[scope,setScope]=useState<string[]>([]),[result,setResult]=useState<Utilization|null>(null),[message,setMessage]=useState("");
  const sequence=useRef(0),abort=useRef<AbortController|null>(null),flight=useRef<Promise<void>|null>(null);
  const refresh=useCallback((force=false)=>{if(flight.current&&!force)return flight.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const ticket=++sequence.current;
    const get=async(url:string)=>{const r=await fetch(url,{cache:"no-store",signal:controller.signal}),b=await r.json();if(!r.ok||!b.data)throw new Error(b.error?.message??"Utilization unavailable");return b.data;};
    const run=(async()=>{try{const [options,usage]=await Promise.all([get(`/api/execution/engagements/${engagementId}/time/options?${new URLSearchParams({date:period.from,query:search})}`),scope.length?get(`/api/execution/utilization?${new URLSearchParams({...period,resourceIds:scope.join(",")})}`):Promise.resolve(null)]);
      if(ticket!==sequence.current)return;setSubjects(options.subjects);setResult(usage);setMessage("");
    }catch(error){if(ticket!==sequence.current||controller.signal.aborted)return;setSubjects([]);setResult(null);setMessage(error instanceof Error?error.message:"Utilization unavailable");}})();flight.current=run;void run.finally(()=>{if(flight.current===run)flight.current=null;});return run;
  },[engagementId,period,search,scope]);
  useExecutionRefresh(refresh);useEffect(()=>{setResult(null);void refresh(true);},[refresh,generation]);useEffect(()=>()=>{++sequence.current;abort.current?.abort();},[]);
  return <section className="profile-section" aria-label="Actual Utilization"><h2>Actual Utilization</h2><p className="muted">Reviewer view of approved billable minutes across workspace customers, divided by approved available capacity for the selected period.</p>
    <form className="execution-period" onSubmit={e=>{e.preventDefault();setSearch(query);}}><label>Find utilization resources<input className="field" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="secondary-button" type="submit">Find resources</button></form>
    {message&&<p role="status">{message}</p>}<fieldset className="profile-quality"><legend>Selected Resources</legend>{subjects.map(s=><label className="execution-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={selected.length>=50&&!selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>{s.label}</label>)}</fieldset>
    <div className="execution-actions"><button type="button" className="secondary-button" disabled={!selected.length||selected.length>50} onClick={()=>setScope([...selected])}>Calculate actual utilization</button><button type="button" className="secondary-button" onClick={()=>{setSelected([]);setScope([]);setResult(null);}}>Clear resources</button></div>
    {result&&<><p className="muted">As of {result.asOf} · {result.period.from} through {result.period.to}</p><p>Combined actual utilization: <strong>{result.total.percentage===null?reason(result.total.state):`${result.total.percentage}%`}</strong></p>
      {result.resources.map(r=><article className="profile-card" key={r.resourceId}><h3>{r.label}</h3><p>{r.actualBillableMinutes} billable min / {r.availableMinutes??"unknown"} available min · {r.percentage===null?reason(r.state):`${r.percentage}%`}</p>{r.reasons.map(d=><p className="muted" key={d.date}>{d.date}: {reason(d.reason)}</p>)}</article>)}
      <p className="muted">Protected time remains separate from available capacity. Percentages above 100% are retained; these are operational quantities.</p></>}
  </section>;
}
