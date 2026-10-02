"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Customer = { id: string; displayName: string; synthetic: boolean };
type Result = { data?: { items: Customer[]; nextCursor: string | null }; error?: { message: string } };

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  async function load(cursor?: string) {
    setState("loading");
    try {
      const url = new URL("/api/customers", window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json() as Result;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Unavailable");
      setItems((current) => cursor ? [...current, ...payload.data!.items] : payload.data!.items);
      setNextCursor(payload.data.nextCursor);
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="profile-page customer-directory">
      <header className="directory-header"><h1>Customers</h1>
      <p className="muted">Customer profiles and reviewed evidence. Customer references in this demo are synthetic.</p></header>
      {state === "loading" && <p role="status">Loading customers…</p>}
      {state === "unavailable" && <p role="alert">Customers are unavailable. <button onClick={() => void load()}>Retry</button></p>}
      {state === "ready" && items.length === 0 && <p>No customers are assigned to this account.</p>}
      <ul className="customer-grid">{items.map((item) => (
        <li className="customer-card" key={item.id}>
          <h2><button className="customer-select" type="button" onClick={() => setSelected(item)} aria-pressed={selected?.id === item.id}>
            {item.displayName}{item.synthetic ? " · Synthetic" : ""}
          </button></h2>
          <p className="muted">Profile, evidence and delivery</p>
          <div className="customer-card-actions"><Link href={`/customers/${item.id}`}>Open profile <span aria-hidden="true">→</span></Link>
          <Link href={`/s?customerId=${item.id}`}>Start chat</Link></div>
        </li>
      ))}</ul>
      {nextCursor && <button className="secondary-button" type="button" onClick={() => void load(nextCursor)}>Load more</button>}
      {selected && <p role="status">Selected customer: {selected.displayName}{" "}
        <Link href={`/customers/${selected.id}`}>Open profile</Link>{" · "}
        <Link href={`/s?customerId=${selected.id}`}>Start chat</Link></p>}
    </main>
  );
}
