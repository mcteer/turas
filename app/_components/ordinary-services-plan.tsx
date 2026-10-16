"use client";

import { useState } from "react";
import { calculateServicesPlan, DEFAULT_SERVICES_PLAN, servicesPlanSchema, type ServicesPlan } from "../../lib/server/staffing/services-plan";

const fields: { key: keyof ServicesPlan; label: string; min: number; max: number; step: number }[] = [
  { key: "headcount", label: "Delivery headcount", min: 1, max: 100, step: 1 },
  { key: "deliveryWeeks", label: "Available weeks per year", min: 1, max: 52, step: 1 },
  { key: "weeklyHours", label: "Hours per available week", min: 1, max: 60, step: 1 },
  { key: "billablePercent", label: "Billable utilization (%)", min: 0, max: 100, step: 1 },
  { key: "protectedPercent", label: "Protected nonbillable time (%)", min: 0, max: 100, step: 1 },
  { key: "realizedHourlyRate", label: "Realized hourly rate ($)", min: 0, max: 10000, step: 1 },
  { key: "annualCostPerPerson", label: "Annual loaded cost per person ($)", min: 0, max: 2000000, step: 1000 },
  { key: "annualOverhead", label: "Annual function overhead ($)", min: 0, max: 10000000, step: 1000 },
  { key: "annualNonLaborCost", label: "Annual delivery nonlabor cost ($)", min: 0, max: 10000000, step: 1000 },
  { key: "targetMarginPercent", label: "Target operating margin (%)", min: 0, max: 95, step: 1 },
];
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);

export function ServicesPlanControls() {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(DEFAULT_SERVICES_PLAN).map(([key, value]) => [key, String(value)])));
  const parsed = servicesPlanSchema.safeParse(Object.fromEntries(fields.map(({ key }) => [key, draft[key]?.trim() ? Number(draft[key]) : NaN])));
  const forecast = parsed.success ? calculateServicesPlan(parsed.data) : null;
  return <section className="profile-section" aria-labelledby="plan-heading">
    <div className="profile-section-head"><h2 id="plan-heading">Annual Services Plan</h2></div>
    <p>Explicit hypothetical assumptions. Changes do not book revenue, approve a price or assign staff.</p>
    <div className="profile-form-grid">{fields.map(({key,label,min,max,step})=><label key={key}>{label}<input className="field" type="number" min={min} max={max} step={step} value={draft[key]??''} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></label>)}</div>
    <button className="secondary-button" onClick={()=>setDraft(Object.fromEntries(Object.entries(DEFAULT_SERVICES_PLAN).map(([key,value])=>[key,String(value)])))}>Reset assumptions</button>
    {!forecast||!parsed.success?<p role="alert">Enter a number within each field’s limits. Empty inputs are not zero.</p>:<div aria-live="polite">
      <dl className="staffing-metrics">{[
       ['Modeled annual revenue',dollars(forecast.revenue)],['Annual payroll and other costs',dollars(forecast.totalCost)],['Operating contribution',dollars(forecast.operatingContribution)],['Operating margin',forecast.operatingMarginPercent===null?'Undefined at zero revenue':`${forecast.operatingMarginPercent}%`],['Billable hours',forecast.billableHours.toLocaleString('en-US')],['Break-even utilization',forecast.breakEvenUtilizationPercent===null?'Unavailable at zero rate':`${forecast.breakEvenUtilizationPercent}%`],['Rate for target margin',forecast.targetRate===null?'Unavailable at zero billable hours':dollars(forecast.targetRate)],['Billable ceiling after protected time',`${forecast.maximumBillablePercent}%`]
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {!forecast.capacityFeasible&&<p role="alert">Infeasible capacity: billable utilization plus protected time exceeds 100%.</p>}
      {!forecast.breakEvenFeasible&&<p role="alert">This rate and cost base cannot break even within protected capacity. Reprice, change scope/cost or review an explicit investment subsidy.</p>}
      <details><summary>Show calculation and sensitivity</summary><p>Available hours = headcount × available weeks × weekly hours. Revenue = available hours × billable utilization × realized rate. Costs = full annual payroll + overhead + nonlabor. Contribution = revenue − costs. Target rate = costs ÷ billable hours ÷ (1 − target margin).</p><p>Leave reduces capacity, not payroll. Protected time covers presales, enablement and reusable work. Platform ARR, tax, financing and other corporate allocations are excluded. This scenario does not annualize engagement records.</p><div className="staffing-table-scroll"><table className="staffing-table"><caption>Utilization sensitivity at the current rate and cost base</caption><thead><tr><th>Utilization</th><th>Revenue</th><th>Contribution</th><th>Capacity</th></tr></thead><tbody>{[50,65,75].map(billablePercent=>{const scenario=calculateServicesPlan({...parsed.data,billablePercent});return <tr key={billablePercent}><td>{billablePercent}%</td><td>{dollars(scenario.revenue)}</td><td>{dollars(scenario.operatingContribution)}</td><td>{scenario.capacityFeasible?'Within ceiling':'Exceeds ceiling'}</td></tr>;})}</tbody></table></div></details>
    </div>}
  </section>;
}
