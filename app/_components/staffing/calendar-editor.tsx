"use client";

import { titleCaseLabel } from "../title-case-label";
import { useEffect, useRef, useState } from "react";
import type { StaffingCalendarInput } from "../../../lib/contracts/staffing-calendar";
import type { readCalendar } from "../../../lib/server/staffing/calendars";
import { staffingGet, useStaffingCommand, useStaffingDirtyInputs } from "./client";

type Calendar = Awaited<ReturnType<typeof readCalendar>>;
type Kind = "contracted" | "holidays" | "leave" | "protected";
const kinds: { key: Kind; label: string }[] = [
  { key: "contracted", label: "Contracted work" }, { key: "holidays", label: "Holiday" },
  { key: "leave", label: "Approved leave" }, { key: "protected", label: "Protected time" },
];
type Draft = { calendar: StaffingCalendarInput; rationale: string;
  head: { revisionId: string; contentDigest: string; expectedAggregateVersion: number } | null };
function dates(from: string, to: string) {
  const start = Date.parse(from), count = (Date.parse(to) - start) / 86_400_000 + 1;
  if (!Number.isInteger(count) || count < 1 || count > 91) return null;
  return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

export function StaffingCalendar({ resourceId, csrfToken }: { resourceId: string; csrfToken: string }) {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [calendar, setCalendar] = useState<Calendar | null>(null), [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const sequence = useRef(0), edits = useStaffingDirtyInputs();
  useEffect(() => () => { sequence.current++; }, [resourceId]);
  async function load() {
    if (!dates(from, to)) { setError("Choose one to 91 inclusive dates."); return; }
    const request = ++sequence.current;
    try {
      const result = await staffingGet<Calendar>(`/api/staffing/resources/${resourceId}/calendar?fromDate=${from}&toDate=${to}`);
      if (request !== sequence.current) return;
      setCalendar(result); setError("");
      if (!("manager" in result) || !result.active) setDraft(null);
    } catch (cause) {
      if (request !== sequence.current) return;
      setCalendar(null); setDraft(null); setError(cause instanceof Error ? cause.message : "Calendar unavailable");
    }
  }
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  function open() {
    if (!calendar || !("manager" in calendar) || !calendar.active) return;
    if (edits.dirty && !window.confirm("Discard unsaved calendar changes and open the current revision?")) return;
    edits.confirmation("calendar")();
    const source = calendar.manager?.calendar;
    setDraft({ calendar: source ? structuredClone(source) : { timezone: calendar.timezone,
      observedAt: "", nextReviewAt: "", fromDate: calendar.fromDate, toDate: calendar.toDate,
      days: dates(calendar.fromDate, calendar.toDate)!.map(date => ({ date, contracted: [], holidays: [], leave: [], protected: [] })) },
      rationale: "", head: calendar.revisionId && calendar.contentDigest && calendar.aggregateVersion
        ? { revisionId: calendar.revisionId, contentDigest: calendar.contentDigest, expectedAggregateVersion: calendar.aggregateVersion } : null });
  }
  function change(update: (prior: Draft) => Draft) { edits.touch("calendar"); setDraft(prior => prior ? update(prior) : null); }
  const stale = draft && calendar && (draft.head?.revisionId !== (calendar.revisionId ?? undefined) ||
    draft.head?.expectedAggregateVersion !== (calendar.aggregateVersion ?? undefined));
  return <section className="profile-section"><h2>Approved Calendar And Capacity</h2>
    <p>Dates and working intervals use the resource timezone. Missing calendar dates are unknown; explicitly empty dates have zero approved working time.</p>
    <form className="evidence-search-form" onSubmit={event => { event.preventDefault(); void load(); }}>
      <label>Capacity from date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Capacity through date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button className="secondary-button">Read capacity</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {calendar && <><p>Resource timezone: {calendar.timezone} · as of {calendar.asOf}</p>
      <ul>{calendar.days.map(day => <li key={day.date}>{day.date} · {day.capacity
        ? `available ${day.capacity.availableMinutes} minutes · confirmed ${day.confirmedMinutes} · remaining ${day.capacity.remainingMinutes} · planned billable utilization ${day.capacity.plannedBillableRatio ?? "unavailable"}${day.capacity.plannedBillableRatio === null ? "" : "%"}`
        : "approved capacity unknown"} · tentative {day.tentativeMinutes} · {day.freshness}{day.needsReview ? " · needs review" : ""}</li>)}</ul>
      <p>Actual utilization is unavailable.</p>
      {"manager" in calendar && calendar.active && <button className="secondary-button" disabled={command.busy || !!command.uncertainKey} onClick={open}>Open exact calendar for approval</button>}
    </>}
    {draft && calendar && "manager" in calendar && calendar.active && <form className="evidence-search-form" onSubmit={event => {
      event.preventDefault(); const acknowledge = edits.confirmation("calendar");
      void command.save(`/api/staffing/resources/${resourceId}/calendar`, { ...(draft.head ?? {}),
        calendar: draft.calendar, rationale: draft.rationale }, "POST", () => { if (acknowledge()) setDraft(null); });
    }}>
      <h3>Calendar Approval In {draft.calendar.timezone}</h3>
      <p>Only these explicitly certified dates are replaced. Confirmed assignments remain recorded.</p>
      {stale && <p role="alert">The calendar head changed. Your inputs are retained; review the current revision before submitting.</p>}
      <label>Observation timestamp with UTC offset<input className="field" required placeholder="2026-09-30T09:00:00-06:00" value={draft.calendar.observedAt} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, observedAt: event.target.value } }))} /></label>
      <label>Next review timestamp with UTC offset<input className="field" required value={draft.calendar.nextReviewAt} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, nextReviewAt: event.target.value } }))} /></label>
      <label>Certified from date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={draft.calendar.fromDate} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, fromDate: event.target.value } }))} /></label>
      <label>Certified through date<input className="field" type="date" required min="2000-01-01" max="2100-12-31" value={draft.calendar.toDate} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, toDate: event.target.value } }))} /></label>
      <button type="button" className="secondary-button" onClick={() => {
        const selected = dates(draft.calendar.fromDate, draft.calendar.toDate);
        if (!selected) { setError("Choose one to 91 inclusive certified dates."); return; }
        const old = new Map(draft.calendar.days.map(day => [day.date, day]));
        if (draft.calendar.days.some(day => !selected.includes(day.date)) && !window.confirm("Discard intervals outside the new certified period?")) return;
        change(prior => ({ ...prior, calendar: { ...prior.calendar, days: selected.map(date => old.get(date) ?? { date, contracted: [], holidays: [], leave: [], protected: [] }) } }));
      }}>Apply certified date range</button>
      {draft.calendar.days.map((day, index) => <fieldset key={day.date}><legend>{day.date} In {draft.calendar.timezone}</legend>
        {kinds.map(({ key, label }) => <div key={key}><h4>{titleCaseLabel(label)}</h4>
          {day[key].map((window, ordinal) => <div key={ordinal} className="profile-grid">
            <label>{label} start<input className="field" type="datetime-local" step={60} required value={window.from} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, [key]: item[key].map((entry, n) => n !== ordinal ? entry : { ...entry, from: event.target.value }) }) } }))} /></label>
            <label>{label} end<input className="field" type="datetime-local" step={60} required value={window.to} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, [key]: item[key].map((entry, n) => n !== ordinal ? entry : { ...entry, to: event.target.value }) }) } }))} /></label>
            {(["fromOffset", "toOffset"] as const).map(field => <label key={field}>{label} {field === "fromOffset" ? "start" : "end"} explicit offset (optional)<input className="field" placeholder="-06:00" pattern="[+-][0-9]{2}:[0-9]{2}" value={window[field] ?? ""} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, [key]: item[key].map((entry, n) => n !== ordinal ? entry : { ...entry, [field]: event.target.value || null }) }) } }))} /></label>)}
            {key === "leave" && <label>Approved leave category<select className="field" aria-label="Approved leave category" value={"category" in window ? window.category ?? "" : ""} onChange={event => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, leave: item.leave.map((entry, n) => n !== ordinal ? entry : { ...entry, category: (event.target.value || undefined) as "approved_leave" | "annual_leave" | "other" | undefined }) }) } }))}><option value="">Unspecified</option><option value="approved_leave">Approved leave</option><option value="annual_leave">Annual leave</option><option value="other">Other approved leave</option></select></label>}
            <button type="button" className="secondary-button" onClick={() => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, [key]: item[key].filter((_, n) => n !== ordinal) }) } }))}>Remove {label.toLowerCase()} interval</button>
          </div>)}
          <button type="button" className="secondary-button" disabled={key === "contracted" ? day.contracted.length >= 8 : day.holidays.length + day.leave.length + day.protected.length >= 16} onClick={() => change(prior => ({ ...prior, calendar: { ...prior.calendar, days: prior.calendar.days.map((item, i) => i !== index ? item : { ...item, [key]: [...item[key], { date: day.date, from: "", to: "", fromOffset: null, toOffset: null }] }) } }))}>Add {label.toLowerCase()} interval</button>
        </div>)}
      </fieldset>)}
      <label>Calendar approval rationale<textarea className="field" required maxLength={2000} value={draft.rationale} onChange={event => change(prior => ({ ...prior, rationale: event.target.value }))} /></label>
      <button className="primary-button" disabled={command.busy || !!command.uncertainKey || !!stale || !calendar || !("manager" in calendar) || !calendar.active}>Approve exact calendar</button>
    </form>}
    {command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button className="secondary-button" disabled={command.busy} onClick={() => void command.reconcile()}>Check calendar save receipt</button>}
  </section>;
}
