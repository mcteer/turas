"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StewardEditor } from "./steward-editor";

type Candidate = { id: string; recordId: string; kind: string; payload: Record<string, unknown>;
  acceptedPayload: Record<string, unknown> | null; recordVersion: number;
  currentAcceptedRevisionId: string | null; contentDigest: string;
  authorKind: "internal" | "partner"; authorMembershipId: string;
  submissionChannel: "profile_form" | "chat_share" | "agent_proposal" | "synthetic_bootstrap";
  requestedAudience: "internal" | "delivery"; dataCategory: string;
  qualityInput: Record<string, unknown>; quality: { Q: number; band: string; freshness: string };
  sourceReferences: string[]; createdAt: string; scopeLabel: string;
  confirmedConflict: boolean;
  recentHistory: { decision: string; decidedAt: string }[] };
type Queue = { pending: Candidate[]; openRetractions: { id: string; acceptedRevisionId: string;
  reason: string; requestingMembershipId: string; requesterKind: "internal" | "partner";
  version: number; recordVersion: number }[]; nextCursor: string | null };

function RetractionCard({ request, customerId, csrfToken, onDecided }: {
  request: Queue["openRetractions"][number]; customerId: string;
  csrfToken: string; onDecided: () => void;
}) {
  const [rationale, setRationale] = useState("");
  const [safeReason, setSafeReason] = useState("");
  const [pending, setPending] = useState<{ action: string; requestKey: string } | null>(null);
  const [message, setMessage] = useState("");
  async function decide(action: "retract_revision" | "decline_retraction") {
    if (!rationale.trim()) { setMessage("Provide a decision rationale."); return; }
    if (action === "decline_retraction" && request.requesterKind === "partner" && !safeReason.trim()) {
      setMessage("Provide a partner-safe decline reason."); return;
    }
    const key = pending?.requestKey ?? crypto.randomUUID();
    setPending({ action, requestKey: key }); setMessage("Saving decision…");
    const command = action === "retract_revision" ? {
      action, requestKey: key, revisionId: request.acceptedRevisionId,
      expectedRecordVersion: request.recordVersion, requestId: request.id, rationale: rationale.trim(),
    } : { action, requestKey: key, requestId: request.id,
      expectedVersion: request.version, rationale: rationale.trim(),
      ...(safeReason.trim() ? { partnerSafeReason: safeReason.trim() } : {}) };
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(command) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setPending(null);
        setMessage(result.error?.message ?? "Decision was not saved."); return;
      }
      setPending(null); setMessage(action === "retract_revision" ?
        "Retracted. Future guidance stops using this fact." : "Request declined.");
      onDecided();
    } catch { setMessage("The result is uncertain. Retry the same decision and key."); }
  }
  return <article className="profile-card"><h3>Retraction request</h3>
    <p>{request.reason}</p><p className="muted">{request.requesterKind} contributor · Accepted revision {request.acceptedRevisionId}</p>
    <label className="field-label" htmlFor={`retraction-review-${request.id}`}>Internal rationale</label>
    <textarea id={`retraction-review-${request.id}`} className="field" rows={2} value={rationale}
      disabled={Boolean(pending)} onChange={(event) => setRationale(event.target.value)} />
    {request.requesterKind === "partner" && <><label className="field-label" htmlFor={`retraction-safe-${request.id}`}>Partner-safe decline reason</label>
      <textarea id={`retraction-safe-${request.id}`} className="field" rows={2} value={safeReason}
        disabled={Boolean(pending)} onChange={(event) => setSafeReason(event.target.value)} /></>}
    {message && <p role="status">{message}</p>}
    <div className="profile-review-actions"><button type="button" className="primary-button"
      disabled={Boolean(pending && pending.action !== "retract_revision")}
      onClick={() => void decide("retract_revision")}>Retract accepted fact</button>
      <button type="button" className="secondary-button"
        disabled={Boolean(pending && pending.action !== "decline_retraction")}
        onClick={() => void decide("decline_retraction")}>Decline request</button></div>
  </article>;
}

