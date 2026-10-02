"use client";
import { useEffect, useRef, useState } from "react";
import type { readStaffingScenario } from "../../../lib/server/staffing/scenarios";
import type { readStaffingEngagement } from "../../../lib/server/staffing/engagements";
import { staffingGet, useStaffingCommand, useStaffingDirtyInputs } from "./client";
import { staffingMoney } from "./format";
type Scenario = Awaited<ReturnType<typeof readStaffingScenario>>;
type Baseline = Awaited<ReturnType<typeof readStaffingEngagement>>;
type Item = { scenarioId: string; fromDate: string; toDate: string; asOf: string };
export function StaffingFinanceScenarios({ csrfToken }: { csrfToken: string }) {
  const [customers, setCustomers] = useState<{ id: string; displayName: string }[]>([]), [customerId, setCustomerId] = useState("");
  const [engagements, setEngagements] = useState<{ engagementId: string; title: string | null }[]>([]);
  const [baseline, setBaseline] = useState<Baseline | null>(null), [captured, setCaptured] = useState<Baseline | null>(null);
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<Scenario | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), generation = useRef(0);
  const selectionGeneration = useRef(0);
  const selectedReadGeneration = useRef(0);
  const [customerCursor, setCustomerCursor] = useState<string | null>(null);
  const edits = useStaffingDirtyInputs();
  useEffect(() => { let active = true;
    void staffingGet<{ items: typeof customers; nextCursor: string | null }>("/api/customers?limit=50").then(page => {
      if (active) { setCustomers(page.items); setCustomerCursor(page.nextCursor); }
    }).catch(() => { if (active) setError("Customer choices unavailable."); });
    return () => { active = false; };
  }, []);
  async function loadList(id = customerId, next: string | null = null) {
    const ticket = generation.current;
    const page = await staffingGet<{ items: Item[]; nextCursor: string | null }>(`/api/staffing/finance/scenarios?customerId=${id}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
    if (ticket !== generation.current) return;
    setItems(old => next ? [...old, ...page.items] : page.items); setCursor(page.nextCursor);
  }
  const command = useStaffingCommand(csrfToken, async result => {
    await loadList();
    if (result.scenarioId) {
      const ticket = ++selectionGeneration.current;
      const read = ++selectedReadGeneration.current;
      const detail = await staffingGet<Scenario>(`/api/staffing/finance/scenarios/${result.scenarioId}`);
      if (ticket === selectionGeneration.current && read === selectedReadGeneration.current) setSelected(detail);
    }
  });
  const blocked = loading || command.busy || !!command.uncertainKey;
  useEffect(() => {
    if (!selected) return;
    const id = selected.scenarioId;
    let active = true;
    const timer = window.setInterval(() => { const read = ++selectedReadGeneration.current;
      void staffingGet<Scenario>(`/api/staffing/finance/scenarios/${id}`).then(value => {
      if (active && read === selectedReadGeneration.current) setSelected(old => old?.scenarioId === id ? value : old);
    }).catch(() => { if (active && read === selectedReadGeneration.current) { setSelected(old => old?.scenarioId === id ? null : old); setError("Scenario unavailable. Reload its current authority and sources."); } }); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.scenarioId]);
  return <section className="profile-section"><h2>Planning Scenarios</h2>
    <p>Use confirmed, persisted allocation minutes and entered finance inputs. These snapshots are planning estimates; actual profit is unavailable.</p>
    {error && <p role="alert">{error}</p>}{command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check scenario save receipt</button>}
    <label>Scenario customer<select className="field" aria-label="Scenario customer" value={customerId} disabled={blocked} onChange={event => {
      if (edits.dirty && !window.confirm("Discard unsaved scenario changes?")) return;
      edits.confirmation("scenario")(); const id = event.target.value, ticket = ++generation.current;
      ++selectionGeneration.current;
      ++selectedReadGeneration.current;
      setCustomerId(id); setCaptured(null); setBaseline(null); setSelected(null); setItems([]); setCursor(null); setEngagements([]); setError("");
      if (!id) return; setLoading(true);
      void Promise.all([staffingGet<{ items: typeof engagements }>(`/api/engagements?customerId=${id}`), loadList(id)]).then(([page]) => {
        if (generation.current === ticket) setEngagements(page.items);
      }).catch(() => { if (generation.current === ticket) { setEngagements([]); setItems([]); setError("Customer scenarios unavailable."); } })
        .finally(() => { if (generation.current === ticket) setLoading(false); });
    }}><option value="">Choose customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select></label>
    {customerCursor && <button disabled={blocked} onClick={() => {
      setLoading(true); void staffingGet<{ items: typeof customers; nextCursor: string | null }>(`/api/customers?limit=50&cursor=${encodeURIComponent(customerCursor)}`)
        .then(page => { setCustomers(old => [...old, ...page.items]); setCustomerCursor(page.nextCursor); })
        .catch(() => setError("Customer choices unavailable.")).finally(() => setLoading(false));
    }}>More scenario customer choices</button>}
    <label>Scenario engagement<select className="field" aria-label="Scenario engagement" value={baseline?.engagementId ?? ""} disabled={!customerId || blocked} onChange={event => {
      if (edits.dirty && !window.confirm("Discard unsaved scenario changes?")) return;
      edits.confirmation("scenario")(); const id = event.target.value, ticket = ++generation.current;
      setCaptured(null); setBaseline(null); setError(""); if (!id) return; setLoading(true);
      void staffingGet<Baseline>(`/api/staffing/engagements/${id}?customerId=${customerId}`).then(value => {
        if (generation.current === ticket) { setBaseline(value); if (value.contentAvailability === "readable" && !value.reviewRequired) setCaptured(value); }
      }).catch(() => { if (generation.current === ticket) setError("Accepted baseline unavailable."); })
        .finally(() => { if (generation.current === ticket) setLoading(false); });
    }}><option value="">Choose engagement</option>{engagements.map(item => <option key={item.engagementId} value={item.engagementId}>{item.title ?? item.engagementId}</option>)}</select></label>
    {baseline && !captured && <p role="status">A readable accepted baseline without outstanding review is required.</p>}
    {captured && <form key={captured.baselineId} className="evidence-search-form" onChange={() => edits.touch("scenario")} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
      void command.save("/api/staffing/finance/scenarios", { customerId: captured.customerId, engagementId: captured.engagementId,
        baselineId: captured.baselineId, baselineDigest: captured.baselineDigest, currency: data.get("currency"),
        fromDate: data.get("fromDate"), toDate: data.get("toDate"), rationale: data.get("rationale") }, "POST", edits.confirmation("scenario", form));
    }}><p className="evidence-citation">Captured accepted baseline: {captured.baselineId}</p>
      <label>Scenario currency<select className="field" aria-label="Scenario currency" name="currency" required defaultValue=""><option value="" disabled>Choose currency</option>
        {["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Scenario first date<input className="field" type="date" name="fromDate" required min="2000-01-01" max="2100-12-31" /></label>
      <label>Scenario last date (inclusive)<input className="field" type="date" name="toDate" required min="2000-01-01" max="2100-12-31" /></label>
      <label>Scenario rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="primary-button" disabled={blocked}>Create planning scenario</button>
    </form>}
    <h3>Saved Scenario Snapshots</h3>
    {items.map(item => <p key={item.scenarioId}><button className="secondary-button" disabled={blocked} onClick={() => {
      const ticket = generation.current, selection = ++selectionGeneration.current, read = ++selectedReadGeneration.current; setSelected(null);
      void staffingGet<Scenario>(`/api/staffing/finance/scenarios/${item.scenarioId}`).then(value => { if (generation.current === ticket && selectionGeneration.current === selection && selectedReadGeneration.current === read) { setSelected(value); setError(""); } })
        .catch(() => { if (generation.current === ticket && selectionGeneration.current === selection && selectedReadGeneration.current === read) setError("Scenario unavailable."); });
    }}>Read scenario {item.scenarioId}</button> {item.fromDate} to {item.toDate} · {item.asOf}</p>)}
    {cursor && <button disabled={blocked} onClick={() => {
      setLoading(true); void loadList(customerId, cursor).catch(() => { setItems([]); setCursor(null); setError("Scenario history unavailable."); }).finally(() => setLoading(false));
    }}>More scenarios</button>}
    {selected && <article className="profile-card"><h3>Scenario {selected.scenarioId}</h3><p>{selected.status} · {selected.contentAvailability}</p>
      {selected.status === "stale" && <p role="status">Inputs changed. Any visible totals are the historical snapshot; create a new scenario for current inputs.</p>}
      {!selected.content ? <p>Scenario content is withheld or unavailable.</p> : <>
        <p>As of {selected.content.asOf} · {selected.content.currency} · {selected.content.coverage.confirmedMinutes} confirmed minutes</p>
        <p>Formula {selected.content.formulaVersion} · policy {selected.content.policyApproval}</p>
        {selected.content.reasons.length > 0 && <p>Incomplete: {selected.content.reasons.map(value => value.replaceAll("_", " ")).join(", ")}</p>}
        <dl className="staffing-metrics">{[["Contracted revenue", selected.content.contractedRevenue], ["Entered nonlabor cost", selected.content.nonlaborCost],
          ["Loaded delivery cost", selected.content.deliveryCost], ["Planned contribution", selected.content.contribution],
          ["Hypothetical service revenue", selected.content.hypotheticalServiceRevenue]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{staffingMoney(value, selected.content!.currency)}</dd></div>)}
          <div><dt>Planned margin</dt><dd>{selected.content.marginPercentage === null ? "Unavailable" : `${selected.content.marginPercentage}%`}</dd></div>
        </dl>
        <p>Amounts in {selected.content.currency} for {selected.content.scope.fromDate} through {selected.content.scope.toDate}. Contribution uses contracted revenue less loaded delivery and entered nonlabor costs. Hypothetical service revenue is a separate estimate. Margin is unavailable at zero revenue.</p>
        <details><summary>Exact Grouped Calculation Inputs</summary>{[...selected.content.costGroups.map(group => ({ ...group, kind: "Loaded cost" })),
          ...selected.content.serviceGroups.map(group => ({ ...group, kind: "Hypothetical service" }))].map(group => <p className="evidence-citation" key={`${group.kind}/${group.resourceId}/${group.localDate}/${group.rateRevisionId}`}>
          {group.kind} · resource {group.resourceId} · {group.localDate} · rate revision {group.rateRevisionId}: {group.minutes} minutes × {group.minorUnitsPerHour} / {group.divisor} = {group.amount} minor units after rounding</p>)}</details>
      </>}
    </article>}
  </section>;
}
