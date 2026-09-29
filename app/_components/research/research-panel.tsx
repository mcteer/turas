"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RefreshPanel,type DueSource } from "./refresh-panel";

type Mode = "recon" | "practices" | "fit";
type Preview = { id: string; revision: number; digest: string; mode: Mode;
  queries: string[]; publicFields: Record<string,unknown>; discoveryProvider: string | null;
  destination: string; fetchScope: string; limits: { searches: number; fetchAttempts: number;
    wallSeconds: number } };
type Receipt = { id: string; state: string; mode: Mode; searchesUsed: number;
  fetchesUsed: number; safeReasonCode: string | null; retainedCitationIds: string[] };
type Finding = { observationId: string; canonicalUrl: string; title: string;
  verbatimPassage: string; origin: string; caveats: string[];
  quality: { Q: number; band: string } };
type Envelope<T> = { data?: T; error?: { code: string; message: string } };

export function ResearchPanel({ customerId,conversationId,csrfToken,busy,onStart }: {
  customerId: string; conversationId: string; csrfToken: string; busy: boolean;
  onStart: (turn: { message: string; requestKey: string }) => Promise<void>;
}) {
  const [open,setOpen] = useState(false);
  const [mode,setMode] = useState<Mode>("practices");
  const [name,setName] = useState("");
  const [domain,setDomain] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const [product,setProduct] = useState("");
  const [version,setVersion] = useState("");
  const [topic,setTopic] = useState("");
  const [receiptIds,setReceiptIds] = useState("");
  const [urls,setUrls] = useState("");
  const [refreshTarget,setRefreshTarget] = useState<DueSource | null>(null);
  const [refreshOutcome,setRefreshOutcome] = useState("");
  const [preview,setPreview] = useState<Preview | null>(null);
  const [runId,setRunId] = useState<string | null>(null);
  const [receipt,setReceipt] = useState<Receipt | null>(null);
  const [findings,setFindings] = useState<Finding[]>([]);
  const [working,setWorking] = useState(false);
  const [notice,setNotice] = useState("");

  useEffect(() => { setPreview(null); }, [mode,name,domain,confirmed,product,version,topic,receiptIds,urls]);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/research/runs/${runId}`,{ cache: "no-store" });
        const envelope = await response.json() as Envelope<Receipt>;
        if (!active) return;
        if (!response.ok || !envelope.data) {
          setNotice("Research status is unavailable. Reload to check again.");
          return;
        }
        setReceipt(envelope.data);
      } catch { if (active) setNotice("Research status is unavailable. Reload to check again."); }
    };
    void poll();
    const timer = setInterval(() => { void poll(); },3_000);
    return () => { active = false; clearInterval(timer); };
  },[runId]);
  useEffect(() => {
    if (!runId || !receipt || !["completed","partial","cancelled"].includes(receipt.state)) return;
    let active = true;
    void fetch(`/api/research/runs/${runId}/findings`,{ cache: "no-store" })
      .then(async (response) => {
        const envelope = await response.json() as Envelope<Finding[]>;
        if (active && response.ok && envelope.data) setFindings(envelope.data);
      }).catch(() => undefined);
    return () => { active = false; };
  },[runId,receipt?.state]);

  async function post<T>(path: string,body: unknown): Promise<T> {
    const response = await fetch(path,{ method: "POST",cache: "no-store",
      headers: { "content-type": "application/json","x-csrf-token": csrfToken },
      body: JSON.stringify(body) });
    const envelope = await response.json() as Envelope<T>;
    if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Research unavailable");
    return envelope.data;
  }
  async function createPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setNotice(""); setPreview(null);
    try {
      const common = { idempotencyKey: crypto.randomUUID(),customerId,conversationId };
      const submittedUrls = urls.split(/\s+/).map((url) => url.trim()).filter(Boolean);
      const input = mode === "recon" ? { ...common,mode,publicName: name.trim(),
        publicDomain: domain.trim(),identityConfirmed: confirmed,submittedUrls,
        ...(refreshTarget ? { refreshSourceRevisionId: refreshTarget.sourceRevisionId } : {}) } :
        mode === "practices" ? { ...common,mode,product: product.trim(),
          version: version.trim(),topic: topic.trim(),submittedUrls,
          ...(refreshTarget ? { refreshSourceRevisionId: refreshTarget.sourceRevisionId } : {}) } :
          { ...common,mode,evidenceReceiptIds: receiptIds.split(/\s+/).filter(Boolean),submittedUrls: [] };
      const result = await post<Preview>("/api/research/requests",input);
      setPreview(result);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Preview unavailable"); }
    finally { setWorking(false); }
  }
  async function start() {
    if (!preview || busy) return;
    setWorking(true); setNotice("");
    try {
      const turn = await post<{ runId: string; message: string; requestKey: string }>(
        `/api/research/requests/${preview.id}/start`,{
          idempotencyKey: crypto.randomUUID(),expectedRevision: preview.revision,
          expectedDigest: preview.digest });
      setRunId(turn.runId);
      await onStart({ message: turn.message,requestKey: turn.requestKey });
      setNotice("Research turn submitted. Progress is shown below.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Start unavailable"); }
    finally { setWorking(false); }
  }
  async function cancel() {
    if (!runId) return;
    setWorking(true);
    try {
      const outcome = await post<{ state: string }>(`/api/research/runs/${runId}/cancel`,
        { idempotencyKey: crypto.randomUUID() });
      if (outcome.state === "cancelled") {
        setReceipt((current) => current ? { ...current,state: "cancelled",
          safeReasonCode: "cancelled_by_owner" } : current);
      }
      setNotice("Research cancelled. Completed checked findings remain below.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Cancellation unavailable"); }
    finally { setWorking(false); }
  }
  async function recordRefresh() {
    if (!refreshTarget || !preview || !receipt) return;
    setWorking(true);
    try {
      const result = await post<{ outcome: string }>("/api/research/refresh",{
        idempotencyKey: crypto.randomUUID(),customerId,requestId: preview.id,
        sourceRevisionId: refreshTarget.sourceRevisionId,
        expectedPassageDigest: refreshTarget.passageDigest });
      setRefreshOutcome(result.outcome);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Refresh unavailable"); }
    finally { setWorking(false); }
  }
  return <section className="profile-section research-panel" aria-label="Public research">
    <button className="secondary-button" type="button" aria-expanded={open}
      onClick={() => setOpen((value) => !value)}>{open ? "Close research" : "Start public research"}</button>
    {open && <><h2>Public research</h2><p className="muted">Review the exact public search terms before starting. Supplied links remain pending until independently checked.</p>
      <RefreshPanel customerId={customerId} onChoose={(source) => {
        if (!source.mode || !source.publicFields) return;
        const fields = source.publicFields;
        setRefreshTarget(source);setMode(source.mode);
        if (source.mode === "recon") {
          setName(String(fields.publicName ?? ""));
          setDomain(String(fields.publicDomain ?? ""));setConfirmed(true);
        } else {
          setProduct(String(fields.product ?? ""));
          setVersion(String(fields.version ?? ""));setTopic(String(fields.topic ?? ""));
        }
        setUrls(source.publicUrl);
        setPreview(null);setNotice("Review the refresh scope and start a new research turn.");
      }} />
      {refreshTarget && <p className="profile-caution">Refreshing: {refreshTarget.title}. The original claim date stays unchanged if its checked passage is unchanged.</p>}
      <form onSubmit={(event) => void createPreview(event)}>
        <label htmlFor="research-mode">Mode</label>
        <select className="field" id="research-mode" value={mode} onChange={(event) => {
          setMode(event.target.value as Mode);
          if (refreshTarget) setUrls("");
          setRefreshTarget(null);
        }}>
          <option value="practices">Public product practices</option><option value="recon">Confirmed public identity</option>
          <option value="fit">Fit with current evidence</option>
        </select>
        {mode === "recon" && <><label htmlFor="research-name">Public name</label>
          <input className="field" id="research-name" value={name} maxLength={200} required
            onChange={(event) => setName(event.target.value)} />
          <label htmlFor="research-domain">Public domain</label>
          <input className="field" id="research-domain" value={domain} maxLength={200} required
            onChange={(event) => setDomain(event.target.value)} />
          <label><input type="checkbox" checked={confirmed} required
            onChange={(event) => setConfirmed(event.target.checked)} /> I confirm these identify the intended public organization.</label></>}
        {mode === "practices" && <><label htmlFor="research-product">Product</label>
          <input className="field" id="research-product" value={product} maxLength={200} required
            onChange={(event) => setProduct(event.target.value)} />
          <label htmlFor="research-version">Version</label>
          <input className="field" id="research-version" value={version} maxLength={200} required
            onChange={(event) => setVersion(event.target.value)} />
          <label htmlFor="research-topic">Topic</label>
          <input className="field" id="research-topic" value={topic} maxLength={200} required
            onChange={(event) => setTopic(event.target.value)} /></>}
        {mode === "fit" && <><label htmlFor="research-receipts">Current evidence receipt IDs</label>
          <textarea className="field" id="research-receipts" value={receiptIds} required
            onChange={(event) => setReceiptIds(event.target.value)}
            placeholder="Paste one or more receipt IDs, separated by spaces" /></>}
        {mode !== "fit" && <><label htmlFor="research-urls">Optional public HTTPS URLs</label>
          <textarea className="field" id="research-urls" value={urls} onChange={(event) => setUrls(event.target.value)}
            placeholder="One URL per line, up to eight" /></>}
        <button className="secondary-button" type="submit" disabled={working}>Preview scope</button>
      </form>
      {preview && <div className="profile-state" role="region" aria-label="Research scope preview">
        <h3>Review outbound scope</h3><p>Mode: {preview.mode}. Discovery: {preview.discoveryProvider ?? "none"}.</p>
        <p>Destination: {preview.destination}. Fetch: {preview.fetchScope}.</p>
        <ul>{preview.queries.map((query,index) => <li key={index}>{query}</li>)}</ul>
        <p>Maximum {preview.limits.searches} searches, {preview.limits.fetchAttempts} fetches, {preview.limits.wallSeconds} seconds.</p>
        <button className="primary-button" type="button" disabled={working || busy || Boolean(runId)}
          onClick={() => void start()}>Confirm and start</button>
      </div>}
      {runId && <div className="profile-state" role="status">
        <p>Research: {receipt?.state ?? "queued"}. Searches {receipt?.searchesUsed ?? 0}; fetches {receipt?.fetchesUsed ?? 0}.</p>
        {receipt?.safeReasonCode && <p>Reason: {receipt.safeReasonCode.replaceAll("_"," ")}.</p>}
        {receipt && ["queued","running"].includes(receipt.state) &&
          <button className="secondary-button" type="button" disabled={working} onClick={() => void cancel()}>Cancel research</button>}
        {receipt?.retainedCitationIds.length ? <p>{receipt.retainedCitationIds.length} checked source observations are available in the response.</p> : null}
        {refreshTarget && receipt && ["completed","partial","failed","unconfirmed"].includes(receipt.state) &&
          <button className="secondary-button" type="button" disabled={working || Boolean(refreshOutcome)}
            onClick={() => void recordRefresh()}>Record refresh outcome</button>}
        {refreshOutcome && <p>Refresh outcome: {refreshOutcome}. Claim dates have not been reset.</p>}
        {findings.map((finding) => <article className="profile-card" key={finding.observationId}>
          <h3>{finding.title}</h3><blockquote>{finding.verbatimPassage}</blockquote>
          <p>Independent public source · Quality {finding.quality.Q}/100 ({finding.quality.band})</p>
          {finding.caveats.map((caveat,index) => <p className="profile-caution" key={index}>{caveat}</p>)}
          <a href={finding.canonicalUrl} target="_blank" rel="noreferrer noopener">Open public source</a>
        </article>)}
        {receipt && ["partial","failed","cancelled","unconfirmed"].includes(receipt.state) &&
          <p>Research did not complete fully. Start a new preview to try again.</p>}
        {receipt && ["completed","partial","failed","cancelled","unconfirmed"].includes(receipt.state) &&
          <button className="secondary-button" type="button" onClick={() => {
            setRunId(null); setReceipt(null); setFindings([]); setPreview(null);
            setRefreshTarget(null);setRefreshOutcome("");setNotice("");
          }}>New request</button>}
      </div>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </section>;
}
