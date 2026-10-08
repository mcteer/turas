"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

type Conversation = { id: string; title: string; customerId: string | null };

export function ConversationList({ customerId, navigation, csrfToken }: { customerId?: string; navigation?: ReactNode; csrfToken: string }) {
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "25", archived: String(archived) });
        if (query.trim()) params.set("title", query.trim().slice(0, 100));
        if (customerId) params.set("customerId", customerId);
        const response = await fetch(`/api/conversations?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const body = await response.json() as { data: { items: Conversation[] } };
        if (active) { setItems(body.data.items); setState("ready"); }
      } catch { if (active) setState("unavailable"); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, customerId, archived, revision]);
  async function toggleArchive(id: string) {
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: {
        "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ archived: !archived }) });
      if (!response.ok) throw new Error();
      setItems(current => current.filter(item => item.id !== id));
      setRevision(current => current + 1);
    } catch { setError("Could not update this chat. Try again."); }
    finally { setBusy(null); }
  }
  return <>
    <input className="field nav-search" id={searchId} aria-label="Search chat titles" placeholder="Search Chats"
      value={query} onChange={(event) => { setQuery(event.target.value); setState("loading"); }} maxLength={100} />
    {navigation}
    <div className="history-heading"><p className="nav-section">{archived ? "Archived Conversations" : "Recent Conversations"}</p>
      <button type="button" className="history-view" onClick={() => { setArchived(!archived); setState("loading"); setError(""); }}>
        {archived ? "Recent" : "Archived"}</button></div>
    {error && <p className="history-empty" role="alert">{error}</p>}
    <div className="nav-history" aria-live="polite">
      {state === "loading" && <p className="history-empty">Loading chats…</p>}
      {state === "unavailable" && <p className="history-empty">Chats are unavailable.</p>}
      {state === "ready" && items.length === 0 && <p className="history-empty">{query ? "No matching chats." : archived ? "No archived chats." : "No chats yet."}</p>}
      {state === "ready" && items.map((item) => <div className="history-row" key={item.id}><Link className="history-link"
        href={`/s/${item.id}`} title={item.title}><svg aria-hidden="true" className="history-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg><span className="history-title">{item.title}</span></Link><button type="button" className="history-archive" disabled={busy !== null}
          aria-label={`${archived ? "Restore" : "Archive"} ${item.title}`} onClick={() => void toggleArchive(item.id)}>{archived ? "Restore" : "Archive"}</button></div>)}
    </div>
  </>;
}
