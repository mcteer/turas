"use client";

import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DemoDataNotice } from "./demo-data-notice";
import { ChatStatus } from "./chat-status";
import { ShareChatClaim } from "./profiles/share-chat-claim";
import { ComposerAttachments } from "./attachments/composer-attachments";
import type { DraftSourceSelection } from "./attachments/source-viewer";
import { ResearchPanel } from "./research/research-panel";

export function AgentChat({ conversationId, nativeSessionId, bindingState,
  customerName, synthetic, csrfToken, customerId, contextStatus }: {
  conversationId: string; nativeSessionId: string | null; bindingState: string;
  customerName: string; synthetic: boolean; csrfToken: string;
  customerId: string; contextStatus: "current" | "changed" | "historical";
}) {
  if (contextStatus !== "current") return <HistoricalChat conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  if (!nativeSessionId || bindingState !== "bound") {
    return <main className="chat-page">
      <h1>{customerName}</h1><p role="status">Chat binding is {bindingState}. Reload to check again.</p>
    </main>;
  }
  return <BoundChat key={conversationId} conversationId={conversationId}
    nativeSessionId={nativeSessionId} customerName={customerName}
    synthetic={synthetic} csrfToken={csrfToken} customerId={customerId} />;
}

function HistoricalChat({ conversationId, customerId, customerName }: {
  conversationId: string; customerId: string; customerName: string;
}) {
  const [messages, setMessages] = useState<{ eventId: string; payload: { message?: string } }[]>([]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data: { history: typeof messages } };
      if (active) setMessages(result.data.history);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [conversationId]);
  return <main className="chat-page"><h1 className="chat-heading">{customerName}</h1>
    <p role="status" className="chat-notice">Customer context has changed. Start a new conversation to use current information.</p>
    <div className="chat-messages">{messages.map((event) => <article className="chat-message" key={event.eventId}>
      <h2>You</h2><p>{event.payload.message}</p></article>)}</div>
    <p><Link className="primary-button" href={`/s?customerId=${encodeURIComponent(customerId)}`}>Start a new conversation</Link></p>
  </main>;
}

