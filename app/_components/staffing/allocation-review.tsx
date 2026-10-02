"use client";

import { titleCaseLabel } from "../title-case-label";
import { useEffect, useRef, useState } from "react";
import type { readDemand } from "../../../lib/server/staffing/demands";
import type { readAllocation, listAllocations } from "../../../lib/server/staffing/allocations";
import type { readAllocationReviewPreview } from "../../../lib/server/staffing/decisions";
import { staffingGet, useStaffingCommand, useStaffingDirtyInputs } from "./client";
type Demand = Awaited<ReturnType<typeof readDemand>>;
type Detail = Awaited<ReturnType<typeof readAllocation>>;
type Page = Awaited<ReturnType<typeof listAllocations>>;
type Preview = Awaited<ReturnType<typeof readAllocationReviewPreview>>;
type Candidate = { resourceId: string; displayName: string };
const exact = (detail: Detail) => ({ revisionId: detail.revisionId, contentDigest: detail.contentDigest,
  expectedAggregateVersion: detail.aggregateVersion });

function Review({ detail, demand, candidate, csrfToken, refresh, dirtyChanged }: { detail: Detail; demand: Demand;
  candidate: Candidate | null; csrfToken: string; refresh: () => Promise<void>; dirtyChanged: (dirty: boolean) => void }) {
  const [captured, setCaptured] = useState(detail), [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(""), [reading, setReading] = useState(false);
  const dirty = useStaffingDirtyInputs(), current = useRef(detail); current.current = detail;
  const previewReads = useRef(0), scope = useRef("");
  const scopeKey = JSON.stringify([detail.allocationId, detail.revisionId, detail.aggregateVersion,
    detail.contentDigest, detail.state, detail.reviewRequired, detail.canReview, detail.contentAvailability]);
  scope.current = scopeKey;
  function clearPreview() { ++previewReads.current; setPreview(null); setReading(false); }
  const command = useStaffingCommand(csrfToken, async result => {
    if (result.previewId) {
      const ticket = ++previewReads.current, capturedScope = scopeKey;
      setReading(true);
      try {
        const read = await staffingGet<Preview>(`/api/staffing/allocations/${detail.allocationId}/review-preview?previewId=${result.previewId}`);
        if (previewReads.current !== ticket || scope.current !== capturedScope) return;
        const now = current.current;
        if (!now.canReview || read.revisionId !== now.revisionId || read.aggregateVersion !== now.aggregateVersion || read.contentDigest !== now.contentDigest)
          throw new Error("Allocation changed before preview loaded");
        setPreview(read); setError("");
      } catch {
        if (previewReads.current !== ticket || scope.current !== capturedScope) return;
        clearPreview(); setError("Review unavailable. Reload current authority and staffing inputs.");
      } finally {
        if (previewReads.current === ticket && scope.current === capturedScope) setReading(false);
      }
    } else { clearPreview(); await refresh(); }
  });
  const stale = captured.revisionId !== detail.revisionId || captured.aggregateVersion !== detail.aggregateVersion || captured.contentDigest !== detail.contentDigest;
  const blocked = command.busy || !!command.uncertainKey || reading;
  function save(...args: Parameters<typeof command.save>) {
    void command.save(...args).then(saved => { if (!saved) { clearPreview(); void refresh(); } });
  }
  useEffect(() => { dirtyChanged(dirty.dirty || command.busy || !!command.uncertainKey); return () => dirtyChanged(false); },
    [dirty.dirty, command.busy, command.uncertainKey, dirtyChanged]);
  useEffect(() => { clearPreview(); return () => { ++previewReads.current; }; }, [scopeKey]);
  useEffect(() => {
    if (!preview) return;
    const timer = setInterval(() => {
      const ticket = ++previewReads.current, capturedScope = scopeKey;
      setReading(true);
      void staffingGet<Preview>(`/api/staffing/allocations/${detail.allocationId}/review-preview?previewId=${preview.previewId}`)
        .then(value => { if (previewReads.current === ticket && scope.current === capturedScope)
          setPreview(old => old?.previewId === value.previewId ? value : old); })
        .catch(() => { if (previewReads.current === ticket && scope.current === capturedScope) {
          clearPreview(); setError("Review expired or staffing inputs changed. Reload and prepare a fresh review."); } })
        .finally(() => { if (previewReads.current === ticket && scope.current === capturedScope) setReading(false); });
    }, 10_000);
    return () => { clearInterval(timer); ++previewReads.current; };
  }, [preview?.previewId, scopeKey]);
  const actions: Preview["action"][] = detail.state === "confirmed" ? ["amend", "release", "cancel"]
    : ["proposed", "tentative"].includes(detail.state) ? ["confirm"] : [];
  return <section className="profile-card"><h3>Allocation Review</h3>
    <p>{detail.state} · {detail.contentAvailability}</p>
    {detail.reviewRequired && <p role="status">Current staffing inputs need review. Existing commitments remain counted.</p>}
    {detail.reservationExpiresAt && <p>Tentative reservation expires {new Date(detail.reservationExpiresAt).toLocaleString()}. Tentative minutes do not consume confirmed capacity.</p>}
    {detail.allocation && <><p>Resource-local service dates · {detail.allocation.resourceTimezone}</p>
      <ul>{detail.allocation.days.map(day => <li key={day.date}>{day.date}: {day.minutes} proposed minutes</li>)}</ul></>}
    {detail.warnings.map(warning => <p key={warning} role="status">{warning.replaceAll("_", " ")}</p>)}
    {command.message && <p role="status">{command.message}</p>}{error && <p role="alert">{error}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check allocation receipt</button>}
    {stale && <><p role="status">This action is bound to the revision originally opened. Review the current revision before continuing.</p>
      <button disabled={blocked} onClick={() => { if (!dirty.dirty || window.confirm("Discard the pending allocation action and use the current revision?")) {
        dirty.confirmation("action")(); dirty.confirmation("decision")(); setCaptured(detail); clearPreview();
      } }}>Use current allocation revision</button></>}
    <form onChange={() => { dirty.touch("action"); clearPreview(); }} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form), action = String(data.get("action"));
      setError(""); clearPreview();
      const body = { ...exact(captured), rationale: data.get("rationale") };
      if (action === "revise") {
        if (!candidate || !demand.demand || demand.state !== "qualified" || demand.reviewRequired) return;
        const days = demand.demand.days.filter(day => day.requiredMinutes > 0).map(day => ({ date: day.date, minutes: Number(data.get(`minutes:${day.date}`)) })).filter(day => day.minutes > 0);
        save(`/api/staffing/allocations/${detail.allocationId}/revisions`, { ...body, allocation: {
          resourceId: candidate.resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId, demandDigest: demand.contentDigest,
          expectedDemandVersion: demand.aggregateVersion, days } }, "POST", dirty.confirmation("action", form));
      } else if (action === "reserve" || action === "cancel-proposal") {
        save(`/api/staffing/allocations/${detail.allocationId}/${action}`, body, "POST", dirty.confirmation("action", form));
      } else {
        save(`/api/staffing/allocations/${detail.allocationId}/review-preview`, { ...body, action }, "POST");
      }
    }}><fieldset disabled={blocked || stale}><legend>Exact Allocation Action</legend>
      <label>Allocation action<select className="field" aria-label="Allocation action" name="action" required defaultValue="">
        <option value="" disabled>Choose action</option>
        {detail.canReserve && <option value="reserve">Reserve tentatively</option>}
        {detail.canCancelProposal && <option value="cancel-proposal">Cancel unconfirmed proposal</option>}
        {detail.canReview && actions.map(action => <option key={action} value={action}>Prepare {action} review</option>)}
        {detail.canRevise && candidate && demand.demand && !demand.reviewRequired && demand.state === "qualified" && <option value="revise">Revise working proposal for {candidate.displayName}</option>}
      </select></label>
      {detail.canRevise && candidate && demand.demand && <fieldset><legend>Revision Minutes For {candidate.displayName}</legend>
        <p>These inputs apply only to a working proposal revision. Saving a revision preserves the existing confirmed ledger until an amendment is approved.</p>
        {demand.demand.days.filter(day => day.requiredMinutes > 0).map(day => <label key={day.date}>Revision minutes on {day.date}
          <input className="field" type="number" name={`minutes:${day.date}`} min={0} max={day.requiredMinutes} step={1}
            defaultValue={captured.allocation?.days.find(old => old.date === day.date)?.minutes ?? 0} /></label>)}
      </fieldset>}
      <label>Allocation rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="secondary-button">Prepare or save exact action</button>
    </fieldset></form>
    {preview && <section aria-label="Daily allocation effects"><h4>Review {titleCaseLabel(preview.action)}</h4>
      <p>This review expires {new Date(preview.expiresAt).toLocaleString()}. Approval rechecks current authority and every staffing input.</p>
      <ul>{preview.effects.retainedPastRows.map(row => <li key={`past:${row.date}`}>{row.date}: retain {row.minutes} historical minutes</li>)}
        {preview.effects.removedFutureRows.map(row => <li key={`old:${row.date}`}>{row.date}: remove {row.minutes} minutes from resource {row.resourceId}</li>)}
        {preview.effects.insertedFutureRows.map(row => <li key={`new:${row.date}`}>{row.date}: add {row.minutes} minutes to resource {row.resourceId}</li>)}</ul>
      <ul>{preview.effects.resourceChanges.map(day => <li key={`${day.resourceId}:${day.date}`}>{day.date}: {day.confirmedMinutes} total confirmed resource minutes after approval</li>)}</ul>
      <form onChange={() => dirty.touch("decision")} onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget;
        save(`/api/staffing/allocations/${detail.allocationId}/decisions`, { revisionId: preview.revisionId,
          contentDigest: preview.contentDigest, expectedAggregateVersion: preview.aggregateVersion, action: preview.action,
          reviewPreviewId: preview.previewId, rationale: new FormData(form).get("rationale") }, "POST", dirty.confirmation("decision", form));
      }}><label>Decision rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
        <button className="primary-button" disabled={blocked || stale || !detail.canReview || Date.parse(preview.expiresAt) <= Date.now()}>Approve {preview.action}</button>
      </form>
    </section>}
  </section>;
}

