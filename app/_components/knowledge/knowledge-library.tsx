"use client";

import { LearningFeedbackButton } from "../learning/feedback-button";

import { titleCaseLabel } from "../title-case-label";

import { EmptyState } from "../empty-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PublishedKnowledge } from "../../../lib/contracts/knowledge";
import { TypedConflictReview } from "../profiles/conflict-review";

type Payload = PublishedKnowledge["payload"];
type Candidate = { id: string; customerId: string; state: string; revision: number;
  digest: string; payload: Payload; publication: { id: string; generation: number; state: string } | null };
type SourceOption = { sourceKind: "accepted_profile"; sourceRevisionId: string;
  sourceGeneration: number; sourceDigest: string; label: string };
type Lineage = Omit<SourceOption,"label"> & { rightsBasis: string };
type Customer = { id: string; displayName: string };
type Auth = { csrfToken: string; membership: { role: string; kind: string } };
type KnowledgeImpact = { publications: { published: number; suspended: number;
  withdrawn: number };cleanupJobs: { queued: number; leased: number;
  failed: number; unconfirmed: number } };
const fields: Array<{ key: keyof Payload; label: string }> = [
  { key: "title",label: "Title" },{ key: "productVersion",label: "Product version" },
  { key: "problem",label: "Problem" },{ key: "prerequisites",label: "Prerequisites" },
  { key: "solution",label: "Solution" },{ key: "reasoning",label: "Reasoning" },
  { key: "applicability",label: "Applicability" },{ key: "limitations",label: "Limitations" },
  { key: "validation",label: "Validation" },
];
const emptyPayload = Object.fromEntries(fields.map(({ key }) => [key,""])) as Payload;
const checks = [
  ["namesAndDomainsRemoved","Names and domains have been removed"],
  ["repositoriesAndLinksRemoved","Repositories and identifying links have been removed"],
  ["peopleAndCommercialDetailsRemoved","People and commercial details have been removed"],
  ["identifyingConfigurationAndOutcomesRemoved","Identifying configurations and outcomes have been removed"],
  ["countsAndCombinedInferenceReviewed","Counts and combined clues have been reviewed"],
] as const;

async function envelope<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url,{ cache: "no-store",...options });
  const result = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Request unavailable");
  return result.data;
}