function ReviewCard({ candidate, customerId, csrfToken, reviewerMembershipId, onDecided }: {
  candidate: Candidate; customerId: string; csrfToken: string; reviewerMembershipId: string; onDecided: () => void;
}) {
  const [rationale, setRationale] = useState("");
  const [safeReason, setSafeReason] = useState("");
  const [attestation, setAttestation] = useState("");
  const [olderAcknowledged, setOlderAcknowledged] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const priorEnd = Date.parse(String(candidate.acceptedPayload?.observationEnd ?? ""));
  const newEnd = Date.parse(String(candidate.payload.observationEnd ?? ""));
  const olderWindow = candidate.kind === "maturity_assessment" &&
    Number.isFinite(priorEnd) && Number.isFinite(newEnd) && newEnd < priorEnd;

  async function decide(action: "accept_revision" | "reject_revision") {
    if (!rationale.trim()) { setMessage("Provide a review rationale."); return; }
    if (candidate.authorKind === "partner" && !safeReason.trim()) {
      setMessage("Provide a partner-safe reason."); return;
    }
    if (action === "accept_revision" && olderWindow && !olderAcknowledged) {
      setMessage("Confirm the older observation window before accepting."); return;
    }
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key); setSubmitting(true); setMessage("");
    const command = { action, requestKey: key, revisionId: candidate.id,
      expectedRecordVersion: candidate.recordVersion, rationale,
      ...(safeReason.trim() ? { partnerSafeReason: safeReason.trim() } : {}),
      ...(action === "accept_revision" ? {
        digest: candidate.contentDigest,
        expectedAcceptedRevisionId: candidate.currentAcceptedRevisionId,
        acknowledgeOlderObservation: olderAcknowledged,
        ...(attestation.trim() ? { partnerSafeAttestation: attestation.trim() } : {}),
      } : {}) };
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken }, body: JSON.stringify(command),
      });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setRequestKey(null);
        setMessage(response.status === 409 ? "Profile changed. Your review text is preserved; reload the candidate before deciding again." :
          result.error?.message ?? "Review was not saved. Retry with the same request key.");
        return;
      }
      setMessage(action === "accept_revision" ? "Accepted." : "Rejected.");
      onDecided();
    } catch {
      setMessage("The result is uncertain. Retry this decision with the same request key.");
    } finally { setSubmitting(false); }
  }

  return <article className="profile-card profile-review-card">
    <div className="profile-card-head"><h2>{candidate.kind.replaceAll("_", " ")}</h2><span className="profile-badge">Pending</span></div>
    <p className="muted">{candidate.authorKind === "partner" ? "Partner submission" : "Internal submission"} · Source: {candidate.submissionChannel.replaceAll("_", " ")} · Requested audience: {candidate.requestedAudience}
      {candidate.authorMembershipId === reviewerMembershipId ? " · Self-review will be attributed" : ""}</p>
    <p className="muted">Scope: {candidate.scopeLabel} · Submitted {new Date(candidate.createdAt).toLocaleString()} · Submitter membership {candidate.authorMembershipId}</p>
    {candidate.confirmedConflict && <p className="profile-caution">Confirmed conflict affects this candidate. Review both sides before deciding.</p>}
    {candidate.recentHistory.length > 0 && <div><h3>Recent decisions on this record</h3><ul>
      {candidate.recentHistory.map((item, index) => <li key={`${item.decidedAt}-${index}`}>
        {item.decision} · {new Date(item.decidedAt).toLocaleString()}</li>)}
    </ul></div>}
    <div className="profile-comparison"><div><h3>Current accepted</h3><pre>{candidate.acceptedPayload ? JSON.stringify(candidate.acceptedPayload, null, 2) : "Unknown"}</pre></div>
      <div><h3>Proposed</h3><pre>{JSON.stringify(candidate.payload, null, 2)}</pre></div></div>
    <p>Quality: {candidate.quality.band} ({candidate.quality.Q}/100), {candidate.quality.freshness}.
      Proposed R/D/C: {String(candidate.qualityInput.R)}/{String(candidate.qualityInput.D)}/{String(candidate.qualityInput.C)}.</p>
    <dl className="profile-quality-details"><dt>Information type</dt><dd>{String(candidate.qualityInput.informationType ?? "unknown")}</dd>
      <dt>Date basis</dt><dd>{String(candidate.qualityInput.dateBasis ?? "unknown")}</dd>
      <dt>Reliability rationale</dt><dd>{String(candidate.qualityInput.reliabilityRationale ?? "Unknown")}</dd>
      <dt>Directness rationale</dt><dd>{String(candidate.qualityInput.directnessRationale ?? "Unknown")}</dd>
      <dt>Corroboration rationale</dt><dd>{String(candidate.qualityInput.corroborationRationale ?? "Unknown")}</dd></dl>
    <p>Evidence references: {candidate.sourceReferences.length ? candidate.sourceReferences.join(", ") : "None submitted"}</p>
    {olderWindow && <label className="profile-check"><input type="checkbox" checked={olderAcknowledged}
      onChange={(event) => setOlderAcknowledged(event.target.checked)} /> Replace the current assessment with an older observation window</label>}
    <label className="field-label" htmlFor={`review-rationale-${candidate.id}`}>Internal review rationale</label>
    <textarea id={`review-rationale-${candidate.id}`} className="field" value={rationale} maxLength={2000}
      onChange={(event) => setRationale(event.target.value)} rows={3} />
    {candidate.authorKind === "partner" && <><label className="field-label" htmlFor={`review-safe-${candidate.id}`}>Partner-safe reason</label>
      <textarea id={`review-safe-${candidate.id}`} className="field" value={safeReason} maxLength={2000}
        onChange={(event) => setSafeReason(event.target.value)} rows={2} /></>}
    {candidate.requestedAudience === "delivery" && <><label className="field-label" htmlFor={`review-attestation-${candidate.id}`}>Restricted-source attestation, if needed</label>
      <textarea id={`review-attestation-${candidate.id}`} className="field" value={attestation} maxLength={2000}
        onChange={(event) => setAttestation(event.target.value)} rows={2} /></>}
    {message && <p role="status" className="profile-caution">{message}</p>}
    <div className="profile-review-actions"><button type="button" className="primary-button" disabled={submitting}
      onClick={() => void decide("accept_revision")}>Accept exact proposal</button>
      <button type="button" className="secondary-button" disabled={submitting}
        onClick={() => void decide("reject_revision")}>Reject</button></div>
  </article>;
}

