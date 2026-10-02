"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StaffingFinanceInput } from "../../../lib/contracts/staffing-economics";
import { staffingGet, useStaffingCommand, useStaffingDirtyInputs } from "./client";
import { StaffingFinanceScenarios } from "./finance-scenarios";
type Identity = { inputId: string; kind: string; resourceId: string | null; customerId: string | null;
  engagementId: string | null; baselineId: string | null; revisionId: string; aggregateVersion: number };
type Detail = Identity & { withheld: boolean; contentDigest?: string; input: StaffingFinanceInput["input"] | null; provenance: string | null; rationale: string | null };
type Policy = { formulaVersion: string; inputPolicyDigest: string; policyApproval: "approved" | "unvalidated"; decisionId: string | null };
type Command = ReturnType<typeof useStaffingCommand>;
const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];
function CurrencyField({ initial = "" }: { initial?: string }) { return <label>Currency<select className="field" aria-label="Currency" name="currency" defaultValue={initial} required>
  <option value="" disabled>Choose currency</option>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>; }
function PeriodFields({ from = "", to = "" }: { from?: string; to?: string }) { return <>
  <label>First effective date<input className="field" name="fromDate" type="date" required min="2000-01-01" max="2100-12-31" defaultValue={from} /></label>
  <label>End date (exclusive)<input className="field" name="toDate" type="date" required min="2000-01-01" max="2100-12-31" defaultValue={to} /></label>
</>; }
function RevisionEditor({ detail, command, editing }: { detail: Detail; command: Command; editing: (value: boolean) => void }) {
  const [base, setBase] = useState<Detail | null>(null), edits = useStaffingDirtyInputs();
  if (detail.withheld || !detail.input) return null;
  return base?.input ? <form className="evidence-search-form" onChange={() => edits.touch("revision")} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), acknowledge = edits.confirmation("revision");
    const period = { ...base.input!, currency: data.get("currency"), fromDate: data.get("fromDate"), toDate: data.get("toDate") };
    const input = base.input!.kind === "rate" ? { ...period, minorUnitsPerHour: data.get("amount") } : { ...period, minorUnits: data.get("amount") };
    void command.save(`/api/staffing/finance/inputs/${base.inputId}`, { revisionId: base.revisionId, contentDigest: base.contentDigest,
      expectedAggregateVersion: base.aggregateVersion, input, provenance: data.get("provenance"), rationale: data.get("rationale") }, "PATCH", () => { if (acknowledge()) { setBase(null); editing(false); } });
  }}><h3>Revise finance input</h3><p>Revision {base.revisionId}. Resource and baseline ownership remain fixed.</p>
    {base.aggregateVersion !== detail.aggregateVersion && <p role="status">This input changed. Reopen to use its current revision.</p>}
    <CurrencyField initial={base.input.currency} /><PeriodFields from={base.input.fromDate} to={base.input.toDate} />
    <label>{base.input.kind === "rate" ? "Rate (minor units per hour)" : "Entered total (minor units)"}<input className="field" name="amount" required pattern="0|[1-9][0-9]*"
      maxLength={base.input.kind === "rate" ? 9 : 13} defaultValue={base.input.kind === "rate" ? base.input.minorUnitsPerHour : base.input.minorUnits} /></label>
    <label>Provenance reference<textarea className="field" name="provenance" required maxLength={2000} defaultValue={base.provenance ?? ""} /></label>
    <label>Revision rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
    <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save finance revision</button>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved finance changes?")) { edits.confirmation("revision")(); setBase(null); editing(false); }
    }}>Close finance editor</button>
  </form> : <button className="secondary-button" disabled={command.busy || !!command.uncertainKey} onClick={() => { setBase({ ...detail }); editing(true); }}>Revise this input</button>;
}
export function StaffingFinance({ csrfToken }: { csrfToken: string }) {
  const [items, setItems] = useState<Identity[]>([]), [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<Detail | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null), [error, setError] = useState(""), [kind, setKind] = useState<"rate" | "contracted_revenue" | "nonlabor">("rate");
  const edits = useStaffingDirtyInputs();
  const [editingInputId, setEditingInputId] = useState<string | null>(null);
  const reads = useRef(0), selectionReads = useRef(0);
  async function load(next: string | null = null) {
    const ticket = ++reads.current, selectionTicket = next ? selectionReads.current : ++selectionReads.current;
    const selectedId = selected?.inputId;
    try {
      const page = await staffingGet<{ items: Identity[]; nextCursor: string | null }>(`/api/staffing/finance/inputs${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
      const currentPolicy = next ? null : await staffingGet<Policy>("/api/staffing/finance/policy-decisions");
      const detail = !next && selectedId ? await staffingGet<Detail>(`/api/staffing/finance/inputs/${selectedId}`) : null;
      if (reads.current !== ticket) return;
      setItems(old => next ? [...new Map([...old, ...page.items].map(item => [item.inputId, item])).values()] : page.items); setCursor(page.nextCursor);
      if (currentPolicy) setPolicy(currentPolicy);
      if (detail && selectionReads.current === selectionTicket) { setSelected(detail); if (detail.withheld) setEditingInputId(null); }
      setError("");
    } catch {
      if (reads.current !== ticket) return;
      ++selectionReads.current;
      setItems([]); setSelected(null); setEditingInputId(null); setPolicy(null); setCursor(null); setError("Finance unavailable. Reload to check current authority and inputs."); }
  }
  useEffect(() => { void load(); return () => { ++reads.current; ++selectionReads.current; }; }, []);
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  return <>
    <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href="/staffing/resources">Resources</Link><span aria-hidden="true">/</span><span>Planning finance</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Finance</p><h1>Planning finance inputs</h1>
      <p>Entered rates and totals support planning. Formula approval does not approve a quote or actual profit.</p></div></header>
    {error && <p role="alert">{error}</p>}{command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    <button className="secondary-button" onClick={() => void load()}>Reload finance status</button>
    {policy && <section className="profile-section"><h2>Formula and input policy</h2><p>{policy.formulaVersion} · {policy.policyApproval}</p>
      <p>Contribution subtracts loaded delivery cost and entered nonlabor cost from entered contracted revenue. Missing or mixed-currency inputs remain incomplete.
        Service-rate revenue is a separate hypothetical estimate. Costs group by resource, local date and rate revision before rounding once to the nearest minor unit.</p>
      <p className="evidence-citation">Policy digest: {policy.inputPolicyDigest}</p>
      <form className="evidence-search-form" onChange={() => edits.touch("policy")} onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
        void command.save("/api/staffing/finance/policy-decisions", { formulaVersion: policy.formulaVersion, inputPolicyDigest: policy.inputPolicyDigest,
          rationale: data.get("rationale") }, "POST", edits.confirmation("policy", form));
      }}><label>Policy approval rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
        <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Approve this planning formula and policy</button>
      </form></section>}
    <section className="profile-section"><form className="evidence-search-form" onChange={() => edits.touch("new-input")} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form), period = { currency: data.get("currency"), fromDate: data.get("fromDate"), toDate: data.get("toDate") };
      const input = kind === "rate" ? { ...period, kind, rateKind: data.get("rateKind"), resourceId: data.get("resourceId"), minorUnitsPerHour: data.get("amount") }
        : { ...period, kind, engagementId: data.get("engagementId"), baselineId: data.get("baselineId"), minorUnits: data.get("amount") };
      void command.save("/api/staffing/finance/inputs", { input, provenance: data.get("provenance"), rationale: data.get("rationale") }, "POST", edits.confirmation("new-input", form));
    }}><h2>Enter a finance input</h2>
      <label>Input kind<select className="field" aria-label="Input kind" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="rate">Effective hourly rate</option><option value="contracted_revenue">Contracted revenue</option><option value="nonlabor">Nonlabor cost</option></select></label>
      {kind === "rate" ? <><label>Rate kind<select className="field" aria-label="Rate kind" name="rateKind"><option value="loaded_cost">Loaded delivery cost</option><option value="service">Service rate (hypothetical revenue)</option></select></label>
        <label>Canonical resource ID<input className="field" name="resourceId" required /></label></> : <>
        <label>Engagement ID<input className="field" name="engagementId" required /></label><label>Accepted baseline ID<input className="field" name="baselineId" required /></label></>}
      <CurrencyField /><PeriodFields />
      <p>Periods include the first date and exclude the end date. Entered revenue and nonlabor totals apply to that exact period, without proration.
        Use integer minor units: 100 USD cents means USD 1; 100 JPY means JPY 100.</p>
      <label>{kind === "rate" ? "Rate (minor units per hour)" : "Entered total (minor units)"}<input className="field" name="amount" required pattern="0|[1-9][0-9]*" maxLength={kind === "rate" ? 9 : 13} /></label>
      <label>Provenance reference<textarea className="field" name="provenance" required maxLength={2000} /></label>
      <label>Input rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save entered finance input</button>
    </form></section>
    <section className="profile-section"><h2>Versioned input history</h2>
      {!items.length && !error && <p>No finance inputs available.</p>}
      <div className="profile-grid">{items.map(item => <article className="profile-card evidence-citation" key={item.inputId}><h3>{item.kind.replaceAll("_", " ")}</h3>
        <p>{item.resourceId ? `Resource ${item.resourceId}` : `Baseline ${item.baselineId}`}</p>
        <button className="secondary-button" disabled={command.busy || !!command.uncertainKey || !!editingInputId} onClick={() => {
          const ticket = ++selectionReads.current; setSelected(null);
          void staffingGet<Detail>(`/api/staffing/finance/inputs/${item.inputId}`).then(value => {
            if (selectionReads.current === ticket) { setSelected(value); setError(""); }
          }).catch(() => {
            if (selectionReads.current === ticket) { setSelected(null); setEditingInputId(null); setError("Input unavailable. Reload finance status."); }
          });
        }}>Review input {item.inputId}</button></article>)}</div>
      {cursor && <button className="secondary-button" onClick={() => void load(cursor)}>More finance inputs</button>}
    </section>
    {selected && <section className="profile-section evidence-citation"><h2>Selected input</h2><p>{selected.inputId} · revision {selected.revisionId}</p>
      {selected.withheld || !selected.input ? <p>Financial values and provenance are withheld because current resource or baseline eligibility changed.</p> : <>
        <p>{selected.input.currency} · {selected.input.kind === "rate" ? `${selected.input.minorUnitsPerHour} minor units/hour` : `${selected.input.minorUnits} minor units`}
          · {selected.input.fromDate} to {selected.input.toDate} (exclusive)</p><p>Provenance: {selected.provenance}</p>
        <RevisionEditor key={selected.inputId} detail={selected} command={command} editing={value => setEditingInputId(value ? selected.inputId : null)} />
      </>}
    </section>}
    <StaffingFinanceScenarios csrfToken={csrfToken} />
  </>;
}
