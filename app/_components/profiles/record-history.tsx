"use client";

import { titleCaseLabel } from "../title-case-label";

import { useEffect, useState } from "react";
import { MaturityAssessment } from "./maturity-assessment";

type Revision = { id: string; reviewState: string; kind: string; payload: Record<string, unknown>;
  createdAt?: string; authorMembershipId?: string; sourceReferences?: string[];
  partnerSafeReason?: string | null; decisionRationale?: string | null;
  supportStatus?: string };
type HistoryEvent = { id: string; revisionId: string; eventType: string;
  actorMembershipId: string; rationale: string; createdAt: string };
type History = { items: Revision[]; events: HistoryEvent[]; nextCursor: string | null };

function date(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function RecordHistory({ customerId, recordId, scope, onClose }: {
  customerId: string; recordId: string; scope: string; onClose: () => void;
}) {
  const [items, setItems] = useState<Revision[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "denied">("loading");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    const url = new URL(`/api/customers/${encodeURIComponent(customerId)}/records/${encodeURIComponent(recordId)}/history`,
      window.location.origin);
    if (page > 0 && cursor) url.searchParams.set("cursor", cursor);
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if ([401, 403, 404].includes(response.status)) {
        setItems([]); setEvents([]); setStatus("denied"); return;
      }
      if (!response.ok) throw new Error("History unavailable");
      const body = await response.json() as { data?: History };
      if (!body.data) throw new Error("History unavailable");
      setItems((current) => page === 0 ? body.data!.items : [...current, ...body.data!.items]);
      setEvents((current) => page === 0 ? body.data!.events : [...current,
        ...body.data!.events.filter((event) => !current.some((item) => item.id === event.id))]);
      setCursor(body.data.nextCursor);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("unavailable");
    });
    return () => controller.abort();
    // The next cursor is consumed only when the reader requests another page.
  }, [customerId, recordId, page, retry]);

  return <section className="profile-section" aria-label="Record History">
    <div className="profile-section-head"><h2>Record History</h2>
      <button type="button" className="secondary-button" onClick={onClose}>Close history</button></div>
    <p><span className="profile-label">Scope: </span>{scope}</p>
    {status === "loading" && <p role="status">Loading record history…</p>}
    {status === "denied" && <p role="alert">This history is no longer available to your account.</p>}
    {status === "unavailable" && <p role="alert">Could not load history. <button type="button"
      className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
    {status === "ready" && <>
      <ol className="profile-history-list">{items.map((item) => {
        const observed = date(item.payload.observedAt ?? item.payload.observationEnd ?? item.payload.effectiveAt);
        const submitted = date(item.createdAt);
        const summary = ["displayName", "name", "title", "statement", "text", "description"]
          .map((key) => item.payload[key]).find((value) => typeof value === "string") as string | undefined;
        return <li key={item.id} className="profile-card"><div className="profile-card-head">
          <h3>{titleCaseLabel(item.reviewState)}</h3>
          {submitted && <time dateTime={item.createdAt}>{submitted}</time>}</div>
          {summary && <p>{summary}</p>}
          {item.kind === "maturity_assessment" && <MaturityAssessment
            payload={item.payload as Parameters<typeof MaturityAssessment>[0]["payload"]}
            supportStatus={item.supportStatus} scope={scope} />}
          {observed && <p><span className="profile-label">Observed or effective: </span>{observed}</p>}
          {item.authorMembershipId && <p><span className="profile-label">Submitted by membership: </span>{item.authorMembershipId}</p>}
          {item.sourceReferences?.length ? <p><span className="profile-label">Evidence references: </span>{item.sourceReferences.join(", ")}</p> : null}
          {item.partnerSafeReason && <p><span className="profile-label">Review reason: </span>{item.partnerSafeReason}</p>}
          {item.decisionRationale && <p><span className="profile-label">Internal review rationale: </span>{item.decisionRationale}</p>}
        </li>;
      })}</ol>
      {events.length > 0 && <><h3>Review and Lifecycle Events</h3>
        <ol className="profile-history-list">{events.map((event) => <li key={event.id} className="profile-card">
          <div className="profile-card-head"><strong>{event.eventType.replaceAll("_", " ")}</strong>
            <time dateTime={event.createdAt}>{date(event.createdAt)}</time></div>
          <p><span className="profile-label">Actor membership: </span>{event.actorMembershipId}</p>
          <p>{event.rationale}</p>
        </li>)}</ol></>}
      {cursor && <button type="button" className="secondary-button" onClick={() => setPage((value) => value + 1)}>More history</button>}
    </>}
  </section>;
}
