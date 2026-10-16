'use client';
import {useState} from 'react';
import {engagementMetrics,wholeEngagementScenario} from '../../lib/server/ordinary-operations/calculations';
type Values=Parameters<typeof engagementMetrics>[0];
export function OrdinaryEngagementScenario({baseline}:{baseline:Values;currency:string|null}){
 const [remaining,setRemaining]=useState(baseline.remainingMinutes===null?'':String(Number(baseline.remainingMinutes)/60)),[fee,setFee]=useState(''),[nonlabor,setNonlabor]=useState(''),[rate,setRate]=useState(''),[currency,setCurrency]=useState('');
 const amount=(value:string,max:number)=>/^(0|[1-9][0-9]*)$/.test(value)&&value.length<=max;
 const valid=amount(fee,13)&&amount(nonlabor,13)&&amount(rate,9)&&currency!==''&&remaining.trim()!==''&&Number.isFinite(Number(remaining))&&Number(remaining)>=0&&Number(remaining)<=100000;
 const metrics=valid?wholeEngagementScenario(baseline,{remainingHours:Number(remaining),wholeEngagementFeeMinorUnits:fee,wholeEngagementNonlaborMinorUnits:nonlabor,wholeEngagementLoadedRateMinorUnitsPerHour:rate,currency}).metrics:null;
 return <section className="profile-section"><div className="profile-section-head"><h2>What-if Preview</h2></div><p>Hypothetical whole-engagement assumptions. Remaining effort replaces the entire baseline remainder. Reporting-period fee or nonlabor observations are not whole-contract totals. These inputs change no plan, quote or assignment.</p><div className="profile-form-grid">
 <label>Remaining whole-engagement effort (hours)<input className="field" type="number" min="0" max="100000" value={remaining} onChange={e=>setRemaining(e.target.value)}/></label>
 <label>Hypothetical currency<select className="field" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">Choose an explicit currency</option>{['USD','EUR','GBP','CAD','AUD','JPY'].map(value=><option key={value}>{value}</option>)}</select></label>
 <label>Hypothetical whole-engagement fee (minor units)<input className="field" inputMode="numeric" value={fee} onChange={e=>setFee(e.target.value)}/></label>
 <label>Hypothetical whole-engagement nonlabor cost (minor units)<input className="field" inputMode="numeric" value={nonlabor} onChange={e=>setNonlabor(e.target.value)}/></label>
 <label>Hypothetical uniform loaded cost per hour (minor units)<input className="field" inputMode="numeric" value={rate} onChange={e=>setRate(e.target.value)}/></label></div>
 <p>A per-resource rate does not establish a uniform blended rate. Fee, nonlabor and rate inputs here are explicit whole-engagement assumptions.</p>
 <div aria-live="polite">{metrics?.status==='known'?<p>Hypothetical whole-engagement contribution: <strong>{metrics.contribution} {currency} minor units</strong> ({metrics.contributionPercent??'undefined'}%). Formula {metrics.metricVersion}.</p>:<p role="status">{metrics?.reasons.join(', ')||'Enter explicit bounded whole-engagement assumptions and currency. Missing amounts are not zero.'}</p>}</div></section>;
}