export function StaffingAllocationReview({ demand, candidate, csrfToken, dirtyChanged }: { demand: Demand; candidate: Candidate | null; csrfToken: string;
  dirtyChanged: (dirty: boolean) => void }) {
  const [items, setItems] = useState<Page["items"]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(""), [reading, setReading] = useState(false);
  const scope = useRef(""), lists = useRef(0), selections = useRef(0), loading = useRef(0), currentDetail = useRef(detail);
  const desiredSelection = useRef<string | null>(null);
  const scopeKey = JSON.stringify([demand.customerId, demand.demandId]);
  scope.current = scopeKey; currentDetail.current = detail;
  const dirty = useStaffingDirtyInputs();
  const [reviewDirty, setReviewDirty] = useState(false);
  const [proposal, setProposal] = useState({ demand, candidate, generation: 0 });
  useEffect(() => { if (!dirty.dirty) setProposal(old => ({ demand, candidate, generation: old.generation + 1 })); },
    [demand.revisionId, demand.aggregateVersion, candidate?.resourceId]);
  const proposalStale = proposal.demand.revisionId !== demand.revisionId || proposal.demand.aggregateVersion !== demand.aggregateVersion || proposal.candidate?.resourceId !== candidate?.resourceId;
  async function load(next?: string) {
    const capturedScope = scopeKey, ticket = ++lists.current, loadingTicket = ++loading.current;
    const selectedId = desiredSelection.current, selectionTicket = next ? selections.current : ++selections.current;
    setReading(true);
    try {
      const page = await staffingGet<Page>(`/api/staffing/allocations?customerId=${demand.customerId}&demandId=${demand.demandId}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      const freshDetail = !next && selectedId ? await staffingGet<Detail>(`/api/staffing/allocations/${selectedId}`) : null;
      if (scope.current !== capturedScope || lists.current !== ticket) return;
      setItems(old => next ? [...new Map([...old, ...page.items].map(item => [item.allocationId, item])).values()] : page.items); setCursor(page.nextCursor);
      if (freshDetail && selections.current === selectionTicket) setDetail(freshDetail);
      setError("");
    } catch {
      if (scope.current !== capturedScope || lists.current !== ticket) return;
      ++selections.current; desiredSelection.current = null; setItems([]); setCursor(null); setDetail(null);
      setError("Allocations unavailable. Reload current authority and staffing sources.");
    } finally { if (scope.current === capturedScope && loading.current === loadingTicket) setReading(false); }
  }
  async function openAllocation(allocationId: string, quiet = false) {
    if (quiet && desiredSelection.current !== allocationId) return;
    const capturedScope = scopeKey, ticket = ++selections.current, loadingTicket = quiet ? null : ++loading.current;
    if (!quiet) { desiredSelection.current = allocationId; setReading(true); if (currentDetail.current?.allocationId !== allocationId) setDetail(null); }
    try {
      const fresh = await staffingGet<Detail>(`/api/staffing/allocations/${allocationId}`);
      if (scope.current !== capturedScope || selections.current !== ticket) return;
      setDetail(fresh); setError("");
    } catch {
      if (scope.current !== capturedScope || selections.current !== ticket) return;
      ++selections.current; desiredSelection.current = null; setDetail(null); setError("Allocation unavailable. Reload current authority and staffing sources.");
    } finally { if (loadingTicket !== null && scope.current === capturedScope && loading.current === loadingTicket) setReading(false); }
  }
  const command = useStaffingCommand(csrfToken, async result => {
    const capturedScope = scopeKey;
    await load(); if (scope.current === capturedScope && result.allocationId) await openAllocation(result.allocationId);
  });
  useEffect(() => { dirtyChanged(dirty.dirty || reviewDirty || command.busy || !!command.uncertainKey); return () => dirtyChanged(false); },
    [dirty.dirty, reviewDirty, command.busy, command.uncertainKey, dirtyChanged]);
  useEffect(() => {
    desiredSelection.current = null; currentDetail.current = null;
    setItems([]); setCursor(null); setDetail(null);
    return () => { ++lists.current; ++selections.current; ++loading.current; };
  }, [scopeKey]);
  useEffect(() => { void load(); }, [scopeKey, demand.revisionId, demand.aggregateVersion, demand.reviewRequired]);
  useEffect(() => {
    if (!detail) return;
    const timer = setInterval(() => { void openAllocation(detail.allocationId, true); }, 10_000);
    return () => { clearInterval(timer); };
  }, [detail?.allocationId, scopeKey]);
  const blocked = command.busy || !!command.uncertainKey || reading;
  return <section className="profile-section"><h2>Staffing Allocations</h2>
    {error && <p role="alert">{error}</p>}{command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check proposal receipt</button>}
    <button disabled={blocked} onClick={() => void load()}>Reload allocations</button>
    <ul>{items.map((item, index) => <li key={item.allocationId}><button disabled={blocked} onClick={() => {
      if ((dirty.dirty || reviewDirty) && !window.confirm("Discard unsaved allocation inputs and open this allocation?")) return;
      void openAllocation(item.allocationId);
    }}>Open allocation {index + 1} · {item.state}</button></li>)}</ul>
    {cursor && <button disabled={blocked} onClick={() => void load(cursor)}>More allocations</button>}
    {!items.length && !reading && !error && <p>No allocations have been proposed for this demand.</p>}
    {proposalStale && <><p role="status">Proposal inputs retain the resource and demand revision originally opened.</p><button disabled={blocked} onClick={() => {
      if (!dirty.dirty || window.confirm("Discard unsaved proposal inputs and use the current resource and demand revision?")) {
        dirty.confirmation("proposal")(); setProposal(old => ({ demand, candidate, generation: old.generation + 1 }));
      }
    }}>Use current proposal inputs</button></>}
    {demand.demand && proposal.candidate && proposal.demand.demand && <form key={proposal.generation} onChange={() => dirty.touch("proposal")} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
      void command.save("/api/staffing/allocations", { rationale: data.get("rationale"), allocation: {
        resourceId: proposal.candidate!.resourceId, demandId: proposal.demand.demandId, demandRevisionId: proposal.demand.revisionId, demandDigest: proposal.demand.contentDigest,
        expectedDemandVersion: proposal.demand.aggregateVersion, days: proposal.demand.demand!.days.filter(day => day.requiredMinutes > 0)
          .map(day => ({ date: day.date, minutes: Number(data.get(`minutes:${day.date}`)) })).filter(day => day.minutes > 0) } }, "POST", dirty.confirmation("proposal", form)).then(saved => { if (!saved) void load(); });
    }}><fieldset disabled={blocked || proposalStale || demand.reviewRequired || demand.state !== "qualified" || !demand.demand}><legend>Propose {proposal.candidate.displayName}</legend>
      <p>Enter positive minutes for at least one resource-local service date. Zero leaves a date out. A proposal does not reserve or confirm staffing.</p>
      {proposal.demand.demand.days.filter(day => day.requiredMinutes > 0).map(day => <label key={day.date}>Proposal minutes on {day.date}
        <input className="field" type="number" name={`minutes:${day.date}`} min={0} max={day.requiredMinutes} step={1} required defaultValue={0} /></label>)}
      <label>Proposal rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="primary-button">Save proposal</button>
    </fieldset></form>}
    {detail && <Review key={detail.allocationId} detail={detail} demand={demand} candidate={candidate} csrfToken={csrfToken} refresh={() => load()} dirtyChanged={setReviewDirty} />}
  </section>;
}
