"use client";

import { useState, type FormEvent } from "react";
import { supportActionSchema, type SupportAction } from "../../../lib/contracts/support";
import { EscalationFields, EscalationSummary } from "./escalation";
import { supportDates, supportLabel, type SupportFormProps, type SupportRevision, type SupportWorkspaceData } from "./types";

type OwnerOption = { membershipId: string; displayName: string };
type ActionRow = SupportWorkspaceData["actions"][number];
export function ActionList({ actions, owners, canWrite, canReview, onEdit, onReview, onHistory }: {
  actions: ActionRow[]; owners: OwnerOption[]; canWrite: boolean; canReview: boolean;
  onEdit: (row: ActionRow) => void; onReview: (id: string, revision: SupportRevision) => void; onHistory: (id: string) => void }) {
  return <section className="profile-section"><h2>Recommended Actions</h2>
    {!actions.length && <p>No permitted actions for this scope. Missing guidance does not imply ready.</p>}
    {actions.map(row => {
      const accepted = row.accepted?.content && "owner" in row.accepted.content ? row.accepted.content : null;
      const proposed = row.proposal?.content && "owner" in row.proposal.content ? row.proposal.content : null;
      const content = accepted ?? proposed;
      const owner = content?.owner;
      const ownerLabel = owner?.kind === "unassigned" ? `Unknown: ${owner.reason}` : owner?.kind === "customer_role" ? owner.label
        : owner?.kind === "membership" ? owners.find(item => item.membershipId === owner.membershipId)?.displayName ?? "Assigned workspace member" : "Unavailable";
      return <article className="profile-card" key={row.recordId}><h3>{content?.title ?? "Action Content Unavailable"}</h3>
        <p>Accepted Disposition: {row.accepted?.disposition ? supportLabel(row.accepted.disposition) : "Not Accepted"}</p>
        {row.proposal && <p>Pending Proposal: {row.proposal.disposition ? supportLabel(row.proposal.disposition) : "Review Required"}. Accepted state is unchanged.</p>}
        {content && <><p>Priority: {supportLabel(content.priority)} · Owner: {ownerLabel}</p><p>Next Review: {content.nextReviewDate} · {content.timezone}</p>
          <details><summary>Action Details</summary><p>Desired Outcome: {content.desiredOutcome}</p><p>Rationale: {content.rationale}</p>
            <p>Validation: {content.validationCriterion}</p>{content.dispositionRationale && <p>Disposition Rationale: {content.dispositionRationale}</p>}
            {content.revisitDate && <p>Revisit: {content.revisitDate}</p>}{content.completedDate && <p>Completion Observation: {content.completedDate}</p>}
            <EscalationSummary content={content} /><p>Completing this Turas action never resolves an external ticket or changes maturity or engagement acceptance.</p></details></>}
        {(row.accepted?.reviewRequired || row.proposal?.reviewRequired) && <p>Review Required</p>}
        {row.accepted?.overdue && <p>Overdue Review — Not an Incident Severity or SLA Breach</p>}
        {row.accepted?.ownerUnavailable && <p>Owner Unavailable — Human Review Required</p>}
        <div className="profile-toolbar">{canWrite && content && <button className="secondary-button" onClick={() => onEdit(row)}>Propose Action Revision</button>}
          {canReview && row.proposal && <button className="secondary-button" onClick={() => onReview(row.recordId, row.proposal!)}>Preview Action Review</button>}
          {canReview && row.accepted && <button className="secondary-button" onClick={() => onReview(row.recordId, row.accepted!)}>Preview Accepted Action</button>}
          <button className="secondary-button" onClick={() => onHistory(row.recordId)}>View Permitted History</button></div>
      </article>;
    })}
  </section>;
}

