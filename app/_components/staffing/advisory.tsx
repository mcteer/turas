"use client";
import { useEffect, useRef, useState } from "react";
import { useEveAgent } from "eve/react";
import type { readDemand } from "../../../lib/server/staffing/demands";
import type { readStaffingAdvisoryStatus } from "../../../lib/server/staffing/advisory-status";
import { staffingGet } from "./client";
type Demand = Awaited<ReturnType<typeof readDemand>>;
type Status = Awaited<ReturnType<typeof readStaffingAdvisoryStatus>>;
type Prepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
type Scenario = { scenarioId: string; baselineId: string; fromDate: string; toDate: string };
const terminal = new Set(["completed", "failed", "cancelled", "expired", "unconfirmed"]);
class AdvisoryRequestFailure extends Error { constructor(message: string, readonly status: number) { super(message); } }

export function StaffingAdvisory({ demand, csrfToken, financeAllowed = false }: {
  demand: Demand; csrfToken: string; financeAllowed?: boolean }) {
  const [instructions, setInstructions] = useState("Explain the reviewed staffing options, hard constraints, missing information and tradeoffs. Use exact returned values and citations. Leave staffing and finance decisions for human review.");
  const [mode, setMode] = useState<"operational" | "finance">("operational"), [scenarioId, setScenarioId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null), [status, setStatus] = useState<Status | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [readFailed, setReadFailed] = useState(false), [uncertainPreparation, setUncertainPreparation] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null), readGeneration = useRef(0), alive = useRef(true);
  const storageKey = `turas-staffing-advice-${demand.demandId}`;
  const qualified = demand.state === "qualified" && !demand.reviewRequired && demand.contentAvailability === "readable";

  async function refresh(id: string) {
    const ticket = ++readGeneration.current;
    try {
      const current = await staffingGet<Status>(`/api/staffing/advisory/${id}`);
      if (!alive.current || ticket !== readGeneration.current) return;
      setStatus(current); setRecoveryId(null); setReadFailed(false);
      sessionStorage.setItem(storageKey, id);
    } catch {
      if (alive.current && ticket === readGeneration.current) {
        setReadFailed(true); setNotice("Current authority or status is unavailable. Check status before continuing.");
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    const id = sessionStorage.getItem(storageKey);
    if (id) { setRecoveryId(id); void refresh(id); }
    return () => { alive.current = false; readGeneration.current++; };
  }, [storageKey]);
  useEffect(() => {
    if (!status?.attemptId && !prepared?.attemptId) return;
    const id = status?.attemptId ?? prepared!.attemptId;
    const timer = setInterval(() => { void refresh(id); }, 5_000);
    return () => clearInterval(timer);
  }, [status?.attemptId, prepared?.attemptId]);
  async function loadScenarios(next?: string) {
    try {
      const page = await staffingGet<{ items: Scenario[]; nextCursor: string | null }>(`/api/staffing/finance/scenarios?customerId=${demand.customerId}&engagementId=${demand.engagementId}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      if (!alive.current) return;
      const current = page.items.filter(item => item.baselineId === demand.baselineId);
      setScenarios(old => next ? [...old, ...current] : current); setCursor(page.nextCursor);
    } catch { if (alive.current) { setScenarios([]); setScenarioId(""); setNotice("Planning scenario choices are unavailable."); } }
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(body) });
    const envelope = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok || !envelope.data) throw new AdvisoryRequestFailure(envelope.error?.message ?? "Explanation is unavailable", response.status);
    return envelope.data;
  }
  async function dispatch(reserved: Prepared, text: string) {
    const checked = await staffingGet<Status>(`/api/staffing/advisory/${reserved.attemptId}`);
    if (checked.state !== "prepared" || checked.responseAttemptId) {
      setStatus(checked); throw new Error("This attempt already has a dispatch outcome. Check its saved status.");
    }
    const bound = await fetch("/eve/v1/session", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken,
      "x-turas-conversation-id": reserved.conversationId }, body: JSON.stringify({ operationId: reserved.operationId }) });
    const binding = await bound.json() as { sessionId?: string };
    if (!bound.ok || !binding.sessionId) throw new Error("Session binding is pending. No explanation was sent.");
    // Exactly one explicit POST. An ambiguous response is never retried here.
    const sent = await fetch(`/eve/v1/session/${binding.sessionId}`, { method: "POST", headers: { "content-type": "application/json",
      "x-csrf-token": csrfToken, "x-turas-conversation-id": reserved.conversationId, "x-turas-request-key": reserved.nativeRequestId },
      body: JSON.stringify({ message: text }) });
    if (!sent.ok) throw new Error("Dispatch is not confirmed. Check the saved status; the request was not resent.");
    setNotice("Turi is explaining the governed inputs. Human review is required for decisions.");
  }
  async function start(reconcile = false) {
    if (busy || !csrfToken || !qualified) return;
    if (!reconcile) pending.current = { requestKey: crypto.randomUUID(), customerId: demand.customerId, demandId: demand.demandId,
      revisionId: demand.revisionId, contentDigest: demand.contentDigest, expectedAggregateVersion: demand.aggregateVersion,
      mode, scenarioId: mode === "finance" ? scenarioId || null : null, instructions: instructions.replace(/\r\n?/g, "\n").normalize("NFC").trim() };
    if (!pending.current) return;
    setBusy(true); setNotice("");
    let reserved: Prepared | null = null;
    try {
      reserved = await post<Prepared>("/api/staffing/advisory", pending.current);
      if (!alive.current) return;
      setPrepared(reserved); setUncertainPreparation(false); sessionStorage.setItem(storageKey, reserved.attemptId);
      // Checking an uncertain preparation never also dispatches a paid turn.
      if (!reconcile) await dispatch(reserved, String(pending.current.instructions));
    } catch (error) {
      if (alive.current) {
        if (!reserved) setUncertainPreparation(!(error instanceof AdvisoryRequestFailure && [401, 403, 404, 413, 422, 429].includes(error.status)));
        setNotice(error instanceof Error ? error.message : "Explanation unavailable");
      }
    } finally { if (alive.current) { setBusy(false); if (reserved) void refresh(reserved.attemptId); } }
  }
  async function cancel() {
    const id = status?.attemptId ?? prepared?.attemptId;
    if (!id || busy) return;
    setBusy(true); setReadFailed(true); setStopRequested(true);
    try {
      const stopped = await post<Status>(`/api/staffing/advisory/${id}/cancel`, {});
      if (!alive.current) return;
      setStatus(stopped); setNotice("Stop recorded. Later output is suppressed; native cancellation is being confirmed.");
      if (stopped.nativeSessionId && stopped.nativeTurnId && stopped.responseState === "stopping") {
        const response = await fetch(`/eve/v1/session/${stopped.nativeSessionId}/cancel`, { method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ turnId: stopped.nativeTurnId }) });
        if (!response.ok) setNotice("Stop is durable. Native cancellation is unconfirmed; no explanation was resent.");
      }
    } catch { if (alive.current) setNotice("Stop acknowledgement is unavailable. Check the saved status; no request was resent."); }
    finally { if (alive.current) { setBusy(false); void refresh(id); } }
  }
  const bindingChanged = status && (status.revisionId !== demand.revisionId || !qualified);
  return <section className="profile-section" aria-label="Turi staffing explanation"><h2>Explain With Turi</h2>
    <p>Review the deterministic comparison and planning results alongside this explanation. Turi cannot confirm staffing or change finance inputs.</p>
    {!qualified && <p role="status">A current qualified demand is required.</p>}
    {!status && !prepared && !recoveryId && !uncertainPreparation && <fieldset disabled={busy || !qualified}><legend>Explanation Scope</legend>
      <label>Explanation mode<select className="field" aria-label="Explanation mode" value={mode} onChange={event => {
        const next = event.target.value as "operational" | "finance"; setMode(next); setScenarioId("");
        if (next === "finance") void loadScenarios();
      }}><option value="operational">Operational staffing</option>{financeAllowed && <option value="finance">Finance planning</option>}</select></label>
      {mode === "finance" && <><label>Fixed planning scenario<select className="field" aria-label="Fixed planning scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
        <option value="">Choose an existing planning scenario</option>{scenarios.map(item => <option key={item.scenarioId} value={item.scenarioId}>{item.fromDate} to {item.toDate} · {item.scenarioId}</option>)}</select></label>
        {cursor && <button type="button" onClick={() => void loadScenarios(cursor)}>More planning scenarios</button>}</>}
      <label>Explanation request<textarea className="field" value={instructions} maxLength={8000} onChange={event => setInstructions(event.target.value)} /></label>
      <button type="button" className="primary-button" disabled={!csrfToken || !instructions.trim() || mode === "finance" && !scenarioId}
        onClick={() => void start()}>Ask Turi to explain</button></fieldset>}
    {uncertainPreparation && <button type="button" disabled={busy} onClick={() => void start(true)}>Check preparation</button>}
    {(status || prepared || recoveryId) && <div className="profile-card">
      <p role="status">{status?.state ?? "Checking saved status"}{status?.fenced || bindingChanged ? " · Current authority or inputs are unavailable; output is withheld" : ""}</p>
      {status && <><p>{status.mode === "finance" ? "Finance planning" : "Operational staffing"} · {status.stepsAdmitted}/6 steps · {status.readCalls}/6 reads</p>
        <p>Reported input tokens: {status.inputTokens ?? "Unknown"}. Reported output tokens: {status.outputTokens ?? "Unknown"}.</p></>}
      <button type="button" disabled={busy} onClick={() => void refresh(status?.attemptId ?? prepared?.attemptId ?? recoveryId!)}>Check saved status</button>
      {status?.state === "prepared" && !status.responseAttemptId && prepared && pending.current && <button type="button" disabled={busy || !qualified} onClick={() => {
        setBusy(true); void dispatch(prepared, String(pending.current!.instructions)).catch(error => setNotice(error instanceof Error ? error.message : "Dispatch unavailable"))
          .finally(() => { if (alive.current) { setBusy(false); void refresh(prepared.attemptId); } });
      }}>Send prepared explanation</button>}
      {(!status || !terminal.has(status.state)) && <button type="button" disabled={busy} onClick={() => void cancel()}>Stop explanation</button>}
      {status && terminal.has(status.state) && <button type="button" disabled={busy} onClick={() => {
        readGeneration.current++; sessionStorage.removeItem(storageKey); setStatus(null); setPrepared(null); setRecoveryId(null);
        pending.current = null; setStopRequested(false); setReadFailed(false); setUncertainPreparation(false); setNotice("");
      }}>Start another explanation</button>}
      {status?.outputReadable && status.nativeSessionId && !status.fenced && !bindingChanged && !readFailed && !stopRequested && <StaffingNativeOutput key={status.attemptId}
        nativeSessionId={status.nativeSessionId} conversationId={status.conversationId} csrfToken={csrfToken}
        refresh={() => void refresh(status.attemptId)} unavailable={() => { setReadFailed(true); setNotice("The output stream is unavailable. Check current status."); }} />}
    </div>}
    {notice && <p role="status" className="profile-note">{notice}</p>}
  </section>;
}
function StaffingNativeOutput({ nativeSessionId, conversationId, csrfToken, refresh, unavailable }: {
  nativeSessionId: string; conversationId: string; csrfToken: string; refresh: () => void; unavailable: () => void }) {
  const agent = useEveAgent({ initialSession: { sessionId: nativeSessionId, streamIndex: 0 }, resume: true,
    headers: () => ({ "x-csrf-token": csrfToken, "x-turas-conversation-id": conversationId }), onError: unavailable,
    onEvent(event) { if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) refresh(); } });
  if (agent.error) return <p role="status">Output is unavailable. Check the saved status.</p>;
  return <div className="chat-messages" aria-live="polite">{agent.data.messages.filter(message => message.role === "assistant").map(message =>
    <article className="chat-message" key={message.id}><h3>Turi</h3>{message.parts.map((part, index) => part.type === "text" ? <p key={index}>{part.text}</p> : null)}</article>)}</div>;
}
