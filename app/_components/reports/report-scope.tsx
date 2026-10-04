'use client';
import {useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
type Options={engagements:Array<{id:string;label:string;workloadId:string|null}>;workloads:Array<{id:string;label:string}>};
export type ReportScopeInput={selection:{kind:'weekly'|'monthly'|'quarterly';audience:string;timezone:string;engagementIds:string[];workloadIds:string[];includeCustomerLevel:boolean};fromDate:string;toDate:string;partial:boolean};
function previousPeriod(kind:ReportScopeInput['selection']['kind'],timezone:string){
 const today=Temporal.Now.plainDateISO(timezone);
 const start=kind==='weekly'?today.subtract({days:today.dayOfWeek-1+7}):kind==='monthly'?today.with({day:1}).subtract({months:1}):today.with({month:today.month-((today.month-1)%3),day:1}).subtract({months:3});
 return {fromDate:start.toString(),toDate:(kind==='weekly'?start.add({days:6}):kind==='monthly'?start.add({months:1}).subtract({days:1}):start.add({months:3}).subtract({days:1})).toString()};
}
export function ReportScopeForm({options,busy,onPrepare,onCancel}:{options:Options;busy:boolean;onPrepare:(input:ReportScopeInput)=>Promise<boolean>;onCancel:()=>void}){
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const [kind,setKind]=useState<ReportScopeInput['selection']['kind']>('weekly'),[audience,setAudience]=useState('delivery'),[timezone,setTimezone]=useState(zone),[engagementIds,setEngagementIds]=useState<string[]>([]),[additionalWorkloads,setAdditionalWorkloads]=useState<string[]>([]),[includeCustomerLevel,setIncludeCustomerLevel]=useState(false),[partial,setPartial]=useState(false),[period,setPeriod]=useState(()=>previousPeriod('weekly',zone)),[message,setMessage]=useState('');
 function changeKind(next:ReportScopeInput['selection']['kind']){try{setPeriod(previousPeriod(next,timezone));setKind(next);setPartial(false);if(next==='weekly')setEngagementIds(current=>current.slice(0,1));setMessage('');}catch{setMessage('Enter a valid timezone before choosing the period.');}}
 async function submit(event:React.FormEvent){
  event.preventDefault();const selected=options.engagements.filter(item=>engagementIds.includes(item.id));
  const hasCustomerLevel=selected.some(item=>!item.workloadId);
  if(kind!=='weekly'&&hasCustomerLevel&&!includeCustomerLevel){setMessage('Include customer-level inputs for engagements without a workload.');return;}
  const workloadIds=[...new Set([...selected.flatMap(item=>item.workloadId?[item.workloadId]:[]),...(kind==='weekly'?[]:additionalWorkloads)])];
  if(workloadIds.length>20){setMessage('Select at most 20 workloads.');return;}
  const confirmed=await onPrepare({selection:{kind,audience,timezone,engagementIds,workloadIds,includeCustomerLevel:kind==='weekly'?hasCustomerLevel:includeCustomerLevel},...period,partial});if(confirmed)onCancel();
 }
 return <form className="report-prepare profile-card" onSubmit={submit}><div className="profile-section-head"><h2>Prepare Report</h2></div>
  <div className="report-fields"><label>Report Type<select className="field" value={kind} onChange={event=>changeKind(event.target.value as typeof kind)}><option value="weekly">Weekly Update</option><option value="monthly">Monthly Executive Review</option><option value="quarterly">Quarterly Executive Review</option></select></label>
   <label>Audience<select className="field" value={audience} onChange={event=>setAudience(event.target.value)}><option value="delivery">Delivery</option><option value="account_team">Account Team</option><option value="leadership">Leadership</option></select></label>
   <label>Timezone<input className="field" value={timezone} required onChange={event=>setTimezone(event.target.value)}/></label>
   <label>Period Start<input className="field" type="date" required value={period.fromDate} onChange={event=>setPeriod(current=>({...current,fromDate:event.target.value}))}/></label><label>Period End<input className="field" type="date" required value={period.toDate} onChange={event=>setPeriod(current=>({...current,toDate:event.target.value}))}/></label>
  </div>
  {kind==='weekly'?<label>Engagement<select className="field" required value={engagementIds[0]??''} onChange={event=>setEngagementIds(event.target.value?[event.target.value]:[])}><option value="">Select Engagement</option>{options.engagements.map(item=><option key={item.id} value={item.id}>{item.label}{item.workloadId?'':' · No Workload Assigned'}</option>)}</select></label>:<>
   <fieldset className="report-selection"><legend>Engagements</legend><p className="muted">Select up to 20 engagements. Their accepted workload scope is included.</p>{options.engagements.map(item=><label key={item.id}><input type="checkbox" checked={engagementIds.includes(item.id)} disabled={!engagementIds.includes(item.id)&&engagementIds.length>=20} onChange={event=>setEngagementIds(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>{item.label}{item.workloadId?'':' · No Workload Assigned'}</label>)}</fieldset>
   {options.workloads.length>0&&<fieldset className="report-selection"><legend>Additional Accepted Workloads</legend>{options.workloads.map(item=><label key={item.id}><input type="checkbox" checked={additionalWorkloads.includes(item.id)} onChange={event=>setAdditionalWorkloads(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>{item.label}</label>)}</fieldset>}
   <label className="report-checkbox"><input type="checkbox" checked={includeCustomerLevel} onChange={event=>setIncludeCustomerLevel(event.target.checked)}/>Include Customer-Level Inputs</label>
  </>}
  <label className="report-checkbox"><input type="checkbox" checked={partial} onChange={event=>setPartial(event.target.checked)}/>Partial Current Period</label>
  <p className="muted">Choose a complete calendar week, month or quarter. Current periods need the partial label. Preparation creates a draft; publication and each email send require separate review.</p>
  {message&&<p role="alert">{message}</p>}<div className="report-actions"><button className="primary-button" disabled={busy||!engagementIds.length}>Prepare Draft</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
 </form>;
}
