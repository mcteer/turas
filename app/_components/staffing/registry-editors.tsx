"use client";
import { useState } from "react";
import type { StaffingOperationalResource } from "../../../lib/contracts/staffing";
import { useStaffingDirtyInputs, type useStaffingCommand } from "./client";
type Command = ReturnType<typeof useStaffingCommand>;
export type EditableSkill = { skillId: string; key: string; name: string; definition: string; state: string;
  revisionId: string; contentDigest: string; aggregateVersion: number };
export type EditableResource = StaffingOperationalResource & { manager?: { externalKey: string; membershipId: string | null;
  partnerOrganizationId: string | null; revisionId: string; contentDigest: string } };

/** Capture the exact revision when editing starts. Background projections never
 * silently rebase unsaved input onto a different revision. */
export function SkillRevisionEditor({ skill, command }: { skill: EditableSkill; command: Command }) {
  const [base, setBase] = useState<EditableSkill | null>(null), edits = useStaffingDirtyInputs();
  return base ? <form className="evidence-search-form" onChange={() => edits.touch("skill")} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), confirmed = edits.confirmation("skill");
    void command.save(`/api/staffing/skills/${base.skillId}`, { revisionId: base.revisionId, contentDigest: base.contentDigest,
      expectedAggregateVersion: base.aggregateVersion, rationale: data.get("rationale"), skill: { key: base.key,
        name: data.get("name"), definition: data.get("definition"), state: data.get("state") } }, "PATCH", () => { if (confirmed()) setBase(null); });
  }}><h4>Revise {base.name}</h4>
    {base.revisionId !== skill.revisionId && <p role="status">This skill changed. Save will check the original revision; reopen the editor to use the current version.</p>}
    <label>Name<input className="field" name="name" required maxLength={160} defaultValue={base.name} /></label>
    <label>Definition<textarea className="field" name="definition" required maxLength={2000} defaultValue={base.definition} /></label>
    <label>State<select className="field" name="state" aria-label="State" defaultValue={base.state}><option value="active">Active</option><option value="retired">Retired</option></select></label>
    <label>Revision rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
    <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save skill revision</button>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved skill changes?")) { edits.confirmation("skill")(); setBase(null); }
    }}>Close skill editor</button>
  </form> : <button className="secondary-button" disabled={command.busy || !!command.uncertainKey} onClick={() => setBase({ ...skill })}>Revise skill</button>;
}
export function ResourceRevisionEditor({ resource, command }: { resource: EditableResource; command: Command }) {
  const [base, setBase] = useState<EditableResource | null>(null), edits = useStaffingDirtyInputs();
  if (!resource.manager) return null;
  return base?.manager ? <form className="evidence-search-form" onChange={() => edits.touch("resource")} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), confirmed = edits.confirmation("resource");
    void command.save(`/api/staffing/resources/${base.resourceId}`, { revisionId: base.manager!.revisionId,
      contentDigest: base.manager!.contentDigest, expectedAggregateVersion: base.aggregateVersion, rationale: data.get("rationale"),
      resource: { externalKey: base.manager!.externalKey, membershipId: base.manager!.membershipId,
        partnerOrganizationId: base.manager!.partnerOrganizationId, kind: base.kind, displayName: data.get("displayName"),
        timezone: data.get("timezone"), regionCode: data.get("regionCode"), state: data.get("state") } }, "PATCH", () => { if (confirmed()) setBase(null); });
  }}><h2>Revise Resource</h2><p>The resource identity and linked membership remain fixed.</p>
    {base.aggregateVersion !== resource.aggregateVersion && <p role="status">This resource changed. Reopen the editor to use the current version.</p>}
    <label>Display name<input className="field" name="displayName" required maxLength={160} defaultValue={base.displayName} /></label>
    <label>Timezone<input className="field" name="timezone" required defaultValue={base.timezone} /></label>
    <label>Region code<input className="field" name="regionCode" required maxLength={32} pattern="[A-Za-z0-9-]+" defaultValue={base.regionCode} /></label>
    <label>State<select className="field" name="state" aria-label="State" defaultValue={base.state}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <label>Revision rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
    <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save resource revision</button>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved resource changes?")) { edits.confirmation("resource")(); setBase(null); }
    }}>Close resource editor</button>
  </form> : <button className="secondary-button" disabled={command.busy || !!command.uncertainKey} onClick={() => setBase({ ...resource })}>Revise resource</button>;
}
export function PartnerEligibilityEditor({ resource, command }: { resource: EditableResource; command: Command }) {
  const [base, setBase] = useState<EditableResource | null>(null), edits = useStaffingDirtyInputs();
  if (resource.kind !== "partner" || !resource.manager) return null;
  return base?.manager ? <form className="evidence-search-form" onChange={() => edits.touch("eligibility")} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), confirmed = edits.confirmation("eligibility");
    void command.save(`/api/staffing/resources/${base.resourceId}/eligibility`, { revisionId: base.manager!.revisionId,
      contentDigest: base.manager!.contentDigest, expectedAggregateVersion: base.aggregateVersion,
      customerId: data.get("customerId"), fromDate: data.get("fromDate"), toDate: data.get("toDate"),
      state: data.get("state"), rationale: data.get("rationale") }, "POST", () => { if (confirmed()) setBase(null); });
  }}><h2>Dated Partner Eligibility</h2><p>A linked partner member must also have a current customer grant.</p>
    {base.aggregateVersion !== resource.aggregateVersion && <p role="status">Resource eligibility changed. Reopen to review the current version.</p>}
    <label>Customer ID<input className="field" name="customerId" required /></label>
    <label>First eligible date<input className="field" name="fromDate" type="date" min="2000-01-01" max="2100-12-31" required /></label>
    <label>Last eligible date<input className="field" name="toDate" type="date" min="2000-01-01" max="2100-12-31" required /></label>
    <label>Eligibility state<select className="field" aria-label="Eligibility state" name="state"><option value="active">Active</option><option value="retracted">Retracted</option></select></label>
    <label>Eligibility rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
    <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Save dated eligibility</button>
    <button type="button" disabled={command.busy || !!command.uncertainKey} onClick={() => {
      if (!edits.dirty || window.confirm("Discard unsaved eligibility changes?")) { edits.confirmation("eligibility")(); setBase(null); }
    }}>Close eligibility editor</button>
  </form> : <button className="secondary-button" disabled={command.busy || !!command.uncertainKey || resource.state !== "active"} onClick={() => setBase({ ...resource })}>Set dated partner eligibility</button>;
}
