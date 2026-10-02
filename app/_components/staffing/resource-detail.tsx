"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StaffingOperationalResource } from "../../../lib/contracts/staffing";
import { staffingGet, useStaffingDirtyInputs, useStaffingCommand } from "./client";

import { AssessmentCorrection } from "./assessment-correction";
import { ResourceRevisionEditor, PartnerEligibilityEditor } from "./registry-editors";
import { StaffingCalendar } from "./calendar-editor";

type Candidate = { competencyId: string; skillId: string; revisionId: string; contentDigest: string;
  aggregateVersion: number; sourceGeneration: number; state: string; withheld: boolean;
  level?: number; assessmentDate?: string; nextReviewDate?: string | null; evidence?: string; filename?: string | null;
  manualEvidenceId?: string | null; locators?: { sheetIndex?: number; rowNumber?: number; columnNumber?: number; cellId?: string }[] };
type ReviewPage = { items: Candidate[]; nextCursor: string | null };
type Detail = StaffingOperationalResource & { manager?: { externalKey: string; membershipId: string | null;
  partnerOrganizationId: string | null; revisionId: string; contentDigest: string; rationale: string; review: ReviewPage } };
export function StaffingResourceDetail({ resourceId, csrfToken }: { resourceId: string; csrfToken: string }) {
  const [resource, setResource] = useState<Detail | null>(null), [error, setError] = useState("");
  const [review, setReview] = useState<ReviewPage>({ items: [], nextCursor: null });
  const [skills, setSkills] = useState<StaffingOperationalResource["skills"]>([]), [skillCursor, setSkillCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewPage | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [rationale, setRationale] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const scope = useRef(resourceId), reads = useRef(0), histories = useRef(0);
  scope.current = resourceId;
  const edits = useStaffingDirtyInputs();
  async function load() {
    const captured = resourceId, ticket = ++reads.current;
    ++histories.current;
    try { const detail = await staffingGet<Detail>(`/api/staffing/resources/${resourceId}`);
      if (scope.current !== captured || reads.current !== ticket) return;
      setResource(detail); setSkills(detail.skills); setSkillCursor(detail.skillsNextCursor);
      setReview(detail.manager?.review ?? { items: [], nextCursor: null }); setHistory(null); setError(""); }
    catch (cause) {
      if (scope.current !== captured || reads.current !== ticket) return;
      setResource(null); setHistory(null); setReview({ items: [], nextCursor: null }); setSkills([]); setError(cause instanceof Error ? cause.message : "Resource unavailable"); }
  }
  useEffect(() => {
    setResource(null); setHistory(null); setHistoryId(null); setReview({ items: [], nextCursor: null });
    setSkills([]); setSkillCursor(null); setSelected([]); setRationale(""); setError(""); void load();
    return () => { ++reads.current; ++histories.current; };
  }, [resourceId]);
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  async function more(kind: "skills" | "review") {
    const cursor = kind === "skills" ? skillCursor : review.nextCursor;
    if (!cursor) return;
    const captured = resourceId, ticket = reads.current;
    try {
      if (kind === "review") {
        const page = await staffingGet<ReviewPage>(`/api/staffing/competencies?resourceId=${resourceId}&cursor=${encodeURIComponent(cursor)}`);
        if (scope.current !== captured || reads.current !== ticket) return;
        setReview(old => ({ items: [...new Map([...old.items, ...page.items].map(item => [item.revisionId, item])).values()], nextCursor: page.nextCursor }));
      } else {
        const page = await staffingGet<{ items: StaffingOperationalResource["skills"]; nextCursor: string | null }>(`/api/staffing/resources/${resourceId}/skills?cursor=${encodeURIComponent(cursor)}`);
        if (scope.current !== captured || reads.current !== ticket) return;
        setSkills(old => [...new Map([...old, ...page.items].map(item => [item.skillId, item])).values()]); setSkillCursor(page.nextCursor);
      }
    } catch {
      if (scope.current !== captured || reads.current !== ticket) return;
      ++reads.current; ++histories.current;
      setResource(null); setHistory(null); setReview({ items: [], nextCursor: null }); setSkills([]); setSkillCursor(null);
      setError("Resource changed or unavailable. Reload before reviewing."); }
  }
  function decide(action: "accept" | "reject" | "retract") {
    const candidates = review.items.filter(row => selected.includes(row.revisionId));
    if (!candidates.length || candidates.length > 100) return;
    const acknowledge = edits.confirmation("review");
    void command.save("/api/staffing/competency-decisions", { rows: candidates.map(row => ({ competencyId: row.competencyId,
      candidateRevisionId: row.revisionId, candidateDigest: row.contentDigest, sourceGeneration: row.sourceGeneration,
      expectedAggregateVersion: row.aggregateVersion, action, rationale })) }, "POST", () => { if (acknowledge()) { setRationale(""); setSelected([]); } });
  }
  return <>
    <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href="/staffing/resources">Resources</Link><span aria-hidden="true">/</span><span>Resource detail</span></nav>
    {error && <p role="alert">{error} <button onClick={() => void load()}>Reload</button></p>}
    {!resource && !error && <p role="status">Loading resource…</p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    {resource && <>
      <header className="profile-header"><div><p className="profile-eyebrow">Resource</p><h1>{resource.displayName}</h1>
        <p>{resource.kind} · {resource.state} · {resource.timezone}{resource.regionCode ? ` · ${resource.regionCode}` : ""}</p></div></header>
      <section className="profile-section"><h2>Current approved competencies</h2>
        {!skills.length && <p>No current approved competencies. Pending or withdrawn evidence is excluded.</p>}
        <ul>{skills.map(skill => <li key={skill.skillId}>Skill {skill.skillId} · level {skill.level} · {skill.freshness}</li>)}</ul>
        {skillCursor && <button className="secondary-button" onClick={() => void more("skills")}>More approved skills</button>}
      </section>
      <StaffingCalendar key={resourceId} resourceId={resourceId} csrfToken={csrfToken} />
      {resource.manager && <>
        <section className="profile-section"><ResourceRevisionEditor resource={resource} command={command} /><PartnerEligibilityEditor resource={resource} command={command} /></section>
        <section className="profile-section"><h2>Manager evidence and review</h2>
          <p>Accept the exact dated assessment shown here. Approval does not refresh its assessment date.</p>
          {!review.items.length && <p>No current candidate or accepted evidence.</p>}
          <div className="profile-grid">{review.items.map(row => <article className="profile-card" key={row.revisionId}>
            <h3>Skill {row.skillId}</h3><p>{row.state} · revision {row.revisionId}</p>
            <button className="secondary-button" onClick={() => {
              const captured = resourceId, ticket = ++histories.current;
              setHistoryId(row.competencyId); setHistory(null);
              void staffingGet<ReviewPage>(`/api/staffing/competencies/${row.competencyId}/revisions`).then(value => {
                if (scope.current === captured && histories.current === ticket) setHistory(value);
              }).catch(() => {
                if (scope.current === captured && histories.current === ticket) {
                  setHistory(null); setError("Revision history unavailable. Reload before reviewing.");
                }
              });
            }}>View revision history</button>
            {row.withheld ? <p>Evidence unavailable because its source or resource eligibility changed.</p> : <>
              <p>Level {row.level} · assessed {row.assessmentDate} · next review {row.nextReviewDate ?? "not specified"}</p>
              <p>{row.evidence}</p>{row.filename && <p>Original: {row.filename}</p>}
              {row.locators?.length ? <ul>{row.locators.map((locator, i) => <li key={locator.cellId ?? i}>Sheet {locator.sheetIndex} · row {locator.rowNumber} · column {locator.columnNumber}</li>)}</ul> : null}
            </>}
            <AssessmentCorrection resourceId={resourceId} candidate={row} command={command} />
            {row.manualEvidenceId && <button className="secondary-button"
              disabled={command.busy || !!command.uncertainKey || row.withheld || !rationale.trim()}
              onClick={() => {
                const acknowledge = edits.confirmation("review");
                void command.save(`/api/staffing/manual-evidence/${row.manualEvidenceId}`,
                  { sourceGeneration: row.sourceGeneration, rationale }, "DELETE", () => { if (acknowledge()) { setRationale(""); setSelected([]); } });
              }}>Withdraw this manual evidence source</button>}
            <label><input type="checkbox" checked={selected.includes(row.revisionId)} onChange={event => {
              edits.touch("review"); setSelected(old => event.target.checked ? [...old, row.revisionId] : old.filter(id => id !== row.revisionId));
            }} /> Select this exact revision</label>
          </article>)}</div>
          {review.nextCursor && <button className="secondary-button" onClick={() => void more("review")}>More evidence</button>}
          <label>Decision rationale<textarea className="field" value={rationale} maxLength={2000} onChange={event => { edits.touch("review"); setRationale(event.target.value); }} /></label>
          <div className="evidence-search-controls">{(["accept", "reject", "retract"] as const).map(action => <button key={action} className="secondary-button"
            disabled={command.busy || !!command.uncertainKey || !rationale.trim() || !selected.length || selected.length > 100 ||
              review.items.filter(row => selected.includes(row.revisionId)).some(row => action === "retract" ? row.state !== "accepted" : row.state !== "pending" || action === "accept" && row.withheld)}
            onClick={() => decide(action)}>{action === "accept" ? "Accept selected" : action === "reject" ? "Reject selected" : "Retract selected"}</button>)}</div>
        </section>
        {history && <section className="profile-section"><h2>Revision history</h2>
          <button className="secondary-button" onClick={() => { ++histories.current; setHistory(null); setHistoryId(null); }}>Close history</button>
          <ul>{history.items.map(row => <li key={row.revisionId}>{row.state} · revision {row.revisionId} ·
            {row.withheld ? " Evidence withheld" : ` Level ${row.level}, assessed ${row.assessmentDate}: ${row.evidence ?? ""}`}</li>)}</ul>
          {history.nextCursor && historyId && <button className="secondary-button" onClick={() => {
            const captured = resourceId, ticket = ++histories.current;
            void staffingGet<ReviewPage>(`/api/staffing/competencies/${historyId}/revisions?cursor=${encodeURIComponent(history.nextCursor!)}`)
              .then(page => {
                if (scope.current === captured && histories.current === ticket) setHistory(old => old ? {
                  items: [...new Map([...old.items, ...page.items].map(item => [item.revisionId, item])).values()], nextCursor: page.nextCursor } : null);
              }).catch(() => {
                if (scope.current === captured && histories.current === ticket) { setHistory(null); setError("History changed or unavailable. Reload before reviewing."); }
              });
          }}>More historical revisions</button>}
        </section>}
        <section className="profile-section"><form className="evidence-search-form" onChange={() => edits.touch("manual")} onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
          void command.save("/api/staffing/competencies", { resourceId, skillId: data.get("skillId"), level: Number(data.get("level")),
            assessmentDate: data.get("assessmentDate"), nextReviewDate: data.get("nextReviewDate"),
            evidence: data.get("evidence"), rationale: data.get("rationale") }, "POST", edits.confirmation("manual", form));
        }}><h2>Propose a dated assessment</h2>
          <label>Canonical skill ID<input className="field" name="skillId" required /></label>
          <label>Level<select className="field" name="level" aria-label="Level">{[0, 1, 2, 3, 4].map(level => <option key={level} value={level}>{level}</option>)}</select></label>
          <label>Assessment date<input className="field" type="date" name="assessmentDate" required min="2000-01-01" max="2100-12-31" /></label>
          <label>Next review date<input className="field" type="date" name="nextReviewDate" required min="2000-01-01" max="2100-12-31" /></label>
          <label>Evidence<textarea className="field" name="evidence" required maxLength={4000} /></label>
          <label>Rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
          <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save pending assessment</button>
        </form></section>
      </>}
    </>}
  </>;
}
