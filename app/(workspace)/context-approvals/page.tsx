"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Queue = { total: number; items: { id: string; customerId: string;
  customerName: string; recordId: string; kind: string; title: string | null;
  state: string; createdAt: string }[]; nextOffset: number | null };

export default function ContextApprovalsPage() {
  const [queue, setQueue] = useState<Queue>();
  const [denied, setDenied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setQueue(undefined); setError("");
    void fetch(`/api/context-approvals?includeDenied=${denied}&offset=${offset}`,
      { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Review queue unavailable");
      if (!controller.signal.aborted) setQueue(result.data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [denied, offset]);
  return <main className="profile-page">
    <header className="profile-header"><div><p className="profile-eyebrow">Workspace</p>
      <h1>Context Approvals</h1><p className="muted">Review exact customer proposals and their source evidence.</p></div></header>
    <label><input type="checkbox" checked={denied} onChange={event => {
      setDenied(event.target.checked); setOffset(0);
    }} /> Include denied proposals</label>
    {error && <p role="alert">{error}</p>}
    {!queue && !error && <p role="status">Loading proposals…</p>}
    {queue && <><p>{queue.total} proposals</p>
      {queue.items.length === 0 && <p>No proposals match this view.</p>}
      {queue.items.map(item => <article className="profile-card" key={item.id}>
        <p className="muted">{item.customerName} · {item.state} · {item.kind.replaceAll("_", " ")}</p>
        <h2>{item.title ?? "Customer proposal"}</h2>
        <p className="muted">Submitted {new Date(item.createdAt).toLocaleString()}</p>
        <Link className="secondary-button" href={item.state === "pending"
          ? `/customers/${item.customerId}/review`
          : `/customers/${item.customerId}/records/${item.recordId}`}>Inspect proposal and history</Link>
      </article>)}
      <div className="profile-review-actions">
        {offset > 0 && <button className="secondary-button" onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button>}
        {queue.nextOffset !== null && <button className="secondary-button" onClick={() => setOffset(queue.nextOffset!)}>More proposals</button>}
      </div></>}
  </main>;
}
