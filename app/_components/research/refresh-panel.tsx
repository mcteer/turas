"use client";

import { useEffect,useState } from "react";

export type DueSource = { sourceRevisionId: string; title: string; dueAt: string;
  state: string; publicUrl: string; passageDigest: string;
  mode: "recon" | "practices" | null;publicFields: Record<string,unknown> | null };

export function RefreshPanel({ customerId,onChoose }: { customerId: string;
  onChoose: (source: DueSource) => void }) {
  const [sources,setSources] = useState<DueSource[]>([]);
  const [state,setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const dueSources = sources.filter((source) => source.state === "due");
  useEffect(() => {
    let active = true;
    void fetch(`/api/research/refresh?customerId=${encodeURIComponent(customerId)}`,
      { cache: "no-store" }).then(async (response) => {
      const envelope = await response.json() as { data?: DueSource[] };
      if (!active) return;
      if (!response.ok || !envelope.data) { setState("unavailable"); return; }
      setSources(envelope.data);setState("ready");
    }).catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  },[customerId]);
  return <section aria-label="Research review due" className="profile-state">
    <h3>Evidence Review</h3>
    {state === "loading" && <p role="status">Checking review dates…</p>}
    {state === "unavailable" && <p role="status">Review dates are unavailable.</p>}
    {state === "ready" && !dueSources.length && <p>No attributed research requires review.</p>}
    {dueSources.map((source) =>
      <article className="profile-card" key={source.sourceRevisionId}>
        <h4>{source.title}</h4><p>Review due {source.dueAt}.</p>
        <button className="secondary-button" type="button" disabled={!source.mode || !source.publicFields}
          onClick={() => onChoose(source)}>
          Prepare refresh</button>
        {!source.mode && <p className="profile-caution">The original public research scope is unavailable. Review this source manually.</p>}
      </article>)}
  </section>;
}
