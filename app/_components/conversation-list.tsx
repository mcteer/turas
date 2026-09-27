"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Conversation = { id: string; title: string; customerId: string };

export function ConversationList({ customerId }: { customerId?: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (query.trim()) params.set("title", query.trim().slice(0, 100));
        if (customerId) params.set("customerId", customerId);
        const response = await fetch(`/api/conversations?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const body = await response.json() as { data: { items: Conversation[] } };
        if (active) { setItems(body.data.items); setState("ready"); }
      } catch { if (active) setState("unavailable"); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, customerId]);
  return <>
    <label className="nav-section" htmlFor="chat-search">Recent conversations</label>
    <input className="field" id="chat-search" aria-label="Search chat titles" placeholder="Search chats"
      value={query} onChange={(event) => { setQuery(event.target.value); setState("loading"); }} maxLength={100} />
    <div className="nav-history" aria-live="polite">
      {state === "loading" && <p className="history-empty">Loading chats…</p>}
      {state === "unavailable" && <p className="history-empty">Chats are unavailable.</p>}
      {state === "ready" && items.length === 0 && <p className="history-empty">{query ? "No matching chats." : "No chats yet."}</p>}
      {state === "ready" && items.map((item) => <Link className="history-link" key={item.id}
        href={`/s/${item.id}`} title={item.title}>{item.title}</Link>)}
    </div>
  </>;
}
