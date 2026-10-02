"use client";

import { titleCaseLabel } from "../title-case-label";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StaffingDemandInput } from "../../../lib/contracts/staffing-demands";
import type { StaffingEngagement } from "../../../lib/server/staffing/engagements";
import type { readDemand } from "../../../lib/server/staffing/demands";
import { staffingGet, useStaffingCommand, useStaffingDirtyInputs } from "./client";
import { StaffingMatches } from "./matches";
import { StaffingAllocationReview } from "./allocation-review";
import { StaffingAdvisory } from "./advisory";
type Demand = Awaited<ReturnType<typeof readDemand>>;
type Skill = { skillId: string; name: string; state: string };
type SkillRequirement = StaffingDemandInput["requiredSkills"][number];
type Command = ReturnType<typeof useStaffingCommand>;
function serviceDates(from: string, to: string) {
  const first = Date.parse(from), last = Date.parse(to), span = (last - first) / 86_400_000;
  if (!Number.isInteger(span) || span < 0 || span > 90) return [];
  return Array.from({ length: span + 1 }, (_, day) => new Date(first + day * 86_400_000).toISOString().slice(0, 10));
}
function SkillFields({ label, value, set, skills }: { label: string; value: SkillRequirement[];
  set: (value: SkillRequirement[]) => void; skills: Skill[] }) {
  return <fieldset><legend>{titleCaseLabel(label)}</legend>{value.map((requirement, index) => <div key={index} className="profile-card">
    <label>{label} {index + 1}<select className="field" aria-label={`${label} ${index + 1}`} value={requirement.skillId} required onChange={event => set(value.map((old, i) => i === index ? { ...old, skillId: event.target.value } : old))}>
      <option value="" disabled>Choose skill</option>{!skills.some(skill => skill.skillId === requirement.skillId) && requirement.skillId &&
        <option value={requirement.skillId}>Previously selected skill — review current taxonomy</option>}
      {skills.filter(skill => skill.state === "active").map(skill => <option key={skill.skillId} value={skill.skillId}>{skill.name}</option>)}
    </select></label>
    <label>Minimum level for {label.toLowerCase()} {index + 1}<select className="field" aria-label={`Minimum level for ${label.toLowerCase()} ${index + 1}`} value={requirement.minimumLevel}
      onChange={event => set(value.map((old, i) => i === index ? { ...old, minimumLevel: Number(event.target.value) } : old))}>
      <option value={1}>1 · Assisted</option><option value={2}>2 · Independent</option><option value={3}>3 · Advanced</option><option value={4}>4 · Mentor</option>
    </select></label><button type="button" onClick={() => set(value.filter((_, i) => i !== index))}>Remove {label.toLowerCase()} {index + 1}</button>
  </div>)}<button type="button" disabled={value.length >= 20} onClick={() => set([...value, { skillId: "", minimumLevel: 1 }])}>Add {label.toLowerCase()}</button></fieldset>;
}
function DemandForm({ engagement, skills, command, base, saved, close }: { engagement: StaffingEngagement; skills: Skill[];
  command: Command; base?: Demand; saved: () => void; close: () => void }) {
  // Capture the exact baseline and head once. Background reload never rebases
  // an open editor or substitutes a newly accepted work package.
  const [captured] = useState(() => ({ engagement, base })), initial = captured.base?.demand;
  const [from, setFrom] = useState(initial?.fromDate ?? ""), [to, setTo] = useState(initial?.toDate ?? "");
  const [required, setRequired] = useState<SkillRequirement[]>(initial?.requiredSkills ?? []);
  const [desired, setDesired] = useState<SkillRequirement[]>(initial?.desiredSkills ?? []);
  const [overlap, setOverlap] = useState<StaffingDemandInput["overlap"]>(initial?.overlap ? structuredClone(initial.overlap) : null);
  const [minutes, setMinutes] = useState<Record<string, string>>(() => Object.fromEntries(initial?.days.map(day => [day.date, String(day.requiredMinutes)]) ?? []));
  const edits = useStaffingDirtyInputs(), dates = serviceDates(from, to);
  const changedBaseline = captured.engagement.baselineId !== engagement.baselineId;
  return <form className="evidence-search-form" onChange={() => edits.touch("demand")} onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const binding = captured.engagement;
    const demand = { customerId: binding.customerId, workloadId: binding.workloadId, engagementId: binding.engagementId,
      planId: initial?.planId ?? binding.planId, baselineId: initial?.baselineId ?? binding.baselineId,
      planRevisionId: initial?.planRevisionId ?? binding.planRevisionId, baselineDigest: initial?.baselineDigest ?? binding.baselineDigest,
      workPackageKey: data.get("workPackage"), title: data.get("title"), role: data.get("role"), fromDate: from, toDate: to,
      requiredSkills: required, desiredSkills: desired, days: dates.filter(date => Number(minutes[date]) > 0).map(date => ({ date, requiredMinutes: Number(minutes[date]) })),
      allowedRegions: String(data.get("regions") ?? "").split(",").map(value => value.trim()).filter(Boolean), billable: data.get("billable") === "on",
      overlap: overlap ? { ...overlap, windows: dates.filter(date => Number(minutes[date]) > 0).map(date => overlap.windows.find(window => window.date === date)
        ?? { date, from: "", to: "", fromOffset: null, toOffset: null }) } : null };
    const acknowledge = edits.confirmation("demand");
    const exact = captured.base ? { revisionId: captured.base.revisionId, contentDigest: captured.base.contentDigest,
      expectedAggregateVersion: captured.base.aggregateVersion } : {};
    void command.save(captured.base ? `/api/staffing/demands/${captured.base.demandId}` : "/api/staffing/demands",
      { ...exact, rationale: data.get("rationale"), demand }, captured.base ? "PATCH" : "POST", () => { if (acknowledge()) saved(); });
  }}><h2>{base ? "Revise Demand" : "Create Demand"}</h2>
    {changedBaseline && <p role="alert">The accepted baseline changed. Close and reopen this editor before saving against the new baseline.</p>}
    {initial && initial.baselineId !== engagement.baselineId && <p role="status">This demand retains a previous baseline. Create a new demand to use the current accepted work packages.</p>}
    {base && captured.base?.aggregateVersion !== base.aggregateVersion && <p role="status">This demand changed. Your inputs still use the revision opened for editing.</p>}
    <fieldset disabled={command.busy || !!command.uncertainKey || changedBaseline}><legend>Requested Work</legend>
      <label>Work package<select className="field" aria-label="Work Package" name="workPackage" required defaultValue={initial?.workPackageKey ?? ""}>
        <option value="" disabled>Choose accepted work package</option>{initial && initial.baselineId !== captured.engagement.baselineId
          ? <option value={initial.workPackageKey}>Existing demand work package</option>
          : captured.engagement.workPackages.map(work => <option key={work.key} value={work.key}>{work.title}</option>)}
      </select></label>
      <label>Demand title<input className="field" name="title" required maxLength={160} defaultValue={initial?.title} /></label>
      <label>Delivery role<input className="field" name="role" required maxLength={100} defaultValue={initial?.role} /></label>
      <label>First resource-local service date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Last resource-local service date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={to} onChange={event => setTo(event.target.value)} /></label>
      <p>Service dates are local dates for each selected resource. Enter daily effort in minutes; zero requests no work on that date. This is not a clock-time appointment.</p>
      {from && to && !dates.length && <p role="alert">Choose an ordered period of at most 91 dates.</p>}
      {dates.map(date => <label key={date}>Required minutes on {date}<input className="field" type="number" required min={0} max={960} step={1}
        value={minutes[date] ?? ""} onChange={event => setMinutes(old => ({ ...old, [date]: event.target.value }))} /></label>)}
      <SkillFields label="Required skill" value={required} set={setRequired} skills={skills} />
      <SkillFields label="Desired skill" value={desired} set={setDesired} skills={skills} />
      <label>Allowed region codes (comma separated; empty allows all)<input className="field" name="regions" maxLength={659} defaultValue={initial?.allowedRegions.join(", ")} /></label>
      <label><input name="billable" type="checkbox" defaultChecked={initial?.billable ?? false} /> Planned billable work</label>
      <label><input type="checkbox" checked={overlap !== null} onChange={event => {
        if (!event.target.checked && overlap && !window.confirm("Remove the separately zoned overlap requirement?")) return;
        setOverlap(event.target.checked ? { timezone: "", minimumOverlapMinutes: 0, windows: [] } : null);
      }} /> Require a separately zoned overlap window</label>
      {overlap && <fieldset><legend>Overlap Requirement</legend>
        <p>Choose the overlap timezone explicitly. These clock windows are separate from each resource's local daily effort. Ambiguous clock times require valid endpoint offsets.</p>
        <label>Overlap timezone<input className="field" required maxLength={100} placeholder="Europe/London" value={overlap.timezone} onChange={event => setOverlap(old => old ? { ...old, timezone: event.target.value } : null)} /></label>
        <label>Minimum overlap minutes<input className="field" type="number" required min={1} max={960} step={1} value={overlap.minimumOverlapMinutes || ""} onChange={event => setOverlap(old => old ? { ...old, minimumOverlapMinutes: Number(event.target.value) } : null)} /></label>
        {dates.filter(date => Number(minutes[date]) > 0).map(date => {
          const window = overlap.windows.find(window => window.date === date) ?? { date, from: "", to: "", fromOffset: null, toOffset: null };
          const update = (field: "from" | "to" | "fromOffset" | "toOffset", value: string | null) => setOverlap(old => old ? { ...old,
            windows: [...old.windows.filter(entry => entry.date !== date), { ...window, [field]: value }] } : null);
          return <fieldset key={date}><legend>Overlap On {date}</legend>
            <label>Overlap start on {date}<input className="field" type="datetime-local" required step={60} value={window.from} onChange={event => update("from", event.target.value)} /></label>
            <label>Overlap end on {date}<input className="field" type="datetime-local" required step={60} value={window.to} onChange={event => update("to", event.target.value)} /></label>
            <label>Overlap start offset on {date} (optional)<input className="field" pattern="[+-][0-9]{2}:[0-9]{2}" placeholder="+01:00" value={window.fromOffset ?? ""} onChange={event => update("fromOffset", event.target.value || null)} /></label>
            <label>Overlap end offset on {date} (optional)<input className="field" pattern="[+-][0-9]{2}:[0-9]{2}" placeholder="+01:00" value={window.toOffset ?? ""} onChange={event => update("toOffset", event.target.value || null)} /></label>
          </fieldset>;
        })}
      </fieldset>}
      <label>Rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="primary-button" disabled={!dates.length || !required.length}>Save demand draft</button>
    </fieldset>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved demand changes?")) { edits.confirmation("demand")(); close(); }
    }}>Close demand editor</button>
  </form>;
}
function DemandActions({ detail, command, edit, dirtyChanged }: { detail: Demand; command: Command; edit: () => void; dirtyChanged: (dirty: boolean) => void }) {
  const edits = useStaffingDirtyInputs(), [base, setBase] = useState(detail), blocked = command.busy || !!command.uncertainKey;
  useEffect(() => { dirtyChanged(edits.dirty); return () => dirtyChanged(false); }, [edits.dirty, dirtyChanged]);
  const stale = base.aggregateVersion !== detail.aggregateVersion || base.revisionId !== detail.revisionId;
  return <section className="profile-section"><h2>{detail.demand?.title ?? "Demand Requires Review"}</h2>
    <p>{detail.state} · {detail.contentAvailability}</p>
    {detail.reviewRequired && <p role="status">Baseline or source review is required before current staffing use.</p>}
    {stale && <p role="status">The demand action was opened for a previous revision. Review the current demand before continuing.</p>}
    {stale && <button disabled={blocked} onClick={() => {
      if (!edits.dirty || window.confirm("Use the current demand revision for your pending action?")) { setBase(detail); }
    }}>Review current demand action</button>}
    {detail.demand && <><p>{detail.demand.role} · {detail.demand.fromDate} through {detail.demand.toDate} · resource-local service dates</p>
      <ul>{detail.demand.days.map(day => <li key={day.date}>{day.date}: {day.requiredMinutes} minutes</li>)}</ul>
      {detail.state !== "cancelled" && <button disabled={blocked} onClick={() => {
        if (!edits.dirty || window.confirm("Discard the pending demand action and open the revision editor?")) edit();
      }}>Revise demand</button>}</>}
    {detail.state !== "cancelled" && <form className="evidence-search-form" onChange={() => edits.touch("action")} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form), action = data.get("action");
      void command.save(`/api/staffing/demands/${base.demandId}/${action}`, { revisionId: base.revisionId,
        contentDigest: base.contentDigest, expectedAggregateVersion: base.aggregateVersion, rationale: data.get("rationale") }, "POST", edits.confirmation("action", form));
    }}><label>Demand action<select className="field" aria-label="Demand action" name="action"><option value="cancel">Cancel demand</option>
      {base.state === "draft" && !base.reviewRequired && base.contentAvailability === "readable" && <option value="qualify">Qualify exact draft</option>}
    </select></label><label>Action rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <p>Cancelling demand preserves existing staffing commitments.</p><button className="secondary-button" disabled={blocked || stale}>Apply demand action</button>
    </form>}
  </section>;
}
export function StaffingDemandEditor({ customerId, engagementId, csrfToken, financeAllowed = false }: { customerId: string; engagementId: string; csrfToken: string; financeAllowed?: boolean }) {
  const [engagement, setEngagement] = useState<StaffingEngagement | null>(null), [skills, setSkills] = useState<Skill[]>([]);
  const [skillCursor, setSkillCursor] = useState<string | null>(null), [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<{ demandId: string; state: string }[]>([]), [selected, setSelected] = useState<Demand | null>(null);
  const [editor, setEditor] = useState<"new" | "revision" | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [actionsDirty, setActionsDirty] = useState(false);
  const [allocationsDirty, setAllocationsDirty] = useState(false);
  const [candidate, setCandidate] = useState<{ resourceId: string; displayName: string } | null>(null);
  const scopeKey = `${customerId}:${engagementId}`, scope = useRef(scopeKey);
  const reads = useRef(0), selections = useRef(0), skillReads = useRef(0), desiredSelection = useRef<string | null>(null);
  scope.current = scopeKey;
  useEffect(() => { setCandidate(null); }, [selected?.demandId, selected?.revisionId, selected?.reviewRequired]);
  async function load(next: string | null = null) {
    const ticket = ++reads.current, capturedScope = scopeKey, selectionTicket = selections.current,
      selectedId = desiredSelection.current;
    ++skillReads.current;
    setLoading(true);
    try {
      const context = await staffingGet<StaffingEngagement>(`/api/staffing/engagements/${engagementId}?customerId=${customerId}`);
      const page = await staffingGet<{ items: typeof items; nextCursor: string | null }>(`/api/staffing/demands?customerId=${customerId}&engagementId=${engagementId}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      const taxonomy = !next ? await staffingGet<{ items: Skill[]; nextCursor: string | null }>("/api/staffing/skills") : null;
      let current: Demand | null = null;
      if (!next && selectedId && selections.current === selectionTicket && desiredSelection.current === selectedId) {
        try { current = await staffingGet<Demand>(`/api/staffing/demands/${selectedId}`); }
        catch (cause) { if (selections.current === selectionTicket && desiredSelection.current === selectedId) throw cause; }
      }
      if (reads.current !== ticket || scope.current !== capturedScope) return;
      setEngagement(context); setItems(old => next ? [...new Map([...old, ...page.items].map(item => [item.demandId, item])).values()] : page.items); setCursor(page.nextCursor);
      if (taxonomy) { setSkills(taxonomy.items); setSkillCursor(taxonomy.nextCursor); }
      if (current && selections.current === selectionTicket && desiredSelection.current === selectedId) {
        setSelected(current); if (!current.demand) setEditor(null);
      }
      if (!["readable", "historical_warning"].includes(context.contentAvailability)) setEditor(null);
      setError("");
    } catch {
      if (reads.current !== ticket || scope.current !== capturedScope) return;
      ++selections.current; ++skillReads.current; desiredSelection.current = null;
      setError("Staffing context unavailable. Reload to check current authority and sources.");
      setEngagement(null); setItems([]); setCursor(null); setSelected(null); setCandidate(null); setEditor(null); setSkills([]); setSkillCursor(null);
    } finally { if (reads.current === ticket && scope.current === capturedScope) setLoading(false); }
  }
  async function openDemand(id: string) {
    const ticket = ++selections.current, capturedScope = scopeKey;
    const changed = desiredSelection.current !== id;
    desiredSelection.current = id;
    if (changed) { setSelected(null); setCandidate(null); }
    try {
      const detail = await staffingGet<Demand>(`/api/staffing/demands/${id}`);
      if (selections.current !== ticket || scope.current !== capturedScope || desiredSelection.current !== id) return;
      setSelected(detail); setError("");
    } catch {
      if (selections.current !== ticket || scope.current !== capturedScope) return;
      desiredSelection.current = null; setSelected(null); setCandidate(null); setEditor(null); setError("Demand unavailable. Reload current context.");
    }
  }
  useEffect(() => {
    desiredSelection.current = null; setSelected(null); setCandidate(null); setEditor(null); setEngagement(null); setItems([]); setSkills([]);
    setCursor(null); setSkillCursor(null); void load();
    return () => { ++reads.current; ++selections.current; ++skillReads.current; };
  }, [scopeKey]);
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  return <>
    <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href={`/customers/${customerId}/engagements/${engagementId}`}>Engagement</Link><span aria-hidden="true">/</span><span>Staffing Demand</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Accepted Engagement</p><h1>Staffing Demand</h1><p>{engagement?.title}</p></div></header>
    {loading && <p role="status">Loading staffing context…</p>}{error && <p role="alert">{error}</p>}
    {engagement?.reviewRequired && <p role="status">The accepted baseline needs source review. Demand qualification is unavailable.</p>}
    {command.message && <p role="status">{command.message}</p>}{command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    <button className="secondary-button" disabled={loading || command.busy || !!command.uncertainKey} onClick={() => void load()}>Reload staffing context</button>
    {!editor && engagement?.workPackages.length ? <button disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!(actionsDirty || allocationsDirty) || window.confirm("Discard pending staffing inputs and create a new demand?")) setEditor("new");
    }}>Create demand</button> : null}
    <section className="profile-section"><h2>Demand Records</h2>{!loading && !error && !items.length && <p>No demand has been created for this engagement.</p>}
      <ul>{items.map((item, index) => <li key={item.demandId}><button data-demand-id={item.demandId} disabled={loading || !!editor || command.busy || !!command.uncertainKey} onClick={() => {
        if ((actionsDirty || allocationsDirty) && !window.confirm("Switch demand and discard pending staffing inputs?")) return;
        void openDemand(item.demandId);
      }}>Open demand {index + 1} · {item.state}</button></li>)}</ul>
      {cursor && <button disabled={loading || command.busy || !!command.uncertainKey} onClick={() => void load(cursor)}>More demand records</button>}
    </section>
    {selected && !editor && <DemandActions key={`actions:${selected.demandId}`} detail={selected} command={command} dirtyChanged={setActionsDirty} edit={() => {
      if (!allocationsDirty || window.confirm("Discard pending allocation inputs and revise this demand?")) setEditor("revision");
    }} />}
    {selected && !editor && <StaffingMatches key={`matches:${selected.demandId}`} demand={selected} csrfToken={csrfToken} contextChanged={() => load()} selectResource={setCandidate} />}
    {selected && !editor && <StaffingAllocationReview key={`allocations:${selected.demandId}`} demand={selected} candidate={candidate} csrfToken={csrfToken} dirtyChanged={setAllocationsDirty} />}
    {selected && !editor && <StaffingAdvisory key={`advisory:${selected.demandId}`} demand={selected} csrfToken={csrfToken} financeAllowed={financeAllowed} />}
    {editor && engagement && (editor === "new" || selected?.demand) && <DemandForm engagement={engagement} skills={skills} command={command}
      base={editor === "revision" ? selected! : undefined} saved={() => setEditor(null)} close={() => setEditor(null)} />}
    {editor && skillCursor && <button disabled={loading} onClick={() => {
      const ticket = ++skillReads.current, capturedScope = scopeKey;
      void staffingGet<{ items: Skill[]; nextCursor: string | null }>(`/api/staffing/skills?cursor=${encodeURIComponent(skillCursor)}`)
        .then(page => { if (skillReads.current === ticket && scope.current === capturedScope) {
          setSkills(old => [...new Map([...old, ...page.items].map(item => [item.skillId, item])).values()]); setSkillCursor(page.nextCursor); }
        }).catch(() => { if (skillReads.current === ticket && scope.current === capturedScope) setError("Skills unavailable. Your demand inputs are retained."); });
    }}>More skill choices</button>}
  </>;
}