export function ActionForm({ initial, owners, sources, busy, onSave }: SupportFormProps & { initial?: SupportAction | null; owners: OwnerOption[] }) {
  const [content, setContent] = useState<SupportAction>(() => initial ?? { contractVersion: "support-v1", title: "", ...supportDates(),
    desiredOutcome: "", rationale: "", validationCriterion: "", priority: "normal", owner: { kind: "unassigned", reason: "Confirm the accountable owner" },
    disposition: "open", outcomeSourceKeys: [] });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const parsed = supportActionSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the action fields"); return; }
    try { await onSave(parsed.data); } catch (error) { setError(error instanceof Error ? error.message : "Could not save action"); }
  }
  return <form className="profile-section" onSubmit={submit}><h2>{initial ? "Propose Action Revision" : "Propose Recommended Action"}</h2>
    {(["title", "desiredOutcome", "rationale", "validationCriterion"] as const).map(key => <label className="field-label" key={key}>
      {{ title: "Action Title", desiredOutcome: "Desired Outcome", rationale: "Action Rationale", validationCriterion: "Validation Criterion" }[key]}
      <textarea className="field" required maxLength={key === "title" ? 200 : 2000} value={content[key]}
        onChange={event => setContent({ ...content, [key]: event.target.value })} /></label>)}
    <div className="profile-grid"><label className="field-label">Action Observation Date<input className="field" type="date" required
      value={content.observationDate} onChange={event => setContent({ ...content, observationDate: event.target.value })} /></label>
      <label className="field-label">Action Next Review Date<input className="field" type="date" required value={content.nextReviewDate}
        onChange={event => setContent({ ...content, nextReviewDate: event.target.value })} /></label>
      <label className="field-label">Action Timezone<input className="field" required value={content.timezone}
        onChange={event => setContent({ ...content, timezone: event.target.value })} /></label>
      <label className="field-label">Action Priority<select className="field" value={content.priority}
        onChange={event => setContent({ ...content, priority: event.target.value as typeof content.priority })}>
        {["high", "normal", "low"].map(value => <option key={value} value={value}>{supportLabel(value)}</option>)}</select></label></div>
    <fieldset className="profile-card"><legend>Accountable Owner</legend><p>Ownership does not grant authority or allocate resources.</p>
      <label className="field-label">Owner Type<select className="field" value={content.owner.kind} onChange={event => setContent({ ...content,
        owner: event.target.value === "membership" ? { kind: "membership", membershipId: owners[0]?.membershipId ?? "" }
          : event.target.value === "customer_role" ? { kind: "customer_role", label: "", sourceKey: sources[0]?.id ?? "" }
          : { kind: "unassigned", reason: "Confirm the accountable owner" } })}>
        <option value="unassigned">Unknown Owner</option><option value="membership">Eligible Workspace Member</option><option value="customer_role">Evidenced Customer Role</option></select></label>
      {content.owner.kind === "unassigned" && <label className="field-label">Unknown Owner Reason<textarea className="field" required maxLength={500}
        value={content.owner.reason} onChange={event => setContent({ ...content, owner: { kind: "unassigned", reason: event.target.value } })} /></label>}
      {content.owner.kind === "membership" && <label className="field-label">Eligible Owner<select className="field" required value={content.owner.membershipId}
        onChange={event => setContent({ ...content, owner: { kind: "membership", membershipId: event.target.value } })}>
        <option value="">Choose Owner</option>{owners.map(owner => <option key={owner.membershipId} value={owner.membershipId}>{owner.displayName}</option>)}</select></label>}
      {content.owner.kind === "customer_role" && <><label className="field-label">Customer Role Label<input className="field" required maxLength={200}
        value={content.owner.label} onChange={event => setContent(current => current.owner.kind === "customer_role"
          ? { ...current, owner: { ...current.owner, label: event.target.value } } : current)} /></label>
        <label className="field-label">Accepted Stakeholder Evidence<select className="field" required value={content.owner.sourceKey}
          onChange={event => setContent(current => current.owner.kind === "customer_role" ? { ...current, owner: { ...current.owner, sourceKey: event.target.value } } : current)}>
          <option value="">Choose Evidence</option>{sources.filter(source => source.kind === "accepted_profile").map((source, index) => <option key={source.id} value={source.id}>Evidence {index + 1}</option>)}</select></label></>}
    </fieldset>
    <label className="field-label">Proposed Disposition<select className="field" value={content.disposition} disabled={!initial}
      onChange={event => setContent({ ...content, disposition: event.target.value as typeof content.disposition })}>
      {["open", "in_progress", "blocked", "deferred", "completed", "dismissed"].map(value => <option key={value} value={value}>{supportLabel(value)}</option>)}</select></label>
    {initial && <label className="field-label">Disposition or Reopening Rationale<textarea className="field" maxLength={2000}
      value={content.dispositionRationale ?? ""} onChange={event => setContent({ ...content, dispositionRationale: event.target.value || undefined })} /></label>}
    {content.disposition === "deferred" && <label className="field-label">Revisit Date<input className="field" type="date" required value={content.revisitDate ?? ""}
      onChange={event => setContent({ ...content, revisitDate: event.target.value })} /></label>}
    {content.disposition === "completed" && <><label className="field-label">Completion Date<input className="field" type="date" required value={content.completedDate ?? ""}
      onChange={event => setContent({ ...content, completedDate: event.target.value })} /></label><fieldset><legend>Dated Outcome Evidence</legend>
      {!sources.length && <p>Eligible dated outcome evidence is required; a ticket link alone is insufficient.</p>}
      {sources.map((source, index) => <label className="field-label" key={source.id}><input type="checkbox" checked={content.outcomeSourceKeys.includes(source.id)}
        onChange={event => setContent({ ...content, outcomeSourceKeys: event.target.checked ? [...content.outcomeSourceKeys, source.id]
          : content.outcomeSourceKeys.filter(id => id !== source.id) })} />Evidence {index + 1}</label>)}</fieldset></>}
    <EscalationFields content={content} sources={sources} onChange={setContent} />
    {error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>Save Proposed Action</button>
  </form>;
}
