"use client";

import { useEffect, useState } from "react";

type Source = { sourceRevisionId: string; state: string; title: string; location: string;
  lifecycleVersion?: number;
  passage: string; supportedClaim: string; publicationAt: string | null;
  observationAt: string | null; retrievalAt: string; rights: string;
  checks: { version: string; rationale?: string };
  quality: { rubricVersion: string; R: number; F: number; D: number; C: number;
    Q: number; band: string; freshness: string; validUntil: string;
    input?: { reliabilityRationale: string; directnessRationale: string; corroborationRationale: string } } };

export function EvidenceDetail({ customerId, sourceRevisionId, canReview, onClose, onChanged }: {
  customerId: string; sourceRevisionId: string; canReview: boolean; onClose: () => void;
  onChanged: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawKey, setWithdrawKey] = useState<string | null>(null);
  const [withdrawStatus, setWithdrawStatus] = useState("");
  async function withdraw() {
    if (!source || source.lifecycleVersion === undefined || !withdrawReason.trim()) {
      setWithdrawStatus("Provide a source withdrawal reason."); return;
    }
    const requestKey = withdrawKey ?? crypto.randomUUID();
    setWithdrawKey(requestKey); setWithdrawStatus("Withdrawing source…");
    try {
      const auth = await fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()) as {
        data?: { csrfToken: string } };
      if (!auth.data?.csrfToken) throw new Error("Sign-in unavailable");
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": auth.data.csrfToken },
        body: JSON.stringify({ action: "withdraw_source", requestKey,
          sourceRevisionId, expectedLifecycleVersion: source.lifecycleVersion,
          rationale: withdrawReason.trim() }) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setWithdrawKey(null);
        setWithdrawStatus(result.error?.message ?? "Source was not withdrawn."); return;
      }
      setSource({ ...source, state: "withdrawn", lifecycleVersion: source.lifecycleVersion + 1 });
      setWithdrawKey(null); setWithdrawStatus("Source withdrawn. Dependent guidance will be rechecked.");
      onChanged();
    } catch { setWithdrawStatus("The result is uncertain. Retry with the same request key."); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setState("loading"); setSource(null);
    void fetch(`/api/customers/${customerId}/sources/${sourceRevisionId}`,
      { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Source unavailable");
      const result = await response.json() as { data?: Source };
      if (!result.data) throw new Error("Source unavailable");
      setSource(result.data); setState("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("unavailable");
    });
    return () => controller.abort();
  }, [customerId, sourceRevisionId]);
  return <section className="profile-section profile-evidence-detail" aria-labelledby="source-detail-heading">
    <div className="profile-section-head"><h2 id="source-detail-heading">Source detail</h2>
      <button type="button" className="secondary-button" onClick={onClose}>Close source</button></div>
    {state === "loading" && <p role="status">Loading source…</p>}
    {state === "unavailable" && <p role="alert">This source is unavailable to your account.</p>}
    {state === "ready" && source && <>
      <h3>{source.title}</h3><p><span className="profile-badge">{source.state}</span> <span className="profile-badge">{source.quality.freshness}</span></p>
      <p><strong>Supported claim:</strong> {source.supportedClaim}</p>
      <blockquote>{source.passage}</blockquote>
      <p><a href={source.location} target="_blank" rel="noopener noreferrer">Open public source</a></p>
      <p className="muted">Published {source.publicationAt ?? "Unknown"} · Observed {source.observationAt ?? "Unknown"} · Retrieved {source.retrievalAt}</p>
      <p className="muted">Rights: {source.rights} · Check: {source.checks.version}</p>
      <p><strong>Evidence quality:</strong> {source.quality.Q}/100 ({source.quality.band}); R {source.quality.R}, F {source.quality.F}, D {source.quality.D}, C {source.quality.C}. Recheck by {source.quality.validUntil}.</p>
      {source.quality.input && <p className="muted">Rating rationale: {source.quality.input.reliabilityRationale}; {source.quality.input.directnessRationale}; {source.quality.input.corroborationRationale}</p>}
      {source.checks.rationale && <p className="muted">Research check: {source.checks.rationale}</p>}
      {canReview && source.state === "researched" && source.lifecycleVersion !== undefined &&
        <div className="profile-withdraw-source"><label>Withdrawal reason<textarea className="field" rows={2}
          value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} /></label>
          <button type="button" className="secondary-button" onClick={() => void withdraw()}>Withdraw source</button>
          {withdrawStatus && <p role="status">{withdrawStatus}</p>}</div>}
    </>}
  </section>;
}
