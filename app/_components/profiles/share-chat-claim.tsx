"use client";

import { useEffect, useRef, useState } from "react";

type OwnMessage = { id: string; text: string; createdAt: string };

export function ShareChatClaim({ conversationId, customerId, csrfToken }: {
  conversationId: string; customerId: string; csrfToken: string;
}) {
  const [messages, setMessages] = useState<OwnMessage[]>([]);
  const [selected, setSelected] = useState<OwnMessage | null>(null);
  const [span, setSpan] = useState("");
  const [claim, setClaim] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<"internal" | "partner" | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/conversations/${conversationId}`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
    ]).then(async ([detailResponse, authResponse]) => {
      if (!detailResponse.ok || !authResponse.ok) throw new Error("Unavailable");
      const detail = await detailResponse.json() as { data?: { submittedMessages?: OwnMessage[] } };
      const auth = await authResponse.json() as { data?: { membership: { kind: "internal" | "partner" } } };
      setMessages(detail.data?.submittedMessages ?? []);
      setKind(auth.data?.membership.kind ?? null);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Owned message history is unavailable.");
    });
    return () => controller.abort();
  }, [conversationId]);
  function choose(message: OwnMessage) {
    setSelected(message); setSpan(""); setClaim(""); setRequestKey(null); setSaved(false); setStatus("");
  }
  function selectSpan() {
    const field = sourceRef.current;
    if (!field || !selected) return;
    const exact = selected.text.slice(field.selectionStart, field.selectionEnd);
    if (!exact.trim() || exact.length > 8_000) {
      setStatus("Select a non-empty span of at most 8,000 characters."); return;
    }
    setSpan(exact); setClaim(exact); setRequestKey(null); setStatus("");
  }
  async function submit() {
    if (!selected || !span || !claim.trim() || !kind) return;
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key); setStatus("Saving a Pending claim…");
    try {
      const bytes = new TextEncoder().encode(span);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ requestKey: key, action: "propose_record", workloadId: null,
          payload: { kind: "claim", text: claim.trim(), sourceType: "manual",
            sourceMessageId: selected.id, sourceExcerpt: span, sourceSpanDigest: digest },
          requestedAudience: kind === "partner" ? "delivery" : "internal",
          dataCategory: kind === "partner" ? "delivery_context" : "other_internal" }) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setRequestKey(null);
        setStatus(result.error?.message ?? "Claim was not saved."); return;
      }
      setRequestKey(null); setSaved(true);
      setStatus("Claim saved as Pending. Only the selected span and edited claim were submitted for review.");
    } catch { setStatus("The result is uncertain. Retry the exact claim with its retained key."); }
  }
  return <section className="profile-section profile-chat-share" aria-labelledby="share-claim-heading">
    <h2 id="share-claim-heading">Submit a message claim for review</h2>
    <p className="muted">Select an exact span from one of your messages. You can edit the proposed claim before submitting. The rest of the conversation stays private.</p>
    {messages.length === 0 && <p>No owned messages are available to share.</p>}
    {messages.length > 0 && <label>Message<select className="field" value={selected?.id ?? ""}
      onChange={(event) => { const message = messages.find((item) => item.id === event.target.value);
        if (message) choose(message); else setSelected(null); }}>
      <option value="">Choose a message</option>
      {messages.map((message) => <option key={message.id} value={message.id}>{new Date(message.createdAt).toLocaleString()} · {message.text.slice(0, 80)}</option>)}
    </select></label>}
    {selected && <><label>Original private message<textarea ref={sourceRef} className="field" readOnly
      rows={4} value={selected.text} /></label>
      <button type="button" className="secondary-button" onClick={selectSpan}>Use selected text</button>
      {span && <><p><strong>Exact selected span:</strong> {span}</p>
        <label>Claim to submit<textarea className="field" rows={3} maxLength={8_000}
          value={claim} disabled={Boolean(requestKey) || saved} onChange={(event) => setClaim(event.target.value)} /></label>
        <p className="muted">Customer: {customerId}. Status after submission: Pending review.</p>
        <button type="button" className="primary-button" disabled={!claim.trim() || !csrfToken || saved}
          onClick={() => void submit()}>{requestKey ? "Retry exact claim" : "Submit Pending claim"}</button></>}
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