export function ReviewQueue({ customerId }: { customerId: string }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [reviewerMembershipId, setReviewerMembershipId] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "denied" | "unavailable">("loading");
  const [refresh, setRefresh] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const reload = () => { setCursor(null); setRefresh((value) => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    const reviewUrl = new URL(`/api/customers/${customerId}/review`, window.location.origin);
    if (cursor) reviewUrl.searchParams.set("cursor", cursor);
    void Promise.all([
      fetch(reviewUrl, { cache: "no-store", signal: controller.signal }),
      fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
    ]).then(async ([reviewResponse, authResponse]) => {
      if ([401, 403, 404].includes(reviewResponse.status)) { setQueue(null); setState("denied"); return; }
      if (!reviewResponse.ok || !authResponse.ok) throw new Error("Unavailable");
      const review = await reviewResponse.json() as { data: Queue };
      const auth = await authResponse.json() as { data: { csrfToken: string;
        membership: { id: string } } };
      if (!review.data || !auth.data?.csrfToken) throw new Error("Unavailable");
      setQueue((current) => cursor && current ? { ...review.data,
        pending: [...current.pending, ...review.data.pending.filter((candidate) =>
          !current.pending.some((item) => item.id === candidate.id))] } : review.data);
      setCsrfToken(auth.data.csrfToken);
      setReviewerMembershipId(auth.data.membership.id); setState("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setQueue(null); setState("unavailable");
    });
    return () => controller.abort();
  }, [customerId, refresh, cursor]);
  return <main className="profile-page"><nav aria-label="Breadcrumb" className="profile-breadcrumb">
    <Link href="/customers">Customers</Link><span aria-hidden="true">/</span>
    <Link href={`/customers/${customerId}`}>Profile</Link><span aria-hidden="true">/</span><span>Review</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Customer context</p><h1>Review queue</h1>
      <p className="muted">Decide each exact proposal. Changing its content requires a new pending revision.</p></div></header>
    {state === "loading" && <p role="status" className="profile-state">Loading review queue…</p>}
    {state === "denied" && <p role="alert" className="profile-state">Review is unavailable to your account.</p>}
    {state === "unavailable" && <p role="alert" className="profile-state">Review queue is unavailable. <button type="button" className="secondary-button" onClick={reload}>Retry</button></p>}
    {state === "ready" && queue && <>
      {queue.pending.length === 0 && <p className="profile-state">No proposals are waiting for review.</p>}
      <div className="profile-review-list">{queue.pending.map((candidate) => <ReviewCard key={candidate.id}
        candidate={candidate} customerId={customerId} csrfToken={csrfToken}
        reviewerMembershipId={reviewerMembershipId}
        onDecided={reload} />)}</div>
      {queue.nextCursor && <button type="button" className="secondary-button" onClick={() => setCursor(queue.nextCursor)}>More proposals</button>}
      {queue.openRetractions.length > 0 && <section className="profile-section"><h2>Retraction requests</h2>
        <div className="profile-review-list">{queue.openRetractions.map((request) => <RetractionCard key={request.id}
          request={request} customerId={customerId} csrfToken={csrfToken}
          onDecided={reload} />)}</div></section>}
      <StewardEditor customerId={customerId} refresh={refresh} />
    </>}
  </main>;
}
