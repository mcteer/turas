"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { calculateServicesPlan, DEFAULT_SERVICES_PLAN, servicesPlanSchema, type ServicesPlan } from "@/lib/demo/services-plan";

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
  return <section className="rounded-xl border bg-card p-5" aria-labelledby="plan-heading">
    <h2 id="plan-heading" className="text-xl font-semibold tracking-tight">Annual services plan</h2>
    <p className="mt-2 text-sm text-muted-foreground">Synthetic planning assumptions. Changes are temporary and do not book revenue, approve a price, or assign staff.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(({ key, label, min, max, step }) => <label key={key} className="space-y-1.5 text-sm font-medium">{label}<Input type="number" min={min} max={max} step={step} value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    </div>
    <Button className="mt-4" variant="outline" onClick={() => setDraft(Object.fromEntries(Object.entries(DEFAULT_SERVICES_PLAN).map(([key, value]) => [key, String(value)])))}>Reset assumptions</Button>
    {!forecast || !parsed.success ? <p className="mt-5 text-destructive" role="alert">Enter a number within each field’s stated limits. Empty inputs are not treated as zero.</p> : <div className="mt-6" aria-live="polite">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Modeled annual revenue", dollars(forecast.revenue)],
          ["Annual payroll + other costs", dollars(forecast.totalCost)],
          ["Operating contribution", dollars(forecast.operatingContribution)],
          ["Operating margin", forecast.operatingMarginPercent === null ? "Undefined at zero revenue" : `${forecast.operatingMarginPercent}%`],
          ["Billable hours", forecast.billableHours.toLocaleString("en-US")],
          ["Break-even utilization", forecast.breakEvenUtilizationPercent === null ? "Unavailable at zero rate" : `${forecast.breakEvenUtilizationPercent}%`],
          ["Rate for target margin", forecast.targetRate === null ? "Unavailable at zero billable hours" : dollars(forecast.targetRate)],
          ["Billable ceiling after protected time", `${forecast.maximumBillablePercent}%`],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      {!forecast.capacityFeasible ? <p className="mt-4 rounded-md bg-amber-100 p-3 text-sm text-amber-950" role="alert">Infeasible capacity: billable utilization plus protected time exceeds 100%. Change the plan before making a staffing commitment.</p> : null}
      {!forecast.breakEvenFeasible ? <p className="mt-4 rounded-md bg-amber-100 p-3 text-sm text-amber-950" role="alert">This rate and cost base cannot break even within protected capacity. Reprice, change scope/cost, or approve an explicit investment subsidy.</p> : null}
      <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium">Show calculation and sensitivity</summary>
        <p className="mt-3">Available hours = headcount × available weeks × weekly hours. Revenue = available hours × billable utilization × realized rate. Costs = full annual payroll + function overhead + delivery nonlabor costs. Operating contribution = revenue − costs. Target rate = costs ÷ billable hours ÷ (1 − target margin).</p>
        <p className="mt-2 text-muted-foreground">Annual salary includes paid leave and benefits. The 46-week default excludes leave/holidays from capacity; it does not reduce payroll. Protected time covers presales (15%) and enablement/reusable work (10%). No platform ARR, tax, financing costs, or corporate allocations beyond the entered overhead are included. This independent annual scenario is not an annualization of the four engagement records.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><caption className="mb-2 text-left font-medium">Utilization sensitivity at the current rate and cost base</caption><thead><tr><th className="p-2">Utilization</th><th className="p-2">Revenue</th><th className="p-2">Contribution</th><th className="p-2">Capacity</th></tr></thead><tbody>{[50, 65, 75].map((billablePercent) => {
          const scenario = calculateServicesPlan({ ...parsed.data, billablePercent });
          return <tr key={billablePercent} className="border-t"><td className="p-2">{billablePercent}%</td><td className="p-2">{dollars(scenario.revenue)}</td><td className="p-2">{dollars(scenario.operatingContribution)}</td><td className="p-2">{scenario.capacityFeasible ? "Within ceiling" : "Exceeds ceiling"}</td></tr>;
        })}</tbody></table></div>
      </details>
    </div>}
  </section>;
}
