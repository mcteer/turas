"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerPicker, type CustomerChoice } from "./customer-picker";


export function NewConversation({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "creating" | "unavailable">("loading");
  const [error, setError] = useState("");
  const starting = useRef(false);
  const operation = useRef<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/customers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { data: { items: CustomerChoice[] } };
      if (!active) return;
      setCustomers(body.data.items);
      const requested = search.get("customerId");
      if (requested && body.data.items.some((customer) => customer.id === requested)) setSelected(requested);
      if (!starting.current) setState("ready");
    }).catch(() => { if (active && !starting.current) setState("unavailable"); });
    return () => { active = false; };
  }, [search]);

  async function start(attachments = false) {
    if ((!draft.trim() && !attachments) || starting.current) return;
    if (attachments && !selected) { setError("Choose a customer below to attach customer documents."); document.getElementById("chat-customer")?.focus(); return; }
    starting.current = true;
    setState("creating");
    setError("");
    const operationId = operation.current ?? crypto.randomUUID();
    operation.current = operationId;
    try {
      const created = await fetch("/api/conversations", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ customerId: selected || null, requestKey: operationId }),
      });
      if (!created.ok) throw new Error(created.status === 404 ? "Customer access changed." : "Could not create chat.");
      const result = await created.json() as { data: { id: string } };
      let bound = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const native = await fetch("/eve/v1/session", {
          method: "POST", headers: { "content-type": "application/json",
            "x-csrf-token": csrfToken, "x-turas-conversation-id": result.data.id },
          body: JSON.stringify({ operationId }),
        });
        if (native.ok) { bound = true; break; }
        const body = await native.json() as { code?: string };
        if (native.status !== 409 || body.code !== "turas_binding_pending") break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!bound) throw new Error("Chat binding is pending. Reload the chat list to retry.");
      if (draft.trim()) sessionStorage.setItem(`turas-chat-draft:${result.data.id}`, JSON.stringify({ text: draft.trim(), requestKey: crypto.randomUUID() }));
      router.push(`/s/${result.data.id}${attachments ? "?attachments=1" : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat is unavailable.");
      starting.current = false;
      setState("ready");
    }
  }

  return <main className="chat-page chat-landing"><div className="chat-center">
    <h1 className="chat-title">Turi</h1>
    <div className="landing-input">
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <textarea aria-label="Message Turi" placeholder="Message Turi…" value={draft}
          maxLength={16_384} disabled={state === "creating"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void start(); } }} />
        <div className="chat-actions">
          <button className="composer-attach" type="button" aria-label="Attach documents" disabled={state === "creating"} onClick={() => void start(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" /></svg>
          </button>
          <button className="composer-send" type="submit" aria-label="Send message" disabled={!draft.trim() || state === "creating"}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
          </button>
        </div>
      </form>
      <div className="optional-customer"><CustomerPicker customers={customers} selected={selected}
        onSelect={(value) => { setSelected(value); operation.current = null; }} disabled={state === "creating" || state === "loading"} optional /></div>
      {state === "unavailable" && <p className="state-message" role="status">Customer selection is unavailable. You can still ask a general question.</p>}
      {state === "creating" && <p className="state-message" role="status">Starting chat…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </div></main>;
}
