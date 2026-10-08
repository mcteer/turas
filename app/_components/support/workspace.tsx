"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import type { SupportAction, SupportAssessment } from "../../../lib/contracts/support";
import type { SupportSource } from "../../../lib/server/support/schema";
import { ReadinessForm, ReadinessSummary } from "./readiness";
import { ActionForm, ActionList } from "./actions";
import { SupportAdvice } from "./advice";
import { supportLabel, type SupportSession, type SupportWorkspaceData, type SupportRevision } from "./types";

type Envelope<T> = { data?: T; error?: { message: string; code: string } };
type EvidenceResult = { title: string; text: string; asOf: string; quality: { band: string }; caveats: string[]; reference: SupportSource };
type Receipt = { requestKey?: string; recordId: string; revisionId: string; outcome: string };

export function SupportWorkspace({ customerId }: { customerId: string }) {
  const [session, setSession] = useState<SupportSession | null>(null);
  const [view, setView] = useState<SupportWorkspaceData | null>(null);
  const [audience, setAudience] = useState<"internal" | "delivery">("delivery");
  const [workloadId, setWorkloadId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState("Loading support guidance…");
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const commandActive = useRef(false);
  const [editor, setEditor] = useState<"assessment" | "action" | null>(null);
  const [editing, setEditing] = useState<{ recordId: string; version: number; revision: SupportRevision } | null>(null);
  const [sources, setSources] = useState<SupportSource[]>([]);
  const [selectedEngagements, setSelectedEngagements] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EvidenceResult[]>([]);
  const [review, setReview] = useState<{ recordId: string; revision: SupportRevision } | null>(null);
  const [preview, setPreview] = useState<{ sourceDigest: string; expectedVersion: number; expiresAt: string; sourceState: string } | null>(null);
  const [rationale, setRationale] = useState("");
  const [history, setHistory] = useState<SupportRevision[] | null>(null);
  const canWrite = session?.membership.kind === "internal";
  const canReview = session?.principal.id === DEMO_IDS.mcteer && session.membership.role === "admin";
  const base = `/api/support/customers/${encodeURIComponent(customerId)}`;
  const clearEditor = useCallback(() => { setEditor(null); setEditing(null); setSources([]); setResults([]);
    setSelectedEngagements([]); setReview(null); setPreview(null); setHistory(null); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ audience });
    if (workloadId) params.set("workloadId", workloadId);
    if (cursor) params.set("cursor", cursor);
    void Promise.all([fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
      fetch(`${base}?${params}`, { cache: "no-store", signal: controller.signal })]).then(async ([auth, response]) => {
      if ([401, 403, 404].includes(auth.status) || [401, 403, 404].includes(response.status)) {
        setView(null); setSession(null); clearEditor(); setStatus("Support guidance is unavailable to your account."); return;
      }
      const authBody = await auth.json() as Envelope<SupportSession>, body = await response.json() as Envelope<SupportWorkspaceData>;
      if (!auth.ok || !authBody.data || !response.ok || !body.data) throw new Error(body.error?.message ?? "Support guidance unavailable");
      setSession(authBody.data); setView(body.data); setStatus("");
    }).catch(error => { if (error.name === "AbortError") return; setView(null); setStatus(error.message); });
    return () => controller.abort();
  }, [base, audience, workloadId, cursor, refresh, clearEditor]);
  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    window.addEventListener("focus", update);
    const interval = window.setInterval(update, 10000);
    return () => { window.removeEventListener("focus", update); window.clearInterval(interval); };
  }, []);

  async function post<T>(path: string, input: unknown): Promise<T> {
    if (!session) throw new Error("Sign in again");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
      body: JSON.stringify(input) });
    const body = await response.json() as Envelope<T>;
    if (!response.ok || !body.data) {
      const error = new Error(body.error?.message ?? "Support request unavailable") as Error & { status?: number };
      error.status = response.status; throw error;
    }
    return body.data;
  }
  async function reconcile(key = pendingKey) {
    if (!key) return;
    setStatus("Checking Save Status…");
    try {
      const response = await fetch(`/api/support/receipts/${key}`, { cache: "no-store" });
      const body = await response.json() as Envelope<Receipt>;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Save remains unconfirmed; do not resubmit");
      setPendingKey(null); clearEditor(); setStatus("Save confirmed. Guidance remains subject to review.");
      setCursor(null); setRefresh(value => value + 1);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Save remains unconfirmed"); }
  }
  async function command(input: Record<string, unknown>) {
    if (commandActive.current || pendingKey) throw new Error("Reconcile the previous save before another command");
    commandActive.current = true; setBusy(true);
    const key = crypto.randomUUID(); setPendingKey(key); setStatus("Saving…");
    try {
      await post(`${base}/commands`, { contractVersion: "support-v1", requestKey: key, workloadId: workloadId || null, ...input });
      setPendingKey(null); clearEditor(); setCursor(null); setRefresh(value => value + 1); setStatus("Proposal or decision saved.");
    } catch (error) {
      if ((error as { status?: number }).status && (error as { status: number }).status < 500) {
        setPendingKey(null); setStatus(error instanceof Error ? error.message : "Save conflict; refresh before trying again");
      } else { await reconcile(key); }
      throw error;
    } finally { setBusy(false); commandActive.current = false; }
  }
  function begin(kind: "assessment" | "action", recordId?: string, version?: number, revision?: SupportRevision | null) {
    setEditor(kind); setEditing(recordId && revision ? { recordId, version: version ?? 0, revision } : null);
    setSources(revision?.sources ?? []); setSelectedEngagements(revision?.selectedEngagementIds ?? []); setResults([]); setReview(null); setPreview(null);
  }
  async function save(content: SupportAssessment | SupportAction) {
    await command({ operation: "checks" in content ? "save_assessment" : "save_action", audience,
      expectedVersion: editing?.version ?? 0, ...(editing ? { recordId: editing.recordId } : {}),
      selectedEngagementIds: selectedEngagements, sourceRefs: sources, content });
  }
  async function search() {
    setBusy(true);
    try { setResults((await post<{ results: EvidenceResult[] }>(`${base}/sources`, { workloadId: workloadId || null, audience, query })).results); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Evidence unavailable"); }
    finally { setBusy(false); }
  }
  async function previewReview(recordId: string, revision: SupportRevision) {
    setBusy(true); setReview({ recordId, revision }); setPreview(null); setRationale("");
    try { setPreview(await post(`${base}/preview`, { workloadId: workloadId || null, recordId, revisionId: revision.revisionId })); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Review preview unavailable"); }
    finally { setBusy(false); }
  }
  async function loadHistory(recordId: string) {
    const params = new URLSearchParams({ audience, recordId }); if (workloadId) params.set("workloadId", workloadId);
    try { const response = await fetch(`${base}?${params}`, { cache: "no-store" });
      const body = await response.json() as Envelope<{ revisions: SupportRevision[] }>;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "History unavailable"); setHistory(body.data.revisions);
    } catch (error) { setStatus(error instanceof Error ? error.message : "History unavailable"); }
  }

  return <main className="profile-page"><nav aria-label="Breadcrumb" className="profile-breadcrumb">
    <Link href={`/customers/${customerId}`}>Customer Profile</Link><span aria-hidden="true">/</span><span>Support Guidance</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Customer Operations</p><h1>Support Guidance</h1>
      {view && <p>{view.metadata.customer.displayName}</p>}</div><button className="secondary-button" onClick={() => { setCursor(null); setRefresh(value => value + 1); }}>Refresh Guidance</button></header>
    {status && <p role="status">{status}</p>}
    {pendingKey && <button className="secondary-button" disabled={busy} onClick={() => void reconcile()}>Check Save Status</button>}
    {view && <><div className="profile-toolbar"><label className="field-label">Workload<select className="field" value={workloadId}
      onChange={event => { setWorkloadId(event.target.value); setCursor(null); setView(null); clearEditor(); }}><option value="">Customer-wide</option>
      {view.metadata.workloads.map(item => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label>
      {canWrite && <label className="field-label">Audience<select className="field" value={audience}
        onChange={event => { setAudience(event.target.value as typeof audience); setCursor(null); setView(null); clearEditor(); }}>
        <option value="delivery">Delivery</option><option value="internal">Internal</option></select></label>}</div>
      <ReadinessSummary revision={view.assessment} effective={view.effectiveReadiness} />
      <details className="profile-card"><summary>Maturity Context</summary><p>Maturity is not support readiness.</p>
        {!view.metadata.maturity.length && <p>No eligible accepted maturity assessment for this scope.</p>}
        {view.metadata.maturity.map(item => <div key={item.revisionId}><p>Observed {item.observationEnd} · Review {item.reviewAt}</p>
          {item.dimensions.map(dimension => <p key={dimension.key}>{supportLabel(dimension.key)}: {dimension.level ?? dimension.state} · {dimension.rationale}</p>)}</div>)}</details>
      <details className="profile-card"><summary>Engagement Inputs</summary>
        {!view.metadata.engagements.length && <p>No engagement is required to assess this scope.</p>}
        <p>Explicit selection only; engagement progress does not establish readiness.</p>
        {view.metadata.engagements.map((item, index) => <label className="field-label" key={item.id}>
          {canWrite && editor && <input type="checkbox" checked={selectedEngagements.includes(item.id)}
            onChange={event => setSelectedEngagements(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />}
          Engagement {index + 1} <Link href={`/customers/${customerId}/engagements/${item.id}`}>View Engagement</Link></label>)}
        {view.metadata.engagementSelectionIncomplete && <p>Narrow the workload to select from the full engagement set.</p>}</details>
      {canWrite && <div className="profile-toolbar"><button className="primary-button" disabled={busy || !!pendingKey}
        onClick={() => begin("assessment", view.recordId ?? undefined, view.expectedVersion ?? undefined, view.proposal ?? view.assessment)}>Propose Readiness</button>
        <button className="secondary-button" disabled={busy || !!pendingKey} onClick={() => begin("action")}>Propose Action</button>
        <Link href={`/customers/${customerId}/review`}>Review Customer Facts Separately</Link></div>}
      {view.proposal && <section className="profile-card"><h2>Pending Assessment Proposal</h2>
        <p>Accepted readiness remains unchanged until exact review.</p>
        {view.proposal.content && "checks" in view.proposal.content && <p>{view.proposal.content.title}</p>}
        {canReview && view.recordId && <button className="secondary-button" disabled={busy || !!pendingKey}
          onClick={() => void previewReview(view.recordId!, view.proposal!)}>Preview Assessment Review</button>}</section>}
      {canReview && view.assessment && view.recordId && <button className="secondary-button" disabled={busy || !!pendingKey}
        onClick={() => void previewReview(view.recordId!, view.assessment!)}>Preview Accepted Assessment</button>}
      <ActionList actions={view.actions} canWrite={!!canWrite} canReview={!!canReview} owners={view.metadata.owners}
        onEdit={item => begin("action", item.recordId, item.expectedVersion ?? 0, item.proposal ?? item.accepted)}
        onReview={(id, revision) => void previewReview(id, revision)} onHistory={id => void loadHistory(id)} />
      {view.nextCursor && <button className="secondary-button" onClick={() => { clearEditor(); setCursor(view.nextCursor); }}>Next Action Page</button>}
      {editor && canWrite && <section className="profile-card"><h2>Selected Evidence</h2>
        <p>Only current {audience} inputs are offered. New customer facts require separate factual review.</p>
        <label className="field-label">Evidence Search<input className="field" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} /></label>
        <button type="button" className="secondary-button" disabled={busy || !query.trim()} onClick={() => void search()}>Find Eligible Evidence</button>
        {!results.length && <p>No search results selected. Unknowns and discovery actions can be saved without evidence.</p>}
        {results.map(item => <article className="profile-card" key={item.reference.id}><h3>{item.title}</h3><p>{item.text}</p>
          <p>{item.quality.band} · Retrieved {item.asOf}</p>{item.caveats.map((caveat, index) => <p key={index}>{caveat}</p>)}
          <button type="button" className="secondary-button" disabled={sources.some(source => source.sourceRevisionId === item.reference.sourceRevisionId) || sources.length >= 20}
            onClick={() => setSources(current => [...current, item.reference])}>Select Evidence</button></article>)}
        {sources.map((source, index) => <p key={source.id}>Evidence {index + 1}: {supportLabel(source.kind)}
          <button type="button" className="secondary-button" onClick={() => setSources(current => current.filter(item => item.id !== source.id))}>Remove Evidence {index + 1}</button></p>)}</section>}
      {editor === "assessment" && <ReadinessForm key={`${audience}:${workloadId}:${editing?.revision.revisionId ?? "new"}`}
        initial={editing?.revision.content && "checks" in editing.revision.content ? editing.revision.content : null}
        sources={sources} busy={busy || !!pendingKey} onSave={save} />}
      {editor === "action" && <ActionForm key={`${audience}:${workloadId}:${editing?.revision.revisionId ?? "new"}`}
        initial={editing?.revision.content && "owner" in editing.revision.content ? editing.revision.content : null}
        owners={view.metadata.owners} sources={sources} busy={busy || !!pendingKey} onSave={save} />}
      {review && preview && canReview && <section className="profile-card" aria-labelledby="support-review-heading"><h2 id="support-review-heading">Exact Human Review</h2>
        <p>Revision {review.revision.ordinal} · Evidence {preview.sourceState} · Preview expires {preview.expiresAt}</p>
        <label className="field-label">Review Rationale<textarea className="field" maxLength={2000} required value={rationale} onChange={event => setRationale(event.target.value)} /></label>
        {review.revision.accepted ? <button className="secondary-button" disabled={busy || !!pendingKey || !rationale.trim()} onClick={() => void command({ operation: "withdraw_record",
          recordId: review.recordId, revisionId: review.revision.revisionId, expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest, rationale }).catch(() => undefined)}>Withdraw Record</button>
          : (["accept", "reject"] as const).map(decision => <button className="secondary-button" key={decision}
            disabled={busy || !!pendingKey || !rationale.trim() || (decision === "accept" && preview.sourceState !== "current")}
            onClick={() => void command({ operation: "review_revision", decision, recordId: review.recordId,
              revisionId: review.revision.revisionId, expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest, rationale }).catch(() => undefined)}>{supportLabel(decision)} Revision</button>)}</section>}
      {history && <section className="profile-card"><h2>Permitted History</h2>{history.map(revision => <article key={revision.revisionId}>
        <h3>Revision {revision.ordinal}</h3><p>{revision.accepted ? "Current Accepted" : "Historical or Proposed"} · {revision.disposition ? supportLabel(revision.disposition) : "Assessment"}</p>
        <p>{revision.content?.title ?? "Content unavailable; review required"}</p></article>)}</section>}
      {canWrite && session && <SupportAdvice key={`${customerId}:${workloadId}:${audience}`} customerId={customerId} workloadId={workloadId || null}
        audience={audience} sources={sources} engagements={selectedEngagements} session={session} onSaved={() => setRefresh(value => value + 1)} />}
    </>}
  </main>;
}
