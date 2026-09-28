"use client";

import { useEffect, useState } from "react";

type Submission = { id: string; kind: string; reviewState: string;
  recordVersion: number;
  payload: Record<string, unknown>; partnerSafeReason?: string | null;
  decisionRationale?: string | null;
  artifactSource?: { excerpt: string; citation: Record<string, string | number> } };
type Result = { data?: { items: Submission[]; nextCursor: string | null } };

function RetractionRequest({ item, customerId, csrfToken, onSaved }: {
  item: Submission; customerId: string; csrfToken: string; onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  async function request() {
    if (!reason.trim()) { setStatus("Explain why this accepted fact should be retracted."); return; }
    const requestKey = key ?? crypto.randomUUID();
    setKey(requestKey); setStatus("Submitting retraction request…");
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "request_retraction", requestKey,
          revisionId: item.id, expectedRecordVersion: item.recordVersion, reason: reason.trim() }) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setKey(null);
        setStatus(result.error?.message ?? "Request was not saved."); return;
      }
      setStatus("Retraction requested. The accepted fact remains in use until a steward resolves it.");
      setKey(null); onSaved();
    } catch { setStatus("The result is uncertain. Retry the same request and key."); }
  }
  return <div className="profile-retraction-form"><label className="field-label" htmlFor={`retraction-${item.id}`}>
    Request retraction</label><textarea id={`retraction-${item.id}`} className="field" rows={2}
      value={reason} disabled={Boolean(key)} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
    <button type="button" className="secondary-button" disabled={!csrfToken} onClick={() => void request()}>
      {key ? "Retry request" : "Ask steward to retract"}</button>
    {status && <p role="status">{status}</p>}</div>;
}

export function OwnSubmissions({ customerId, refresh }: { customerId: string; refresh: number }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [memberKind, setMemberKind] = useState<"internal" | "partner">("partner");
  const [csrfToken, setCsrfToken] = useState("");
  async function load(next?: string, signal?: AbortSignal) {
    setState("loading");
    try {
      const url = new URL(`/api/customers/${customerId}/submissions`, window.location.origin);
      if (next) url.searchParams.set("cursor", next);
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Unavailable");
      const result = await response.json() as Result;
      if (!result.data) throw new Error("Unavailable");
      setItems((current) => next ? [...current, ...result.data!.items] : result.data!.items);
      setCursor(result.data.nextCursor); setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("unavailable");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json()).then((result: { data?: { csrfToken: string;
        membership: { kind: "internal" | "partner" } } }) => {
        if (result.data) { setMemberKind(result.data.membership.kind); setCsrfToken(result.data.csrfToken); }
      }).catch(() => undefined);
    return () => controller.abort();
  }, [customerId, refresh]);
  return <section className="profile-section" aria-labelledby="profile-submissions">
    <div className="profile-section-head"><h2 id="profile-submissions">Your submissions</h2></div>
    {state === "loading" && <p role="status">Loading your submissions…</p>}
    {state === "unavailable" && <p role="alert">Submissions are unavailable. <button type="button" className="secondary-button" onClick={() => void load()}>Retry</button></p>}
    {state === "ready" && items.length === 0 && <p className="muted">You have not submitted context for this customer.</p>}
    {state === "ready" && <div className="profile-grid">{items.map((item) => <article key={item.id} className="profile-card">
      <div className="profile-card-head"><h3>{String(item.payload.title ?? item.payload.displayName ?? item.payload.name ?? item.payload.text ?? item.kind)}</h3>
        <span className="profile-badge">{item.reviewState}</span></div>
      {item.reviewState === "pending" && <p>Awaiting steward review. Accepted context remains unchanged.</p>}
      {item.artifactSource && <div className="profile-note" aria-label="Your submitted source excerpt">
        <p>{item.artifactSource.excerpt}</p>
        <p className="muted">{Object.entries(item.artifactSource.citation).map(([key, value]) =>
          `${key} ${value}`).join(" · ")}</p></div>}
      {item.reviewState === "rejected" && <p>{memberKind === "partner" ? item.partnerSafeReason ?? "No shared reason available" :
        item.decisionRationale ?? "No reason available"}</p>}
      {item.reviewState === "accepted" && <RetractionRequest item={item} customerId={customerId}
        csrfToken={csrfToken} onSaved={() => void load()} />}
    </article>)}</div>}
    {state === "ready" && cursor && <button type="button" className="secondary-button" onClick={() => void load(cursor)}>Load more submissions</button>}
  </section>;
}
