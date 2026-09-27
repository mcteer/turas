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
    <main style={{ maxWidth: 800, margin: "5vh auto", padding: 24 }}>
      <h1>Customers</h1>
      <p>Customer references in this demo are synthetic.</p>
      {state === "loading" && <p role="status">Loading customers…</p>}
      {state === "unavailable" && <p role="alert">Customers are unavailable. <button onClick={() => void load()}>Retry</button></p>}
      {state === "ready" && items.length === 0 && <p>No customers are assigned to this account.</p>}
      <ul>{items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => setSelected(item)} aria-pressed={selected?.id === item.id}>
            {item.displayName}{item.synthetic ? " · Synthetic" : ""}
          </button>
        </li>
      ))}</ul>
      {nextCursor && <button type="button" onClick={() => void load(nextCursor)}>Load more</button>}
      {selected && <p role="status">Selected customer: {selected.displayName}{" "}
        <Link href={`/s?customerId=${selected.id}`}>Start chat</Link></p>}
    </main>
  );
}
