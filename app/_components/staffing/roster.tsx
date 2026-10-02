"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { StaffingOperationalResource } from "../../../lib/contracts/staffing";
import { staffingGet, useStaffingDirtyInputs, useStaffingCommand } from "./client";

import { SkillRevisionEditor, type EditableSkill } from "./registry-editors";
type Skill = EditableSkill;
type Page<T> = { items: T[]; nextCursor: string | null };
export function StaffingRoster({ manager, csrfToken }: { manager: boolean; csrfToken: string }) {
  const [resources, setResources] = useState<StaffingOperationalResource[]>([]), [skills, setSkills] = useState<Skill[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [skillCursor, setSkillCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const edits = useStaffingDirtyInputs();
  async function load(next: string | null = null) {
    setBusy(true); setError("");
    try {
      const page = await staffingGet<Page<StaffingOperationalResource>>(`/api/staffing/resources${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
      setResources(old => next ? [...old, ...page.items] : page.items); setCursor(page.nextCursor);
      if (!next) { const taxonomy = await staffingGet<Page<Skill>>("/api/staffing/skills"); setSkills(taxonomy.items); setSkillCursor(taxonomy.nextCursor); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Roster unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  async function moreSkills() {
    if (!skillCursor) return;
    try { const page = await staffingGet<Page<Skill>>(`/api/staffing/skills?cursor=${encodeURIComponent(skillCursor)}`);
      setSkills(old => [...old, ...page.items]); setSkillCursor(page.nextCursor); }
    catch { setError("Skills unavailable. Try again."); }
  }
  return <>
    <header className="profile-header"><div><p className="profile-eyebrow">Staffing</p><h1>Resources and skills</h1>
      <p>Approved competency summaries. Freshness reflects the original assessment date.</p></div>
      {manager && <Link className="secondary-button" href="/staffing/imports">Workforce imports</Link>}</header>
    {error && <p role="alert">{error} <button onClick={() => void load()}>Reload</button></p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    <section className="profile-section" aria-labelledby="roster-heading"><h2 id="roster-heading">Resource directory</h2>
      {busy && <p role="status">Loading roster…</p>}
      {!busy && !error && !resources.length && <p>No resources have been registered.</p>}
      <div className="profile-grid">{resources.map(resource => <article className="profile-card" key={resource.resourceId}>
        <h3><Link href={`/staffing/resources/${resource.resourceId}`}>{resource.displayName}</Link></h3>
        <p>{resource.kind} · {resource.state} · {resource.timezone}{resource.regionCode ? ` · ${resource.regionCode}` : ""}</p>
        {!resource.skills.length && <p>No current approved competencies.</p>}
        <ul>{resource.skills.map(skill => <li key={skill.skillId}>{skills.find(s => s.skillId === skill.skillId)?.name ?? `Skill ${skill.skillId}`} · level {skill.level} · {skill.freshness}</li>)}</ul>
        {resource.skillsNextCursor && <p>More approved skills are available in the resource detail.</p>}
      </article>)}</div>
      {cursor && <button className="secondary-button" disabled={busy} onClick={() => void load(cursor)}>More resources</button>}
    </section>
    <section className="profile-section" aria-labelledby="skills-heading"><h2 id="skills-heading">Skill taxonomy</h2>
      <div className="profile-grid">{skills.map(skill => <article className="profile-card" key={skill.skillId}><h3>{skill.name}</h3><p>{skill.definition}</p><p>{skill.key} · {skill.state}</p>{manager && <SkillRevisionEditor skill={skill} command={command} />}</article>)}</div>
      {skillCursor && <button className="secondary-button" onClick={() => void moreSkills()}>More skills</button>}
      {manager && <form className="evidence-search-form" onChange={() => edits.touch("skill")} onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
        void command.save("/api/staffing/skills", { rationale: data.get("rationale"), skill: { key: data.get("key"), name: data.get("name"), definition: data.get("definition"), state: "active" } }, "POST", edits.confirmation("skill", form));
      }}><h3>Add a skill</h3>
        <label>Canonical key<input className="field" name="key" required pattern="[a-z][a-z0-9_-]{0,63}" maxLength={64} /></label>
        <label>Name<input className="field" name="name" required maxLength={160} /></label>
        <label>Definition<textarea className="field" name="definition" required maxLength={2000} /></label>
        <label>Rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
        <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Add skill</button>
      </form>}
    </section>
    {manager && <section className="profile-section"><form className="evidence-search-form" onChange={() => edits.touch("resource")} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
      void command.save("/api/staffing/resources", { rationale: data.get("rationale"), resource: { externalKey: data.get("externalKey"),
        displayName: data.get("displayName"), kind: data.get("kind"), state: "active", membershipId: data.get("membershipId") || null,
        partnerOrganizationId: data.get("partnerOrganizationId") || null, timezone: data.get("timezone"), regionCode: data.get("regionCode") } }, "POST", edits.confirmation("resource", form));
    }}><h2>Register a resource</h2>
      <label>Stable external key<input className="field" name="externalKey" required maxLength={100} pattern="[A-Za-z0-9_-]+" /></label>
      <label>Display name<input className="field" name="displayName" required maxLength={160} /></label>
      <label>Kind<select className="field" aria-label="Kind" name="kind"><option value="internal">Internal</option><option value="partner">Partner</option></select></label>
      <label>Membership ID (optional)<input className="field" name="membershipId" /></label>
      <label>Partner organization ID (required for partners)<input className="field" name="partnerOrganizationId" /></label>
      <label>Timezone<input className="field" name="timezone" required placeholder="America/Denver" /></label>
      <label>Region code<input className="field" name="regionCode" required maxLength={32} pattern="[A-Za-z0-9-]+" /></label>
      <label>Rationale<textarea className="field" name="rationale" required maxLength={2000} /></label>
      <button className="primary-button" disabled={command.busy || !!command.uncertainKey}>Register resource</button>
    </form></section>}
  </>;
}
