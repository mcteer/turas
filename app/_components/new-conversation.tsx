"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerPicker, type CustomerChoice } from "./customer-picker";
import { DemoDataNotice } from "./demo-data-notice";

export function NewConversation({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "creating" | "unavailable">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/customers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { data: { items: CustomerChoice[] } };
      if (!active) return;
      setCustomers(body.data.items);
      const requested = search.get("customerId") ?? sessionStorage.getItem("turas-selected-customer");
      if (requested && body.data.items.some((customer) => customer.id === requested)) setSelected(requested);
      setState("ready");
    }).catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, [search]);

  async function start() {
    if (!selected || state === "creating") return;
    setState("creating");
    setError("");
    const operationId = crypto.randomUUID();
    try {
      const created = await fetch("/api/conversations", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ customerId: selected, requestKey: operationId }),
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
      router.push(`/s/${result.data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat is unavailable.");
      setState("ready");
    }
  }

  return <main className="chat-page"><div className="chat-center">
    <h1 className="chat-title">Turi</h1>
    <p className="chat-context">Choose a customer to start a private conversation.</p>
    <DemoDataNotice synthetic />
    {state === "loading" && <p role="status">Loading customers…</p>}
    {state === "unavailable" && <p role="alert">Customers are unavailable. Reload to try again.</p>}
    {state !== "loading" && state !== "unavailable" && <>
      {customers.length === 0 ? <p>No customers are assigned to this account.</p> : <>
        <div className="chat-composer"><CustomerPicker customers={customers} selected={selected}
          onSelect={(value) => { setSelected(value); sessionStorage.setItem("turas-selected-customer", value); }} disabled={state === "creating"} />
        <div className="chat-actions"><button className="primary-button" type="button" disabled={!selected || state === "creating"} onClick={() => void start()}>
          {state === "creating" ? "Starting…" : "Start chat"}
        </button></div></div>
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div></main>;
}
