"use client";

import type { SupportAction } from "../../../lib/contracts/support";
import type { SupportSource } from "../../../lib/server/support/schema";

export function EscalationFields({ content, sources, onChange }: { content: SupportAction; sources: SupportSource[];
  onChange: (content: SupportAction) => void }) {
  const escalation = content.escalation, handoff = content.handoff;
  return <><fieldset className="profile-card"><legend>Escalation Guidance</legend>
    <label className="field-label"><input type="checkbox" checked={!!escalation} onChange={event => onChange({ ...content,
      escalation: event.target.checked ? { trigger: "", observedImpact: "", accountableRole: "", routeKnown: false,
        unknownRouteReason: "Confirm the established incident route", evidenceChecklist: "", nextCheckpointDate: content.nextReviewDate } : undefined })} />Include Escalation Guidance</label>
    {escalation && <><p>No message, ticket or escalation is sent. Entitlement, severity and response guarantees remain unknown without evidence.</p>
      {(["trigger", "observedImpact", "accountableRole", "evidenceChecklist"] as const).map(key => <label className="field-label" key={key}>
        {{ trigger: "Escalation Trigger", observedImpact: "Observed Impact", accountableRole: "Accountable Role", evidenceChecklist: "Evidence to Provide" }[key]}
        <textarea className="field" required maxLength={key === "accountableRole" ? 200 : 2000} value={escalation[key]}
          onChange={event => onChange({ ...content, escalation: { ...escalation, [key]: event.target.value } })} /></label>)}
      <label className="field-label">Escalation Route<select className="field" value={escalation.routeKnown ? "known" : "unknown"}
        onChange={event => onChange({ ...content, escalation: event.target.value === "known"
          ? { ...escalation, routeKnown: true, route: "", unknownRouteReason: undefined }
          : { ...escalation, routeKnown: false, route: undefined, unknownRouteReason: "Confirm the established incident route" } })}>
        <option value="unknown">Unknown — Confirm Human Route</option><option value="known">Known — Eligible Evidence Required</option></select></label>
      <label className="field-label">{escalation.routeKnown ? "Known Route" : "Unknown Route Reason"}<textarea className="field" required
        maxLength={escalation.routeKnown ? 2000 : 500} value={escalation.routeKnown ? escalation.route ?? "" : escalation.unknownRouteReason ?? ""}
        onChange={event => onChange({ ...content, escalation: { ...escalation,
          ...(escalation.routeKnown ? { route: event.target.value } : { unknownRouteReason: event.target.value }) } })} /></label>
      <label className="field-label">Next Checkpoint Date<input className="field" type="date" required value={escalation.nextCheckpointDate}
        onChange={event => onChange({ ...content, escalation: { ...escalation, nextCheckpointDate: event.target.value } })} /></label></>}
  </fieldset><fieldset className="profile-card"><legend>Human-Reported Handoff</legend>
    <label className="field-label"><input type="checkbox" checked={!!handoff} onChange={event => onChange({ ...content,
      handoff: event.target.checked ? { kind: "human_reported", occurredAt: new Date().toISOString(), externalReference: "", supportingSourceKeys: [] } : undefined })} />Record Human-Reported Handoff</label>
    {handoff && <><p>External acknowledgement and resolution remain unknown. An external link is not outcome evidence and is never fetched.</p>
      <label className="field-label">Handoff Time (UTC)<input className="field" type="datetime-local" required
        value={handoff.occurredAt.slice(0, 16)} onChange={event => onChange({ ...content, handoff: { ...handoff, occurredAt: `${event.target.value}:00Z` } })} /></label>
      <label className="field-label">External Reference<input className="field" type="url" required maxLength={2048} value={handoff.externalReference}
        onChange={event => onChange({ ...content, handoff: { ...handoff, externalReference: event.target.value } })} /></label>
      <fieldset><legend>Handoff Supporting Evidence</legend>{sources.map((source, index) => <label className="field-label" key={source.id}>
        <input type="checkbox" checked={handoff.supportingSourceKeys.includes(source.id)} onChange={event => onChange({ ...content,
          handoff: { ...handoff, supportingSourceKeys: event.target.checked ? [...handoff.supportingSourceKeys, source.id]
            : handoff.supportingSourceKeys.filter(id => id !== source.id) } })} />Evidence {index + 1}</label>)}</fieldset></>}
  </fieldset></>;
}

export function EscalationSummary({ content }: { content: SupportAction }) {
  return <>{content.escalation && <section><h4>Escalation Guidance</h4>
    <p>Trigger: {content.escalation.trigger}</p><p>Observed Impact: {content.escalation.observedImpact}</p>
    <p>Accountable Role: {content.escalation.accountableRole}</p>
    <p>{content.escalation.routeKnown ? `Known Route: ${content.escalation.route}` : `Unknown Route: ${content.escalation.unknownRouteReason}`}</p>
    <p>Evidence to Provide: {content.escalation.evidenceChecklist}</p><p>Next Checkpoint: {content.escalation.nextCheckpointDate}</p>
  </section>}{content.handoff && <section><h4>Human-Reported Handoff</h4><p>Observed {content.handoff.occurredAt}</p>
    <a href={content.handoff.externalReference} target="_blank" rel="noopener noreferrer nofollow">External Reference</a>
    <p>External acknowledgement: Unknown. External resolution: Unknown. No external action was performed.</p></section>}</>;
}
