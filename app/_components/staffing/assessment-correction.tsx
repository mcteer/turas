"use client";
import { useState } from "react";
import { useStaffingDirtyInputs, type useStaffingCommand } from "./client";
type Candidate = { competencyId: string; revisionId: string; contentDigest: string; aggregateVersion: number;
  skillId: string; state: string; withheld: boolean; level?: number; assessmentDate?: string;
  nextReviewDate?: string | null; evidence?: string };
export function AssessmentCorrection({ resourceId, candidate, command }: {
  resourceId: string; candidate: Candidate; command: ReturnType<typeof useStaffingCommand>;
}) {
  const [base, setBase] = useState<Candidate | null>(null), edits = useStaffingDirtyInputs();
  if (candidate.withheld) return null;
  return base ? <form className="evidence-search-form" onChange={() => edits.touch("correction")} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), confirmed = edits.confirmation("correction");
    void command.save(`/api/staffing/competencies/${base.competencyId}/revisions`, { revisionId: base.revisionId,
      contentDigest: base.contentDigest, expectedAggregateVersion: base.aggregateVersion, resourceId, skillId: base.skillId,
      level: Number(data.get("level")), assessmentDate: data.get("assessmentDate"), nextReviewDate: data.get("nextReviewDate"),
      evidence: data.get("evidence"), rationale: data.get("rationale") }, "POST", () => { if (confirmed()) setBase(null); });
  }}><fieldset disabled={command.busy || !!command.uncertainKey}><legend>Correct dated assessment</legend><p>A correction creates a pending revision. The current approved assessment remains until a human accepts its replacement.</p>
    {base.aggregateVersion !== candidate.aggregateVersion && <p role="status">This competency changed. Close and reopen to review the current revision.</p>}
    <label>Corrected level<select className="field" name="level" aria-label="Corrected level" defaultValue={base.level}>{[0, 1, 2, 3, 4].map(level => <option key={level} value={level}>{level}</option>)}</select></label>
    <label>Corrected assessment date<input className="field" name="assessmentDate" type="date" min="2000-01-01" max="2100-12-31" required defaultValue={base.assessmentDate} /></label>
    <label>Corrected next review date<input className="field" name="nextReviewDate" type="date" min="2000-01-01" max="2100-12-31" required defaultValue={base.nextReviewDate ?? ""} /></label>
    <label>Corrected evidence<textarea className="field" name="evidence" aria-label="Corrected evidence" required maxLength={4000} defaultValue={base.evidence} /></label>
    <label>Correction rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
    <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save pending correction</button>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved assessment correction?")) { edits.confirmation("correction")(); setBase(null); }
    }}>Close correction editor</button></fieldset>
  </form> : <button className="secondary-button" disabled={command.busy || !!command.uncertainKey || !["pending", "accepted"].includes(candidate.state)}
    onClick={() => setBase({ ...candidate })}>Correct this assessment</button>;
}
