"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState } from "../../_components/empty-state";

type Customer = { id: string; displayName: string; synthetic: boolean };
type Result = { data?: { items: Customer[]; nextCursor: string | null }; error?: { message: string } };

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const request = useRef<AbortController | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  async function load(cursor?: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    if (!cursor) { setItems([]); setNextCursor(null); }
    try {
      const url = new URL("/api/customers", window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      if (query.trim()) url.searchParams.set("query", query.trim());
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as Result;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Unavailable");
      if (controller.signal.aborted) return;
      setItems(current => cursor ? [...current, ...payload.data!.items] : payload.data!.items);
      setNextCursor(payload.data.nextCursor);
      setState("ready");
    } catch {
      if (!controller.signal.aborted) setState("unavailable");
    }
  }

  useEffect(() => {
    request.current?.abort();
    setItems([]); setNextCursor(null); setState("loading");
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [query]);

  return <main className="profile-page customer-directory">
    <header className="profile-header directory-header"><div><p className="profile-eyebrow">Workspace</p><h1>Customer Profiles</h1>
      <p className="muted">Customer knowledge, researched facts, and delivery in one place.</p></div></header>
    <div className="customer-directory-search"><label htmlFor="customer-search">Search Customers</label>
      <input className="field" id="customer-search" type="search" placeholder="Search by customer name" maxLength={200}
        value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {state === "loading" && <p role="status">Loading customers…</p>}
    {state === "unavailable" && <p role="alert">Customers are unavailable. <button onClick={() => void load()}>Retry</button></p>}
    {state === "ready" && items.length === 0 && <EmptyState icon="customers" title={query.trim() ? "No Matching Customers" : "No customers are assigned to this account."}>
      {query.trim() ? "Try another customer name." : "Assigned customer profiles will appear here."}</EmptyState>}
    <ul className="customer-grid">{items.map(item => <li className="customer-card" key={item.id}>
      <div className="customer-card-heading"><span className="customer-avatar" aria-hidden="true">{item.displayName.slice(0, 2).toUpperCase()}</span>
        <div><h2><Link className="customer-select" href={`/customers/${item.id}`}>{item.displayName}</Link></h2>
          <p className="muted">Customer workspace{item.synthetic ? " · Synthetic" : ""}</p></div></div>
      <p className="customer-card-description">Explore accepted context, researched facts, and delivery plans.</p>
      <div className="customer-card-actions"><Link className="secondary-button" href={`/s?customerId=${item.id}`}>Start Chat</Link></div>
    </li>)}</ul>
    {nextCursor && state === "ready" && <button className="secondary-button" type="button" onClick={() => void load(nextCursor)}>Load more</button>}
  </main>;
}
