"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

type Conversation = { id: string; title: string; customerId: string };

export function ConversationList({ customerId, navigation }: { customerId?: string; navigation?: ReactNode }) {
  const searchId = useId();
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
    <input className="field nav-search" id={searchId} aria-label="Search chat titles" placeholder="Search Chats"
      value={query} onChange={(event) => { setQuery(event.target.value); setState("loading"); }} maxLength={100} />
    {navigation}
    <p className="nav-section">Recent conversations</p>
    <div className="nav-history" aria-live="polite">
      {state === "loading" && <p className="history-empty">Loading chats…</p>}
      {state === "unavailable" && <p className="history-empty">Chats are unavailable.</p>}
      {state === "ready" && items.length === 0 && <p className="history-empty">{query ? "No matching chats." : "No chats yet."}</p>}
      {state === "ready" && items.map((item) => <Link className="history-link" key={item.id}
        href={`/s/${item.id}`} title={item.title}><svg aria-hidden="true" className="history-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg><span className="history-title">{item.title}</span></Link>)}
    </div>
  </>;
}
