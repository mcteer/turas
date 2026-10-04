'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ReportScopeForm,type ReportScopeInput} from './report-scope';
import {reportGet,useReportCommand} from './client';
import {UiIcon} from '../ui-icon';
import {PolicyManagement} from './policy-management';
import {BrandReview} from './brand-review';
type Session={csrfToken:string;membership:{kind:'internal'|'partner';role:string}};
type Card={reportId:string;kind:string;audience:string;period:{fromDate:string;toDate:string};state:string;visibility:string;version:number};
type Options={engagements:Array<{id:string;label:string;workloadId:string|null}>;workloads:Array<{id:string;label:string}>};
export function ReportList({customerId}:{customerId:string}){
 const [session,setSession]=useState<Session|null>(null),[reports,setReports]=useState<Card[]>([]),[options,setOptions]=useState<Options>({engagements:[],workloads:[]}),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[cursor,setCursor]=useState<string|null>(null),[showForm,setShowForm]=useState(false);
 const sequence=useRef(0),abort=useRef<AbortController|null>(null),moreBusy=useRef(false);
 const refresh=useCallback(async()=>{
  const ticket=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setLoading(true);
  try{
   const current=await reportGet<Session>('/api/auth/session',controller.signal);
   const page=await reportGet<{reports:Card[];cursor:string|null}>(`/api/reports/customers/${customerId}`,controller.signal);
   const scopes=current.membership.kind==='internal'?await reportGet<Options>(`/api/reports/customers/${customerId}/scopes`,controller.signal):{engagements:[],workloads:[]};
   if(ticket!==sequence.current)return;setSession(current);setReports(page.reports);setCursor(page.cursor);setOptions(scopes);setMessage('');
  }catch(error){if(ticket!==sequence.current)return;setReports([]);setOptions({engagements:[],workloads:[]});setSession(null);setMessage(error instanceof Error?error.message:'Reports unavailable');}finally{if(ticket===sequence.current)setLoading(false);}
 },[customerId]);
 const commands=useReportCommand(session?.csrfToken??'',refresh);
 useEffect(()=>{setShowForm(false);void refresh();return()=>{++sequence.current;abort.current?.abort();};},[refresh]);
 useEffect(()=>{const focus=()=>void refresh(),hidden=()=>{if(document.visibilityState==='hidden'){++sequence.current;abort.current?.abort();setReports([]);setOptions({engagements:[],workloads:[]});setSession(null);setShowForm(false);}else void refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',hidden);};},[refresh]);
 async function prepare(input:ReportScopeInput){const result=await commands.save(`/api/reports/customers/${customerId}/commands`,{action:'prepare',expectedVersion:0,...input});return Boolean(result);}
 async function more(){if(!cursor||moreBusy.current)return;const ticket=sequence.current;moreBusy.current=true;try{const page=await reportGet<{reports:Card[];cursor:string|null}>(`/api/reports/customers/${customerId}?cursor=${encodeURIComponent(cursor)}`,abort.current?.signal);if(ticket!==sequence.current)return;setReports(current=>[...current,...page.reports]);setCursor(page.cursor);}catch(error){if(ticket!==sequence.current)return;setReports([]);setMessage(error instanceof Error?error.message:'Reports unavailable');}finally{moreBusy.current=false;}}
 return <main className="profile-page report-page"><nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href="/customers">Customers</Link><span aria-hidden="true">/</span><Link href={`/customers/${customerId}`}>Customer Profile</Link><span aria-hidden="true">/</span><span>Reports</span></nav>
  <header className="profile-header"><div><p className="profile-eyebrow">Customer Delivery</p><h1>Reports</h1><p className="muted">Reviewed updates, clear decisions, and a consistent record of delivery.</p></div>{session?.membership.kind==='internal' && <button type="button" className="primary-button" disabled={commands.busy||commands.uncertain} onClick={()=>setShowForm(value=>!value)}><UiIcon name="plus" size={16}/>Prepare Report</button>}</header>
  {message && <div className="profile-state"><h2>Reports Unavailable</h2><p role="alert">{message}</p><button className="secondary-button" onClick={()=>void refresh()}>Refresh Access</button></div>}
  {commands.message && <p role="status">{commands.message}</p>}{commands.uncertain && <div className="report-actions"><button className="secondary-button" disabled={commands.busy} onClick={()=>void commands.recover()}>Check Original Request</button><button className="secondary-button" disabled={commands.busy} onClick={()=>void commands.retryExact()}>Retry Exact Request</button></div>}
  {showForm && <ReportScopeForm options={options} busy={commands.busy||commands.uncertain} onPrepare={prepare} onCancel={()=>setShowForm(false)}/>}
  <section className="profile-section" aria-label="Report History"><div className="profile-section-head"><h2>Report History</h2></div>
   {loading && <p role="status">Loading reports…</p>}{!loading&&!message&&reports.length===0 && <div className="profile-state"><h2>No Reports Yet</h2><p>{session?.membership.kind==='internal'?'Prepare a report from accepted engagement records.':'Published delivery reports will appear here.'}</p></div>}
   <div className="profile-grid">{reports.map(report=><article className="profile-card report-card" key={report.reportId}><div className="profile-card-head"><h3>{report.kind==='weekly'?'Weekly Update':report.kind==='quarterly'?'Quarterly Review':'Monthly Review'}</h3><span className="profile-badge">{report.state.replaceAll('_',' ')}</span></div><p className="report-period">{report.period.fromDate} — {report.period.toDate}</p><p>{report.audience.replaceAll('_',' ')}</p><Link className="report-card-link" href={`/customers/${customerId}/reports/${report.reportId}`}>Open Report <UiIcon name="arrow" size={16}/></Link></article>)}</div>
   {cursor && <button className="secondary-button" onClick={()=>void more()}>Load More Reports</button>}
  </section>
   {session?.membership.kind==='internal'&&<PolicyManagement customerId={customerId} csrfToken={session.csrfToken} options={options} busy={commands.busy||commands.uncertain} onSave={commands.save}/>}
   {session?.membership.kind==='internal'&&<BrandReview customerId={customerId} csrfToken={session.csrfToken} busy={commands.busy||commands.uncertain} onSave={commands.save}/>}
 </main>;
}