export function KnowledgeLibrary() {
  const [auth,setAuth] = useState<Auth | null>(null);
  const [entries,setEntries] = useState<PublishedKnowledge[]>([]);
  const [candidates,setCandidates] = useState<Candidate[]>([]);
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [selectedPublic,setSelectedPublic] = useState<PublishedKnowledge | null>(null);
  const [publicState,setPublicState] = useState<"idle" | "loading" | "ready" | "stale">("idle");
  const publicationRequest = useRef(0);
  const [selected,setSelected] = useState<Candidate | null>(null);
  const [customerId,setCustomerId] = useState("");
  const [sources,setSources] = useState<SourceOption[]>([]);
  const [sourceId,setSourceId] = useState("");
  const [rightsBasis,setRightsBasis] = useState("");
  const [lineage,setLineage] = useState<Lineage[]>([]);
  const [payload,setPayload] = useState<Payload>({ ...emptyPayload });
  const [rationale,setRationale] = useState("");
  const [checked,setChecked] = useState<Record<string,boolean>>({});
  const [state,setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [impact,setImpact] = useState<KnowledgeImpact | null>(null);
  const [impactUnavailable,setImpactUnavailable] = useState(false);

  async function reloadImpact() {
    try { setImpact(await envelope<KnowledgeImpact>("/api/knowledge/impact"));
      setImpactUnavailable(false); }
    catch { setImpact(null);setImpactUnavailable(true); }
  }

  async function reload() {
    try {
      const session = await envelope<Auth>("/api/auth/session");
      setAuth(session);
      const [library,privateCandidates,customerList] = await Promise.all([
        envelope<{ entries: PublishedKnowledge[] }>("/api/knowledge"),
        envelope<Candidate[]>("/api/knowledge/contributions"),
        envelope<{ items: Customer[] }>("/api/customers"),
      ]);
      setEntries(library.entries); setCandidates(privateCandidates);
      setCustomers(customerList.items); setState("ready");
      if (session.membership.kind === "internal" && session.membership.role === "admin") {
        await reloadImpact();
      }
    } catch { setState("unavailable"); }
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (!selectedPublic) return;
    const recheck = () => { void openPublished(selectedPublic); };
    window.addEventListener("focus",recheck);
    return () => window.removeEventListener("focus",recheck);
  },[selectedPublic?.id]);
  useEffect(() => {
    if (!customerId) { setSources([]); return; }
    let active = true;
    void envelope<SourceOption[]>(`/api/knowledge/sources?customerId=${encodeURIComponent(customerId)}`)
      .then((found) => { if (active) setSources(found); })
      .catch(() => { if (active) setSources([]); });
    return () => { active = false; };
  },[customerId]);

  async function write<T>(url: string,body: unknown): Promise<T> {
    if (!auth) throw new Error("Sign in again");
    return envelope<T>(url,{ method: "POST",headers: { "content-type": "application/json",
      "x-csrf-token": auth.csrfToken },body: JSON.stringify(body) });
  }
  async function openPublished(entry: PublishedKnowledge) {
    const request = ++publicationRequest.current;
    setPublicState("loading");
    try {
      const current = await envelope<PublishedKnowledge>(`/api/knowledge/${entry.id}`);
      if (request !== publicationRequest.current) return;
      setSelectedPublic(current);
      setPublicState("ready");
    } catch {
      if (request !== publicationRequest.current) return;
      setSelectedPublic(null);setPublicState("stale");
    }
  }
  async function selectCandidate(candidate: Candidate) {
    setSelected(candidate); setPayload(candidate.payload); setCustomerId(candidate.customerId);
    setNotice("");
    try { setLineage(await envelope<Lineage[]>(`/api/knowledge/contributions/${candidate.id}/lineage`)); }
    catch { setLineage([]); setNotice("Source access changed. This candidate cannot be reviewed."); }
  }
  function resetEditor() {
    setSelected(null); setPayload({ ...emptyPayload }); setLineage([]);setSourceId("");
    setRightsBasis("");setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setNotice("");
    try {
      let result: { id: string; revision: number; digest: string };
      if (selected) {
        result = await write(`/api/knowledge/contributions/${selected.id}/revisions`,{
          idempotencyKey: crypto.randomUUID(),expectedRevision: selected.revision,
          expectedDigest: selected.digest,payload,lineage });
      } else {
        const option = sources.find((item) => item.sourceRevisionId === sourceId);
        if (!option || !rightsBasis.trim()) throw new Error("Choose a source and state reuse rights.");
        result = await write("/api/knowledge/contributions",{
          idempotencyKey: crypto.randomUUID(),customerId,payload,
          lineage: [{ sourceKind: option.sourceKind,sourceRevisionId: option.sourceRevisionId,
            sourceGeneration: option.sourceGeneration,sourceDigest: option.sourceDigest,
            rightsBasis: rightsBasis.trim() }] });
      }
      setNotice("Draft saved. Review and submit it for publication.");
      await reload();
      const updated = await envelope<Candidate>(`/api/knowledge/contributions/${result.id}`);
      await selectCandidate(updated);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!selected) return;
    setBusy(true);setNotice("");
    try {
      await write(`/api/knowledge/contributions/${selected.id}/submit`,{
        idempotencyKey: crypto.randomUUID(),expectedRevision: selected.revision,
        expectedDigest: selected.digest });
      setNotice("Submitted for administrator review.");await reload();
      await selectCandidate(await envelope<Candidate>(`/api/knowledge/contributions/${selected.id}`));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Submission failed"); }
    finally { setBusy(false); }
  }
  async function decide(action: "publish" | "reject") {
    if (!selected) return;
    setBusy(true);setNotice("");
    try {
      if (!rationale.trim()) throw new Error("Explain the decision.");
      const review = Object.fromEntries(checks.map(([key]) => [key,Boolean(checked[key])]));
      if (action === "publish" && Object.values(review).some((value) => !value)) {
        throw new Error("Complete every sanitization check before publishing.");
      }
      await write(`/api/knowledge/contributions/${selected.id}/decisions`,{
        idempotencyKey: crypto.randomUUID(),expectedRevision: selected.revision,
        expectedDigest: selected.digest,
        ...(selected.publication ? { expectedPublicationGeneration: selected.publication.generation } : {}),
        action,sanitizationRationale: rationale.trim(),
        ...(action === "publish" ? { rightsAttested: true,checklist: review } : {}),
      });
      setNotice(action === "publish" ? "Published shared guidance." : "Candidate rejected.");
      await reload();setSelected(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Decision failed"); }
    finally { setBusy(false); }
  }
  async function withdraw(entry: PublishedKnowledge) {
    const candidate = candidates.find((item) => item.publication?.id === entry.id);
    if (!candidate?.publication) { setNotice("Open the source workspace to withdraw this entry.");return; }
    const reason = rationale.trim();
    if (!reason) { setNotice("Enter a withdrawal reason in the review field.");return; }
    setBusy(true);setNotice("");
    try {
      await write(`/api/knowledge/${entry.id}/withdraw`,{
        idempotencyKey: crypto.randomUUID(),expectedRevision: candidate.revision,
        expectedDigest: candidate.digest,
        expectedPublicationGeneration: candidate.publication.generation,rationale: reason });
      setNotice("Shared entry withdrawn.");publicationRequest.current += 1;
      setSelectedPublic(null);
      setPublicState("idle");await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Withdrawal failed"); }
    finally { setBusy(false); }
  }

  return <main className="profile-page knowledge-page">
    <nav aria-label="Breadcrumb" className="profile-breadcrumb"><Link href="/s">Workspace</Link><span aria-hidden="true">/</span><span>Shared Knowledge</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Reusable Guidance</p>
      <h1>Shared Knowledge</h1><p className="muted">Reviewed product learnings available to active members.</p></div></header>
    {state === "loading" && <p role="status">Loading shared knowledge…</p>}
    {state === "unavailable" && <div role="alert" className="profile-state">Knowledge is unavailable. <button type="button" className="secondary-button" onClick={() => void reload()}>Retry</button></div>}
    {notice && <p role="status" className="profile-state">{notice}</p>}
    {state === "ready" && <>
      <section className="profile-section" aria-labelledby="knowledge-library-heading">
        <div className="profile-section-head"><h2 id="knowledge-library-heading">Published Guidance</h2></div>
        {!entries.length && <EmptyState icon="knowledge" title="No shared guidance has been published.">Reviewed, reusable learnings will appear here once approved for sharing.</EmptyState>}
        <div className="profile-grid">{entries.map((entry) => <article key={entry.id} className="profile-card">
          <div className="profile-card-head"><h3>{entry.payload.title}</h3><span className="profile-badge">{entry.quality.band}</span></div>
          <p>{entry.payload.problem}</p><p className="muted">Product version {entry.payload.productVersion}</p>
          <button type="button" className="secondary-button" onClick={() => void openPublished(entry)}>Read guidance</button>
        </article>)}</div>
        {publicState === "loading" && <p role="status">Checking current publication…</p>}
        {publicState === "stale" && <p role="alert">This publication is no longer available. Refresh the library for current guidance.</p>}
        {selectedPublic && publicState === "ready" && <div className="profile-state knowledge-detail" role="region" aria-label="Shared guidance detail">
          <div className="profile-card-head"><h3>{selectedPublic.payload.title}</h3>
            <button type="button" className="secondary-button" onClick={() => {
              publicationRequest.current += 1;setSelectedPublic(null);
              setPublicState("idle"); }}>Close</button></div>
          <LearningFeedbackButton kind="shared_practice" id={selectedPublic.id}/>
          <p className="muted">Product version {selectedPublic.payload.productVersion} · Published {selectedPublic.publishedAt}</p>
          {fields.filter(({ key }) => key !== "title" && key !== "productVersion").map(({ key,label }) =>
            <section key={key}><h4>{titleCaseLabel(label)}</h4><p>{selectedPublic.payload[key]}</p></section>)}
          <p className="muted">Quality {selectedPublic.quality.Q}/100 ({selectedPublic.quality.band}); {selectedPublic.quality.rationale}</p>
          {selectedPublic.caveats.map((caveat,index) =>
            <p className="profile-caution" key={index}>{caveat}</p>)}
          {auth?.membership.kind === "internal" && auth.membership.role === "admin" &&
            <div><label className="field-label" htmlFor="knowledge-withdraw-reason">Withdrawal reason</label>
              <textarea id="knowledge-withdraw-reason" className="field" value={rationale}
                onChange={(event) => setRationale(event.target.value)} />
              <button type="button" className="secondary-button" disabled={busy}
                onClick={() => void withdraw(selectedPublic)}>Withdraw</button></div>}
        </div>}
      </section>
      <TypedConflictReview scopeKind="shared"
        canReview={auth?.membership.kind === "internal" && auth.membership.role === "admin"} />
      {auth?.membership.kind === "internal" && auth.membership.role === "admin" &&
        <section className="profile-section" aria-labelledby="knowledge-impact-heading">
          <div className="profile-section-head"><h2 id="knowledge-impact-heading">Publication Impact</h2>
            <button className="secondary-button" type="button" onClick={() => void reloadImpact()}>
              Refresh status</button></div>
          {impactUnavailable && <p role="status">Publication impact is unavailable.</p>}
          {impact && <dl className="staffing-metrics" aria-label="Publication impact counts" aria-live="polite">
            <div><dt>Suspended publications</dt><dd>{impact.publications.suspended}</dd></div>
            <div><dt>Cleanup jobs pending</dt><dd>{impact.cleanupJobs.queued + impact.cleanupJobs.leased}</dd></div>
            <div><dt>Need operator review</dt><dd>{impact.cleanupJobs.failed + impact.cleanupJobs.unconfirmed}</dd></div>
          </dl>}
        </section>}
      <section className="profile-section" aria-labelledby="knowledge-contributions-heading">
        <div className="profile-section-head"><h2 id="knowledge-contributions-heading">Contributions</h2></div>
        <p className="muted">Drafts and review items stay private to authorized source members.</p>
        <div className="knowledge-actions"><button type="button" className="secondary-button" onClick={resetEditor}>New contribution</button>
          {candidates.map((item) => <button type="button" className="secondary-button" key={item.id}
            onClick={() => void selectCandidate(item)}>{item.payload.title} · {item.state}</button>)}</div>
        <form onSubmit={(event) => void save(event)} className="knowledge-form">
          {!selected && <fieldset className="form-group"><legend>Source and Reuse Permissions</legend><label htmlFor="knowledge-customer">Source customer
            <select id="knowledge-customer" className="field" required value={customerId}
              onChange={(event) => { setCustomerId(event.target.value);setSourceId(""); }}>
              <option value="">Choose a customer</option>{customers.map((item) =>
                <option key={item.id} value={item.id}>{item.displayName}</option>)}
            </select></label><label htmlFor="knowledge-source">Reviewed source
            <select id="knowledge-source" className="field" required value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Choose accepted context</option>{sources.map((item) =>
                <option key={item.sourceRevisionId} value={item.sourceRevisionId}>{item.label}</option>)}
            </select></label><label htmlFor="knowledge-rights">Reuse rights basis
            <textarea id="knowledge-rights" className="field" required rows={2} value={rightsBasis}
              onChange={(event) => setRightsBasis(event.target.value)} /></label></fieldset>}
          {selected && <p className="muted">{selected.state} · Revision {selected.revision} · {lineage.length ? "Source currently authorized" : "Source unavailable"}</p>}
          {fields.map(({ key,label }) => <label key={key}>{label}
            {key === "title" || key === "productVersion" ?
              <input className="field" required maxLength={200} value={payload[key]}
                onChange={(event) => setPayload((current) => ({ ...current,[key]: event.target.value }))} /> :
              <textarea className="field" required maxLength={2_000} rows={3} value={payload[key]}
                onChange={(event) => setPayload((current) => ({ ...current,[key]: event.target.value }))} />}
          </label>)}
          <p className="muted">Remove names, links, identifying configurations, outcomes, and details that reveal a customer when combined.</p>
          <div className="knowledge-actions"><button type="submit" className="primary-button" disabled={busy || Boolean(selected && !lineage.length)}>Save draft</button>
            {selected?.state === "draft" && <button type="button" className="secondary-button"
              disabled={busy || !lineage.length} onClick={() => void submit()}>Submit for review</button>}</div>
        </form>
        {selected?.state === "submitted" && auth?.membership.kind === "internal" &&
          auth.membership.role === "admin" && <div className="knowledge-review profile-state">
          <h3>Administrator Review</h3><p>Review the exact draft, source rights, and combinations of clues.</p>
          {checks.map(([key,label]) => <label key={key} className="profile-check"><input type="checkbox"
            checked={Boolean(checked[key])} onChange={(event) => setChecked((current) =>
              ({ ...current,[key]: event.target.checked }))} />{label}</label>)}
          <label className="field-label" htmlFor="knowledge-rationale">Decision rationale</label>
          <textarea id="knowledge-rationale" className="field" rows={3} value={rationale}
            onChange={(event) => setRationale(event.target.value)} />
          <div className="knowledge-actions"><button type="button" className="secondary-button" disabled={busy}
            onClick={() => void decide("publish")}>Attest rights and publish</button>
            <button type="button" className="secondary-button" disabled={busy}
              onClick={() => void decide("reject")}>Reject</button></div>
        </div>}
      </section>
    </>}
  </main>;
}
