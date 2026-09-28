"use client";

import { useEffect, useState } from "react";

type Source = { id: string; state: string; lifecycleGeneration: number;
  canManageLifecycle: boolean; submitted: boolean };
type Impact = { affectedClaims: number; dependentConversations: number };

export function LifecycleActions({ source, onChanged }: { source: Source; onChanged: () => void }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [action, setAction] = useState<"retry" | "cancel" | "withdraw" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementRights, setReplacementRights] = useState("");
  const [replacementAudience, setReplacementAudience] = useState<"internal" | "delivery">("delivery");
  const [replacementKey, setReplacementKey] = useState<string | null>(null);
  const [completionKey, setCompletionKey] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/artifacts/${source.id}/impact`, { cache: "no-store" }).then(async (response) => {
      if (response.ok && active) setImpact((await response.json() as { data: Impact }).data);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [source.id]);
  if (!source.canManageLifecycle) return null;
  const allowed = source.state === "failed" ? ["retry","withdraw","delete"] as const :
    ["quarantined","processing"].includes(source.state) ? ["cancel","withdraw","delete"] as const :
    ["ready","partial"].includes(source.state) ? ["withdraw","delete"] as const :
    source.state === "withdrawn" ? ["delete"] as const : [] as const;
  async function apply() {
    if (!action || !reason.trim() || busy) return;
    const requestKey = key ?? crypto.randomUUID();
    setKey(requestKey); setBusy(true); setMessage("Saving source action…");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) throw new Error();
      const auth = await session.json() as { data: { csrfToken: string } };
      const response = await fetch(`/api/artifacts/${source.id}/actions`, { method: "POST",cache: "no-store",
        headers: { "content-type": "application/json","x-csrf-token": auth.data.csrfToken },
        body: JSON.stringify({ action,expectedGeneration: source.lifecycleGeneration,
          reason: reason.trim(),idempotencyKey: requestKey }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setKey(null);
        setMessage(result.error?.message ?? "Action was not saved."); return;
      }
      setMessage(action === "delete" ? "Access stopped. Physical cleanup is queued." :
        action === "withdraw" ? "Source withdrawn. Dependent guidance is unsupported." :
        action === "retry" ? "Retry queued." : "Processing cancelled.");
      setAction(null); setReason(""); setKey(null); onChanged();
    } catch { setMessage("Result uncertain. Retry with the same reason and request key."); }
    finally { setBusy(false); }
  }
  async function replace() {
    if (!replacementFile || !replacementRights.trim() || busy) return;
    const requestKey = replacementKey ?? crypto.randomUUID();
    const completeKey = completionKey ?? crypto.randomUUID();
    setReplacementKey(requestKey); setCompletionKey(completeKey); setBusy(true);
    setMessage("Creating replacement upload…");
    const types: Record<string,string> = { pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",txt: "text/plain",md: "text/markdown",
      png: "image/png",jpg: "image/jpeg",jpeg: "image/jpeg" };
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) throw new Error("Session unavailable");
      const auth = await session.json() as { data: { csrfToken: string } };
      const created = await fetch(`/api/artifacts/${source.id}/replacements`, {
        method: "POST",cache: "no-store",headers: { "content-type": "application/json",
          "x-csrf-token": auth.data.csrfToken },body: JSON.stringify({
          expectedGeneration: source.lifecycleGeneration,idempotencyKey: requestKey,file: {
            name: replacementFile.name,expectedSizeBytes: replacementFile.size,
            declaredType: types[replacementFile.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? replacementFile.type,
            sourcePublishedOn: null,sourceObservedOn: null,rightsNote: replacementRights.trim(),
            audience: replacementAudience,dataCategory: replacementAudience === "delivery" ?
              "delivery_context" : "internal_operations" } }) });
      const createdBody = await created.json() as { data?: { intent: { id: string;
        versionId: string | null } }; error?: { message?: string } };
      if (!created.ok || !createdBody.data) throw new Error(createdBody.error?.message ?? "Replacement unavailable");
      const intent = createdBody.data.intent;
      if (!intent.versionId) {
        const bytes = await fetch(`/api/artifacts/intents/${intent.id}/bytes`, { method: "PUT",
          headers: { "content-type": "application/octet-stream","x-csrf-token": auth.data.csrfToken },
          body: replacementFile });
        if (!bytes.ok) throw new Error("Replacement bytes were not accepted");
        const completed = await fetch(`/api/artifacts/intents/${intent.id}/complete`, {
          method: "POST",cache: "no-store",headers: { "content-type": "application/json",
            "x-csrf-token": auth.data.csrfToken },body: JSON.stringify({ idempotencyKey: completeKey }) });
        if (!completed.ok) throw new Error("Replacement completion is uncertain. Retry with this file.");
      }
      setMessage("New version queued. The previous version and its reviews remain separate.");
      setReplacementFile(null); setReplacementRights(""); setReplacementKey(null); setCompletionKey(null);
      onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Replacement unavailable"); }
    finally { setBusy(false); }
  }
  return <section className="profile-card" aria-label="Source lifecycle">
    <h3>Manage source</h3>
    <p>{source.submitted ? "This source was submitted for review. Current steward authority is required." :
      "This source has not been submitted for review."}</p>
    {impact && <p>{impact.affectedClaims} linked claim(s) and {impact.dependentConversations} dependent conversation(s) may be affected.</p>}
    <div className="profile-review-actions">{allowed.map((item) => <button key={item} type="button"
      className="secondary-button" onClick={() => { setAction(item); setReason(""); setKey(null); }}>
      {item === "retry" ? "Retry failed processing" : item === "cancel" ? "Cancel processing" :
        item === "withdraw" ? "Withdraw source" : "Delete source and content"}</button>)}</div>
    {["ready","partial","failed","withdrawn"].includes(source.state) && <div>
      <h4>Replace with a new version</h4><p>The old version and its review history stay separate.</p>
      <label className="field-label" htmlFor={`artifact-replacement-${source.id}`}>Replacement file</label>
      <input id={`artifact-replacement-${source.id}`} type="file"
        accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" disabled={busy}
        onChange={(event) => { setReplacementFile(event.target.files?.[0] ?? null); setReplacementKey(null); }} />
      <label className="field-label" htmlFor={`artifact-replacement-rights-${source.id}`}>Rights note</label>
      <input id={`artifact-replacement-rights-${source.id}`} className="field" maxLength={500}
        value={replacementRights} disabled={busy} onChange={(event) => {
          setReplacementRights(event.target.value); setReplacementKey(null); }} />
      <label className="field-label" htmlFor={`artifact-replacement-audience-${source.id}`}>Audience</label>
      <select id={`artifact-replacement-audience-${source.id}`} className="field"
        value={replacementAudience} disabled={busy} onChange={(event) => {
          setReplacementAudience(event.target.value as "internal" | "delivery"); setReplacementKey(null); }}>
        <option value="delivery">Delivery</option><option value="internal">Internal</option></select>
      <button type="button" className="secondary-button" disabled={busy || !replacementFile ||
        replacementFile.size < 1 || replacementFile.size > 10_485_760 || !replacementRights.trim()}
        onClick={() => void replace()}>Upload new version</button>
    </div>}
    {action && <div><p className="profile-caution">Confirm {action} for generation {source.lifecycleGeneration}.
      {action === "delete" ? " Original bytes and application excerpt payloads will be purged asynchronously." : ""}</p>
      <label className="field-label" htmlFor={`artifact-action-reason-${source.id}`}>Reason</label>
      <textarea id={`artifact-action-reason-${source.id}`} className="field" rows={2} maxLength={2000}
        value={reason} disabled={busy} onChange={(event) => { setReason(event.target.value); setKey(null); }} />
      <button type="button" className="primary-button" disabled={!reason.trim() || busy}
        onClick={() => void apply()}>Confirm {action}</button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => { setAction(null); setKey(null); }}>Back</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
