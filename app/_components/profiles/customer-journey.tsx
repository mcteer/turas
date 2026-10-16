"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { contextSchema, impactDelta, stages, type CustomerContext } from "../../../lib/contracts/customer-journey";
import { RecordHistory } from "./record-history";

type Entry = { id: string; recordId: string; recordVersion: number;
  currentAcceptedRevisionId: string | null; reviewState: string; audience?: string;
  context: CustomerContext };
type Page = { items: Entry[]; nextCursor: string | null };
const today = () => new Date().toISOString().slice(0,10);
const empty = (): CustomerContext => ({ title: "", summary: "", scope: "", kind: "note",
  stage: null, observedAt: today(), reviewAfter: new Date(Date.now()+30*86400000).toISOString().slice(0,10),
  confidence: "medium", source: { kind: "note", reference: "", url: "", excerpt: "" }, impact: null });

export function CustomerJourney({ customerId }: { customerId: string }) {
  const [context, setContext] = useState(empty);
  const [editing, setEditing] = useState<Entry>();
  const [page, setPage] = useState<Page>();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [session, setSession] = useState<{ csrfToken: string; membership: { kind: string } }>();
  const [delivery, setDelivery] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown>>();
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<string>();
  const [reasons, setReasons] = useState<Record<string,string>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error("Sign in again"); return response.json(); })
      .then(result => { setSession(result.data); setDelivery(result.data.membership.kind === "partner"); })
      .catch(error => { if (!controller.signal.aborted) setStatus(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (cursor) params.set("cursor", cursor);
    setPage(undefined);
    void fetch(`/api/customers/${customerId}/journey?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json();
        if (!response.ok) throw Error(body.error?.message ?? "Journey unavailable"); return body.data; })
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(error => { if (!controller.signal.aborted) setStatus(error.message); });
    return () => controller.abort();
  }, [customerId, query, cursor, refresh]);
  function update<K extends keyof CustomerContext>(key: K, value: CustomerContext[K]) {
    setContext(current => ({ ...current, [key]: value }));
  }
  async function send(command: Record<string, unknown>) {
    if (!session) return;
    const exact = pending ?? command;
    setPending(exact); setStatus("Saving…");
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken }, body: JSON.stringify(exact) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setPending(undefined);
        setStatus(result.error?.message ?? "Not saved"); return;
      }
      setPending(undefined); setEditing(undefined); setContext(empty()); setRefresh(value => value+1);
      setStatus("Saved. Proposed context requires factual review before use.");
    } catch { setStatus("The result is uncertain. Retry the exact saved request."); }
  }
  function propose() {
    if (pending) { void send(pending); return; }
    const parsed = contextSchema.safeParse(context);
    if (!parsed.success) { setStatus(parsed.error.issues[0]?.message ?? "Complete the journey fields"); return; }
    const value = parsed.data;
    void send({ action: editing ? "propose_revision" : "propose_record", requestKey: crypto.randomUUID(),
      ...(editing ? { recordId: editing.recordId, expectedRecordVersion: editing.recordVersion,
        expectedAcceptedRevisionId: editing.currentAcceptedRevisionId } : {}),
      payload: { kind: "claim", title: value.title, text: value.summary, sourceType: "manual", legacyJourney: value },
      requestedAudience: delivery ? "delivery" : "internal", dataCategory: "delivery_context" });
  }
  return <main className="profile-page">
    <header className="profile-header"><div><p className="profile-eyebrow">Customer Profile</p>
      <h1>Customer Journey</h1><p className="muted">Sourced observations, decisions and measured outcomes.</p></div>
      <Link className="secondary-button" href={`/customers/${customerId}`}>Customer Profile</Link></header>
    <section className="profile-section"><h2>{editing ? "Revise Journey Record" : "Propose Journey Record"}</h2>
      <p className="muted">Notes remain pending until reviewed. Delivery-visible records can be read by assigned partners after acceptance. Conversation history remains private.</p>
      <fieldset disabled={Boolean(pending) || !session}>
        {([ ["title","Title",160], ["summary","Summary",4000], ["scope","Scope",200] ] as const).map(([key,label,max]) =>
          <label className="field-label" key={key}>{label}<textarea className="field" rows={key === "summary" ? 4 : 1}
            maxLength={max} value={context[key]} onChange={event => update(key,event.target.value)} /></label>)}
        <label className="field-label">Record type<select className="field" value={context.kind}
          onChange={event => update("kind",event.target.value as CustomerContext["kind"])}>
          {["note","milestone","risk","decision","outcome"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="field-label">Journey stage<select className="field" value={context.stage ?? ""}
          onChange={event => update("stage",event.target.value as CustomerContext["stage"] || null)}>
          <option value="">Not assessed</option>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <p className="muted">Journey stage describes the engagement; it does not set customer maturity.</p>
        {([ ["observedAt","Observed on"], ["reviewAfter","Review after"] ] as const).map(([key,label]) =>
          <label className="field-label" key={key}>{label}<input className="field" type="date" value={context[key]}
            onChange={event => update(key,event.target.value)} /></label>)}
        <label className="field-label">Confidence<select className="field" value={context.confidence}
          onChange={event => update("confidence",event.target.value as CustomerContext["confidence"])}>
          {["low","medium","high"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="field-label">Source type<select className="field" value={context.source.kind}
          disabled={session?.membership.kind === "partner" && editing?.reviewState === "accepted"}
          onChange={event => update("source",{ ...context.source, kind: event.target.value as CustomerContext["source"]["kind"] })}>
          {["note","document","conversation","image","attachment"].map(value => <option key={value}>{value}</option>)}</select></label>
        {([ ["reference","Source reference",500], ["url","Source URL (optional)",2000], ["excerpt","Original source excerpt",12000] ] as const).map(([key,label,max]) =>
          <label className="field-label" key={key}>{label}<textarea className="field" rows={key === "excerpt" ? 4 : 1}
            disabled={session?.membership.kind === "partner" && editing?.reviewState === "accepted"}
            maxLength={max} value={context.source[key]} onChange={event => update("source",{ ...context.source,[key]:event.target.value })} /></label>)}
        {session?.membership.kind === "partner" && editing?.reviewState === "accepted" &&
          <p className="muted">The reviewed source stays attached to this correction. Create a separate sourced proposal to supply a different source.</p>}
        <label><input type="checkbox" checked={Boolean(context.impact)} onChange={event => update("impact",event.target.checked ? {
          metric:"",unit:"",baseline:0,current:0,target:null,direction:"increase",periodStart:today(),periodEnd:today(),basis:"measured",attribution:"",
        } : null)} /> Include an impact measurement</label>
        {context.impact && <fieldset><legend>Impact Measurement</legend>
          {([ ["metric","Metric"], ["unit","Unit"], ["attribution","Attribution and limitations"] ] as const).map(([key,label]) =>
            <label className="field-label" key={key}>{label}<input className="field" value={context.impact![key]}
              onChange={event => update("impact",{ ...context.impact!,[key]:event.target.value })} /></label>)}
          {([ ["baseline","Baseline"], ["current","Current value"], ["target","Target (optional)"] ] as const).map(([key,label]) =>
            <label className="field-label" key={key}>{label}<input className="field" type="number" step="any" value={context.impact![key] ?? ""}
              onChange={event => update("impact",{ ...context.impact!,[key]:event.target.value === "" && key === "target" ? null : event.target.valueAsNumber })} /></label>)}
          {([ ["periodStart","Measurement start"], ["periodEnd","Measurement end"] ] as const).map(([key,label]) =>
            <label className="field-label" key={key}>{label}<input className="field" type="date" value={context.impact![key]}
              onChange={event => update("impact",{ ...context.impact!,[key]:event.target.value })} /></label>)}
          <label className="field-label">Desired direction<select className="field" value={context.impact.direction}
            onChange={event => update("impact",{...context.impact!,direction:event.target.value as "increase"|"decrease"})}>
            <option value="increase">Increase</option><option value="decrease">Decrease</option></select></label>
          <label className="field-label">Measurement basis<select className="field" value={context.impact.basis}
            onChange={event => update("impact",{...context.impact!,basis:event.target.value as NonNullable<CustomerContext["impact"]>["basis"]})}>
            <option value="measured">Measured</option><option value="customer_reported">Customer reported</option><option value="estimated">Estimated</option></select></label>
        </fieldset>}
        <label><input type="checkbox" checked={delivery} disabled={session?.membership.kind === "partner" || editing?.audience === "internal"}
          onChange={event => setDelivery(event.target.checked)} /> Delivery visible after acceptance</label>
      </fieldset>
      <button className="primary-button" disabled={!session} onClick={propose}>{pending ? "Retry exact request" : editing ? "Submit revised proposal" : "Save pending proposal"}</button>
      {editing && !pending && <button className="secondary-button" onClick={() => { setEditing(undefined); setContext(empty()); }}>Cancel revision</button>}
      {status && <p role="status">{status}</p>}
    </section>
    <section className="profile-section"><h2>Journey Records</h2>
      <label className="field-label">Search context<input className="field" type="search" maxLength={200} value={query}
        onChange={event => { setQuery(event.target.value); setCursor(undefined); }} /></label>
      {!page && <p role="status">Loading records…</p>}
      {page?.items.map(entry => <article className="profile-card" key={entry.id}>
        <p className="muted">{entry.reviewState} · {entry.context.kind} · {entry.context.scope}</p>
        <h3>{entry.context.title}</h3><p>{entry.context.summary}</p>
        <p>Stage: {entry.context.stage ?? "Not assessed"} · Observed {entry.context.observedAt} · Review after {entry.context.reviewAfter}</p>
        <p>Source: {entry.context.source.reference}</p><blockquote>{entry.context.source.excerpt}</blockquote>
        {entry.context.impact && <p>{entry.context.impact.metric}: {entry.context.impact.baseline} → {entry.context.impact.current} {entry.context.impact.unit}
          {" · "}{entry.context.impact.basis.replaceAll("_"," ")} · Change {impactDelta(entry.context.impact).absolute}</p>}
        {entry.reviewState === "accepted" && <div>
          <label className="field-label" htmlFor={`retract-${entry.id}`}>Retraction reason</label>
          <input className="field" id={`retract-${entry.id}`} maxLength={2000} value={reasons[entry.id] ?? ""}
            disabled={Boolean(pending)} onChange={event => setReasons(current => ({...current,[entry.id]:event.target.value}))} />
          <button className="secondary-button" disabled={Boolean(pending) || !reasons[entry.id]?.trim()} onClick={() => void send({
            action:"request_retraction",requestKey:crypto.randomUUID(),revisionId:entry.id,
            expectedRecordVersion:entry.recordVersion,reason:reasons[entry.id].trim(),
          })}>Request retraction review</button>
        </div>}
        <div className="profile-review-actions"><button className="secondary-button" disabled={Boolean(pending)} onClick={() => {
          setEditing(entry); setContext(entry.context); setDelivery(entry.audience === "delivery");
        }}>{entry.reviewState === "rejected" ? "Revise and resubmit" : "Correct record"}</button>
          <button className="secondary-button" onClick={() => setHistory(entry.recordId)}>View history</button>
          <Link className="secondary-button" href={`/customers/${customerId}/review`}>Review proposals and retractions</Link></div>
      </article>)}
      {page && page.items.length === 0 && <p>No journey records on this page.</p>}
      {page?.nextCursor && <button className="secondary-button" onClick={() => setCursor(page.nextCursor!)}>Older records</button>}
      {cursor && <button className="secondary-button" onClick={() => setCursor(undefined)}>Newest records</button>}
    </section>
    {history && <RecordHistory customerId={customerId} recordId={history} scope="Customer journey" onClose={() => setHistory(undefined)} />}
  </main>;
}