function BoundChat({ conversationId, nativeSessionId, customerName, synthetic, csrfToken, customerId }: {
  conversationId: string; nativeSessionId: string; customerName: string;
  synthetic: boolean; csrfToken: string; customerId: string;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [stale, setStale] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [draftSelections, setDraftSelections] = useState<DraftSourceSelection[]>([]);
  const [selectionResetVersion, setSelectionResetVersion] = useState(0);
  const pendingSelections = useRef<DraftSourceSelection[] | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<string>();
  const [responseState, setResponseState] = useState<string>();
  const keyRef = useRef<string | null>(null);
  const agent = useEveAgent({
    initialSession: { sessionId: nativeSessionId, streamIndex: 0 },
    resume: true,
    headers: () => ({ "x-csrf-token": csrfToken,
      "x-turas-conversation-id": conversationId }),
    onEvent(event) {
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) {
        setResponseState(event.type === "turn.completed" ? "completed"
          : event.type === "turn.failed" ? "failed" : "cancelled");
        setStopping(false);
        setPendingKey(null);
        keyRef.current = null;
        pendingSelections.current = null;
      }
    },
  });

  useEffect(() => {
    let active = true;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 404) {
          if (active) setDenied(true);
          return;
        }
        if (!response.ok) throw new Error();
        const detail = await response.json() as { data: { contextStatus?: string; attempts: Array<{
          requestKey: string; dispatchState: string; responseState: string;
          watchdogState: string | null;
        }> } };
        if (!active) return;
        if (detail.data.contextStatus !== "current") {
          agent.reset(); setStale(true); return;
        }
        const outstanding = [...detail.data.attempts].reverse().find((attempt) =>
          ["pending", "running", "stopping"].includes(attempt.responseState));
        if (outstanding) {
          keyRef.current = outstanding.requestKey;
          setPendingKey(outstanding.requestKey);
          setDispatchState(outstanding.dispatchState);
          setResponseState(outstanding.responseState);
          setNotice(outstanding.watchdogState === "needs_attention"
            ? "The response could not be confirmed after the deadline. An operator must review this turn before another message is sent."
            : outstanding.dispatchState === "uncertain"
            ? "Dispatch outcome is being reconciled. The message was not sent again."
            : outstanding.dispatchState === "prepared"
              ? "Message was prepared but not dispatched. Re-enter the exact text to retry with its original key."
              : "Restored an active response. Waiting for its terminal status…");
        } else {
          const latest = detail.data.attempts.at(-1);
          if (latest && ["completed", "cancelled", "failed"].includes(latest.responseState)) {
            setResponseState(latest.responseState);
          }
        }
      }).catch(() => { if (active) setNotice("History status is unavailable. Reload to check again."); });
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
        if (response.status === 401 || response.status === 404) {
          agent.reset();
          setDenied(true);
        } else if (response.ok) {
          const detail = await response.json() as { data: { contextStatus?: string } };
          if (detail.data.contextStatus !== "current") {
            agent.reset(); setStale(true);
          }
        }
      } catch { /* live stream guard also closes on authority failure */ }
    };
    const timer = setInterval(() => { void check(); }, 2_000);
    return () => clearInterval(timer);
  }, [agent, conversationId]);

  useEffect(() => {
    if (!pendingKey || denied) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/attempts/${pendingKey}`,
          { cache: "no-store" });
        if (response.status === 401 || response.status === 404) {
          if (active) { agent.reset(); setDenied(true); }
          return;
        }
        if (!response.ok) throw new Error();
        const result = await response.json() as { data: { dispatchState: string;
          responseState: string; watchdogState: string | null } };
        if (!active) return;
        setDispatchState(result.data.dispatchState);
        setResponseState(result.data.responseState);
        if (result.data.watchdogState === "needs_attention") {
          setNotice("The response could not be confirmed after the deadline. An operator must review this turn before another message is sent.");
        } else if (result.data.dispatchState === "uncertain") {
          setNotice("Dispatch outcome is being reconciled. The message was not sent again.");
        } else if (["completed", "cancelled", "failed"].includes(result.data.responseState)) {
          setPendingKey(null);
          keyRef.current = null;
          setStopping(false);
        }
      } catch { if (active) setNotice("Status is unavailable. The message was not sent again."); }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [agent, conversationId, denied, pendingKey]);

  async function send(retryPrepared = false) {
    const selections = retryPrepared ? pendingSelections.current ?? [] : draftSelections;
    const text = draft.trim() || (selections.length ? "Please discuss the selected customer source passages." : "");
    if (!text.trim() || denied || (pendingKey && !(retryPrepared && dispatchState === "prepared")) ||
        agent.status !== "ready") return;
    const key = keyRef.current ?? crypto.randomUUID();
    keyRef.current = key;
    if (!retryPrepared) pendingSelections.current = selections;
    setPendingKey(key);
    setDispatchState("prepared");
    setResponseState("pending");
    setNotice("Submitting message…");
    try {
      await agent.send(text, { headers: { "x-turas-request-key": key,
        ...(selections.length ? { "x-turas-artifact-selections": btoa(JSON.stringify(selections)) } : {}) } });
      setDraft("");
      setDraftSelections([]);
      setSelectionResetVersion((value) => value + 1);
      setNotice("Message accepted. Waiting for the response…");
    } catch {
      setNotice("Dispatch outcome is being reconciled. The message was not sent again.");
    }
  }

  async function cancel() {
    setStopping(true);
    try { await agent.cancel(); setNotice("Stopping requested. Waiting for confirmation…"); }
    catch { setStopping(false); setNotice("Could not request a stop."); }
  }

  async function sendResearchTurn(turn: { message: string; requestKey: string }) {
    if (denied || stale || pendingKey || agent.status !== "ready") {
      throw new Error("The chat is busy. Check its status before starting research.");
    }
    keyRef.current = turn.requestKey;
    setPendingKey(turn.requestKey);
    setDispatchState("prepared");
    setResponseState("pending");
    setNotice("Submitting research turn…");
    try {
      await agent.send(turn.message,{ headers: { "x-turas-request-key": turn.requestKey } });
      setNotice("Research turn accepted. Waiting for the response…");
    } catch {
      setNotice("Research dispatch outcome is uncertain. The turn was not sent again.");
      throw new Error("Research dispatch outcome is uncertain. Check status before retrying.");
    }
  }

  if (denied) return <main className="chat-page">
    <h1>Chat unavailable</h1><p role="alert">Access to this customer or chat has changed.</p>
  </main>;
  if (stale) return <HistoricalChat conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  const busy = agent.status === "submitted" || agent.status === "streaming";
  return <main className="chat-page">
    <h1 className="chat-heading">{customerName}</h1>
    <p className="muted">Private conversation</p>
    <DemoDataNotice synthetic={synthetic} />
    <ResearchPanel customerId={customerId} conversationId={conversationId}
      csrfToken={csrfToken} busy={Boolean(pendingKey) || agent.status !== "ready"}
      onStart={sendResearchTurn} />
    <div className="chat-messages" aria-live="polite">
      {agent.data.messages.length === 0 && <p className="muted">No messages yet.</p>}
      {agent.data.messages.map((message) => <article className="chat-message" key={message.id}>
        <h2>{message.role === "assistant" ? "Turi" : "You"}</h2>
        {message.parts.map((part, index) => part.type === "text"
          ? <p key={index}>{part.text}</p> : null)}
      </article>)}
    </div>
    <button type="button" className="secondary-button" aria-expanded={shareOpen}
      onClick={() => setShareOpen((value) => !value)}>{shareOpen ? "Close claim submission" : "Submit a message claim for review"}</button>
    {shareOpen && <ShareChatClaim conversationId={conversationId} customerId={customerId}
      csrfToken={csrfToken} />}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <ComposerAttachments conversationId={conversationId} customerId={customerId}
        customerName={customerName} csrfToken={csrfToken}
        onDraftSelectionsChange={setDraftSelections} resetSelectionVersion={selectionResetVersion} />
      <label className="field-label" htmlFor="chat-message">Message</label>
      <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)}
        maxLength={16_384} disabled={busy || (Boolean(pendingKey) && dispatchState !== "prepared") || agent.status === "resuming" || stopping} />
      <div className="chat-actions"><button className="primary-button" type="submit" disabled={(!draft.trim() && !draftSelections.length) || busy || Boolean(pendingKey) || agent.status === "resuming" || stopping}>Send</button>
        {busy && <button className="secondary-button" type="button" disabled={stopping} onClick={() => void cancel()}>Stop</button>}</div>
    </form>
    {draft.trim() && !pendingKey && <p className="state-message" role="status">Draft not sent.</p>}
    <ChatStatus notice={notice} responseState={responseState} error={Boolean(agent.error)} />
    {pendingKey && dispatchState === "prepared" && !busy &&
      <button className="secondary-button" type="button" onClick={() => void send(true)}>
        Retry prepared message</button>}
    {pendingKey && <button type="button" onClick={() => {
      void fetch(`/api/conversations/${conversationId}/attempts/${pendingKey}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const status = await response.json() as { data: { dispatchState: string; responseState: string } };
          setResponseState(status.data.responseState);
          setNotice(`Dispatch: ${status.data.dispatchState}. Response: ${status.data.responseState}.`);
        }).catch(() => setNotice("Status is unavailable."));
    }}>Check status</button>}
  </main>;
}
