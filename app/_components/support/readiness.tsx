"use client";

import { useState, type FormEvent } from "react";
import { supportReadinessKeys } from "../../../lib/support/readiness";
import { supportAssessmentSchema, type SupportAssessment } from "../../../lib/contracts/support";
import { supportDates, supportLabel, type SupportFormProps, type SupportRevision } from "./types";

export function ReadinessSummary({ revision, effective }: { revision: SupportRevision | null; effective: string }) {
  const content = revision?.content && "checks" in revision.content ? revision.content : null;
  return <section className="profile-section" aria-labelledby="support-readiness-heading">
    <h2 id="support-readiness-heading">Support Readiness</h2><p className="profile-badge">{supportLabel(effective)}</p>
    <p className="muted">Rule: support-readiness-v1. Readiness is separate from maturity and engagement progress.</p>
    {!revision && <p>No accepted assessment. Missing operating evidence remains unknown.</p>}
    {revision?.contentUnavailable && <p role="status">Evidence changed or content was withdrawn. Review required; guidance is withheld.</p>}
    {content && <><p>Observed {content.observationDate} · Next Review {content.nextReviewDate} · {content.timezone}</p>
      <div className="profile-grid">{content.checks.map(check => <article className="profile-card" key={check.key}>
        <h3>{supportLabel(check.key)}</h3><p>{supportLabel(check.status)}</p><p>{check.rationale}</p>
        {check.discoveryNeed && <p>Next Verification: {check.discoveryNeed}</p>}
        <p className="muted">{check.sourceKeys.length ? "Supporting evidence selected" : "No supporting evidence"}</p>
      </article>)}</div></>}
  </section>;
}

export function ReadinessForm({ initial, sources, busy, onSave }: SupportFormProps & { initial?: SupportAssessment | null }) {
  const [content, setContent] = useState<SupportAssessment>(() => initial ?? { contractVersion: "support-v1",
    rubricVersion: "support-readiness-v1", title: "Support readiness assessment", ...supportDates(),
    checks: supportReadinessKeys.map(key => ({ key, status: "unknown", rationale: "No accepted operating evidence yet",
      sourceKeys: [], discoveryNeed: "Confirm current operating evidence" })) });
  const [error, setError] = useState("");
  function check(index: number, changes: Partial<SupportAssessment["checks"][number]>) {
    setContent(value => ({ ...value, checks: value.checks.map((item, position) => position === index ? { ...item, ...changes } : item) }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const parsed = supportAssessmentSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the assessment fields"); return; }
    try { await onSave(parsed.data); } catch (error) { setError(error instanceof Error ? error.message : "Could not save assessment"); }
  }
  return <form className="profile-section" onSubmit={submit} aria-labelledby="assessment-editor-heading">
    <h2 id="assessment-editor-heading">Propose Readiness Assessment</h2>
    <label className="field-label">Assessment Title<input className="field" required maxLength={200} value={content.title}
      onChange={event => setContent({ ...content, title: event.target.value })} /></label>
    <div className="profile-grid"><label className="field-label">Observation Date<input className="field" type="date" required
      value={content.observationDate} onChange={event => setContent({ ...content, observationDate: event.target.value })} /></label>
      <label className="field-label">Next Review Date<input className="field" type="date" required value={content.nextReviewDate}
        onChange={event => setContent({ ...content, nextReviewDate: event.target.value })} /></label>
      <label className="field-label">Timezone<input className="field" required value={content.timezone}
        onChange={event => setContent({ ...content, timezone: event.target.value })} /></label></div>
    {content.checks.map((item, index) => <fieldset className="profile-card" key={item.key}>
      <legend>{supportLabel(item.key)}</legend><label className="field-label">{supportLabel(item.key)} Status
        <select className="field" value={item.status} onChange={event => check(index, { status: event.target.value as typeof item.status })}>
          {["unknown", "gap", "ready", "not_applicable"].map(status => <option key={status} value={status}>{supportLabel(status)}</option>)}
        </select></label>
      <label className="field-label">{supportLabel(item.key)} Rationale<textarea className="field" required maxLength={2000}
        value={item.rationale} onChange={event => check(index, { rationale: event.target.value })} /></label>
      {item.status === "unknown" && <label className="field-label">{supportLabel(item.key)} Discovery Need<textarea className="field"
        required maxLength={500} value={item.discoveryNeed ?? ""} onChange={event => check(index, { discoveryNeed: event.target.value })} /></label>}
      <fieldset><legend>{supportLabel(item.key)} Supporting Evidence</legend>
        {!sources.length && <p>Select eligible evidence below before asserting Ready or Gap.</p>}
        {sources.map((source, sourceIndex) => <label className="field-label" key={source.id}><input type="checkbox"
          checked={item.sourceKeys.includes(source.id)} onChange={event => check(index, { sourceKeys: event.target.checked
            ? [...item.sourceKeys, source.id] : item.sourceKeys.filter(id => id !== source.id) })} />
          Evidence {sourceIndex + 1}: {supportLabel(source.kind)}</label>)}</fieldset>
    </fieldset>)}
    {error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>Save Proposed Assessment</button>
  </form>;
}
