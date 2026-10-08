"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supportAdvicePrompt } from "../../../lib/support/advice";
import { supportAdviceRequestSchema } from "../../../lib/support/advice";
import type { readSupportAdviceStatus } from "../../../lib/server/support/advisory-status";
import type { SupportSource } from "../../../lib/server/support/schema";
import type { SupportSession } from "./types";
type Status = Awaited<ReturnType<typeof readSupportAdviceStatus>>;
type Prepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
type Pending = { chatKey: string; input: z.infer<typeof supportAdviceRequestSchema> };
export function SupportAdvice({ customerId, workloadId, audience, sources, engagements, session, onSaved }: {
  customerId: string; workloadId: string | null; audience: "internal" | "delivery"; sources: SupportSource[];
  engagements: string[]; session: SupportSession; onSaved: () => void }) {
  const [status, setStatus] = useState<Status | null>(null), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [withheld, setWithheld] = useState(false);
  const active = useRef(false), pending = useRef<Pending | null>(null), savedId = useRef<string | null>(null), alive = useRef(true);
  const base = `/api/support/customers/${customerId}/advice`;
  const storageKey = `turas-support-advice:${session.membership.id}:${customerId}:${workloadId}:${audience}`;
  async function post<T>(url: string, input: unknown): Promise<T> {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Support request unavailable");
    return body.data;
  }
  async function refresh(id: string) {
    try {
      const response = await fetch(`${base}?attemptId=${id}`, { cache: "no-store" }), body = await response.json();
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Current advice status unavailable");
      if (alive.current) { setStatus(body.data); setWithheld(false); }
    } catch (error) { if (alive.current) { setStatus(null); setWithheld(true); setNotice(error instanceof Error ? error.message : "Advice withheld"); } }
  }
  useEffect(() => {
    alive.current = true;
    const stored = sessionStorage.getItem(storageKey), raw = sessionStorage.getItem(`${storageKey}:pending`);
    if (stored && z.uuid().safeParse(stored).success) { savedId.current = stored; void refresh(stored); }
    if (raw) try { const value = JSON.parse(raw); pending.current = { chatKey: z.uuid().parse(value.chatKey), input: supportAdviceRequestSchema.parse(value.input) }; }
    catch { sessionStorage.removeItem(`${storageKey}:pending`); }
    const timer = window.setInterval(() => { if (savedId.current) void refresh(savedId.current); }, 5000);
    const focus = () => { if (savedId.current) void refresh(savedId.current); };
    const hide = () => { if (document.visibilityState === "hidden") setWithheld(true); else focus(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", hide);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", hide); };
  }, [storageKey]);
  async function start(recover = false) {
    if (active.current) return; active.current = true; setBusy(true); setNotice("");
    try {
      if (!recover) {
        pending.current = { chatKey: crypto.randomUUID(), input: { requestKey: crypto.randomUUID(), conversationId: crypto.randomUUID(),
          workloadId, audience, selectedEngagementIds: engagements, sourceRefs: sources } };
        sessionStorage.setItem(`${storageKey}:pending`, JSON.stringify(pending.current));
      }
      if (!pending.current) throw new Error("No retained preparation identity");
      const chat = await post<{ id: string }>("/api/conversations", { requestKey: pending.current.chatKey, customerId, title: "Support guidance" });
      pending.current.input.conversationId = chat.id;
      sessionStorage.setItem(`${storageKey}:pending`, JSON.stringify(pending.current));
      const reserved = await post<Prepared>(base, pending.current.input);
      savedId.current = reserved.attemptId; sessionStorage.setItem(storageKey, reserved.attemptId);
      await refresh(reserved.attemptId);
      if (recover) { setNotice("Preparation reconciled. No model request was sent again."); return; }
      const bound = await fetch("/eve/v1/session", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken,
        "x-turas-conversation-id": reserved.conversationId }, body: JSON.stringify({ operationId: reserved.operationId }) });
      const binding = await bound.json(); if (!bound.ok || !binding.sessionId) throw new Error("Native binding unconfirmed; check saved status");
      const response = await fetch(`/eve/v1/session/${binding.sessionId}`, { method: "POST", headers: { "content-type": "application/json",
        "x-csrf-token": session.csrfToken, "x-turas-conversation-id": reserved.conversationId, "x-turas-request-key": reserved.nativeRequestId },
      body: JSON.stringify({ message: supportAdvicePrompt }) });
      await response.body?.cancel(); if (!response.ok) throw new Error("Dispatch unconfirmed. This request will not be resent automatically.");
      setNotice("Turi is reviewing the bound accepted inputs.");
    } catch (error) { setWithheld(true); setNotice(error instanceof Error ? error.message : "Request unconfirmed; reconcile before sending"); }
    finally { active.current = false; setBusy(false); if (savedId.current) void refresh(savedId.current); }
  }
  async function stop() {
    if (!status?.nativeSessionId || !status.nativeTurnId || active.current) return;
    setWithheld(true); setBusy(true);
    try {
      const response = await fetch(`/eve/v1/session/${status.nativeSessionId}/cancel`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ turnId: status.nativeTurnId }) });
      await response.body?.cancel(); setNotice(response.ok ? "Stop recorded. Late output remains withheld." : "Stop acknowledgement unconfirmed; check status.");
    } finally { setBusy(false); if (savedId.current) void refresh(savedId.current); }
  }
  async function save(index: number) {
    if (!status?.output || !status.outputDigest || active.current || sessionStorage.getItem(`${storageKey}:save`)) return;
    active.current = true; setBusy(true);
    try {
      const requestKey = crypto.randomUUID();
      sessionStorage.setItem(`${storageKey}:save`, requestKey);
      await post(`/api/support/customers/${customerId}/commands`, { contractVersion: "support-v1", operation: "save_suggestion", requestKey,
        workloadId, expectedVersion: 0, attemptId: status.attemptId, outputDigest: status.outputDigest, suggestionIndex: index,
        content: status.output.actionSuggestions[index]!.content });
      sessionStorage.removeItem(`${storageKey}:save`); setNotice("Suggested action saved as a proposal. Accepted guidance is unchanged."); onSaved();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Save unconfirmed; check its receipt before another save"); }
    finally { active.current = false; setBusy(false); }
  }
  async function reconcileSave() {
    const key = sessionStorage.getItem(`${storageKey}:save`); if (!key || active.current) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/support/receipts/${key}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Save remains unconfirmed; do not resubmit");
      sessionStorage.removeItem(`${storageKey}:save`); setNotice("Suggestion save confirmed. Accepted guidance is unchanged."); onSaved();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Save remains unconfirmed"); }
    finally { setBusy(false); }
  }
  return <section className="profile-section" aria-labelledby="support-advice-heading"><h2 id="support-advice-heading">Explain with Turi</h2>
    <p>Private on-demand guidance using this audience and explicitly selected evidence. No external message, ticket or approval is performed.</p>
    {!savedId.current && <button className="primary-button" disabled={busy} onClick={() => void start()}>Ask Turi for Support Guidance</button>}
    {pending.current && <button className="secondary-button" disabled={busy} onClick={() => void start(true)}>Reconcile Preparation</button>}
    {savedId.current && <button className="secondary-button" disabled={busy} onClick={() => void refresh(savedId.current!)}>Check Advice Status</button>}
    <button className="secondary-button" disabled={busy} onClick={() => void reconcileSave()}>Check Suggestion Save Status</button>
    {status && <p>Advice State: {status.state}</p>}
    {status?.state === "running" && <button className="secondary-button" disabled={busy || !status.nativeSessionId || !status.nativeTurnId} onClick={() => void stop()}>Stop Support Guidance</button>}
    {withheld && <p role="status">Advice content is withheld until current status is verified.</p>}
    {status?.outputReadable && status.output && !withheld && <article className="profile-card"><h3>Proposed Guidance</h3><p>{status.output.summary}</p>
      {status.output.facts.map((fact, index) => <p key={index}>{fact.statement} · {fact.citationKeys.length} exact evidence references</p>)}
      <h4>Unknowns</h4>{status.output.unknowns.map((unknown, index) => <p key={index}>{unknown}</p>)}
      {status.output.actionSuggestions.map((suggestion, index) => <article key={index}><h4>{suggestion.content.title}</h4><p>{suggestion.content.desiredOutcome}</p>
        <p>{suggestion.content.rationale}</p><p>Validation: {suggestion.content.validationCriterion}</p><p>Next Review: {suggestion.content.nextReviewDate}</p>
        <button className="secondary-button" disabled={busy || !!sessionStorage.getItem(`${storageKey}:save`)} onClick={() => void save(index)}>Save Suggestion {index + 1} as Proposal</button></article>)}</article>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
