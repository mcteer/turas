"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { RetrievalResponse } from "../../../lib/contracts/retrieval";

type Result = RetrievalResponse["results"][number];
type SearchState = "idle" | "loading" | "ready" | "empty" | "denied" | "unavailable";

function locatorLabel(locator: Result["locators"][number]): string {
  if (locator.kind === "profile_field") return `Profile field ${locator.fieldPath}`;
  if (locator.kind === "shared_field") return `Shared field ${locator.fieldPath}, characters ${locator.start + 1}–${locator.end}`;
  if (locator.kind === "research_passage") return `Public passage, characters ${locator.start + 1}–${locator.end}`;
  const original = locator.original;
  const origin = original.kind === "pdf" ? `PDF page ${original.page}` :
    original.kind === "xlsx" ? `Sheet ${original.sheetName}, cell ${original.a1}` :
      original.kind === "pptx" ? `Slide ${original.slide}` :
        original.kind === "docx" ? `Document section ${original.section}, paragraph ${original.paragraph}` :
          original.kind === "csv" ? `CSV record ${original.record}, column ${original.column}` :
            original.kind === "image" ? "Image region" : `Lines ${original.lineStart}–${original.lineEnd}`;
  return `${origin}, characters ${locator.start + 1}–${locator.end}`;
}

export function EvidenceSearch({ customerId, workloadId }: {
  customerId: string; workloadId?: string;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"customer" | "combined" | "shared">("combined");
  const [use, setUse] = useState<"discovery" | "current_fact">("discovery");
  const [state, setState] = useState<SearchState>("idle");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<RetrievalResponse | null>(null);
  const [selected, setSelected] = useState<Result | null>(null);
  const [citationState, setCitationState] = useState<"idle" | "loading" | "ready" | "stale">("idle");
  const [citationText, setCitationText] = useState("");

  useEffect(() => {
    setResponse(null); setSelected(null); setState("idle"); setCitationState("idle");
  }, [customerId, workloadId]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setState("loading"); setMessage(""); setResponse(null); setSelected(null);
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      const auth = await session.json() as { data?: { csrfToken: string } };
      if (!session.ok || !auth.data?.csrfToken) throw new Error("Sign in to search evidence.");
      const searchResponse = await fetch("/api/retrieval/search", {
        method: "POST",cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": auth.data.csrfToken },
        body: JSON.stringify({ scope, ...(scope === "shared" ? {} : { customerId,
          ...(workloadId ? { workloadId } : {}) }),query: query.trim(),use,limit: 10 }),
      });
      const envelope = await searchResponse.json() as { data?: RetrievalResponse;
        error?: { message?: string } };
      if (searchResponse.status === 401 || searchResponse.status === 403 || searchResponse.status === 404) {
        setState("denied"); return;
      }
      if (!searchResponse.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Search is unavailable.");
      setResponse(envelope.data);
      setState(envelope.data.results.length ? "ready" : "empty");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search is unavailable.");
      setState("unavailable");
    }
  }

  async function openCitation(result: Result) {
    setSelected(result); setCitationState("loading"); setCitationText("");
    try {
      const fetched = await fetch(`/api/retrieval/citations/${encodeURIComponent(result.citationId)}`,
        { cache: "no-store" });
      const envelope = await fetched.json() as { data?: { text: string } };
      if (!fetched.ok || !envelope.data) { setCitationState("stale"); return; }
      setCitationText(envelope.data.text); setCitationState("ready");
    } catch { setCitationState("stale"); }
  }

  return <section className="profile-section evidence-search" aria-labelledby="evidence-search-heading">
    <div className="profile-section-head"><h2 id="evidence-search-heading">Search Evidence</h2></div>
    <form className="evidence-search-form" onSubmit={(event) => void search(event)}>
      <label htmlFor="evidence-query">Question or terms</label>
      <input id="evidence-query" className="field" type="search" required maxLength={500}
        value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a claim, product, or source" />
      <div className="evidence-search-controls"><label htmlFor="evidence-scope">Sources</label>
        <select id="evidence-scope" className="field" value={scope}
          onChange={(event) => setScope(event.target.value as typeof scope)}>
          <option value="combined">Customer and shared</option><option value="customer">Customer only</option>
          <option value="shared">Shared only</option>
        </select>
        <label htmlFor="evidence-use">Use</label>
        <select id="evidence-use" className="field" value={use}
          onChange={(event) => setUse(event.target.value as typeof use)}>
          <option value="discovery">Discovery</option><option value="current_fact">Current fact</option>
        </select>
        <button type="submit" className="secondary-button" disabled={state === "loading"}>Search</button>
      </div>
    </form>
    {state === "loading" && <p role="status">Searching governed evidence…</p>}
    {state === "empty" && <p role="status" className="profile-state">No eligible evidence found. Try a broader query or source scope.</p>}
    {state === "denied" && <p role="alert" className="profile-state">These sources are unavailable to your account.</p>}
    {state === "unavailable" && <p role="alert" className="profile-state">{message} Retry the search.</p>}
    {response && <>
      {response.mode === "lexical_degraded" && <p role="status" className="profile-caution">Semantic search is unavailable; these are text matches.</p>}
      {response.completenessWarnings.map((warning, index) => <p key={index} className="profile-caution">{warning}</p>)}
      <div className="profile-grid">{response.results.map((result) => <article className="profile-card" key={result.citationId}>
        <div className="profile-card-head"><h3>{result.title}</h3><span className="profile-badge">{result.quality.band}</span></div>
        <p className="evidence-passage">{result.text}</p>
        <p className="muted">{result.sourceKind.replaceAll("_", " ")} · {result.quality.freshness} · Quality {result.quality.Q}/100</p>
        {result.productVersion && <p className="muted">Product version: {result.productVersion}</p>}
        {result.caveats.map((caveat, index) => <p key={index} className="profile-caution">{caveat}</p>)}
        {result.warnings.map((warning, index) => <p key={index} className="profile-caution">{warning}</p>)}
        <button type="button" className="secondary-button" onClick={() => void openCitation(result)}>View citation</button>
      </article>)}</div>
    </>}
    {selected && <div className="profile-state evidence-citation" role="region" aria-label="Citation detail">
      <div className="profile-card-head"><h3>{selected.title}</h3>
        <button type="button" className="secondary-button" onClick={() => setSelected(null)}>Close citation</button></div>
      {citationState === "loading" && <p role="status">Checking source…</p>}
      {citationState === "stale" && <p role="alert">This citation is no longer available. Search again for current evidence.</p>}
      {citationState === "ready" && <><blockquote>{citationText}</blockquote>
        <ul>{selected.locators.map((locator, index) => <li key={index}>{locatorLabel(locator)}</li>)}</ul>
        <p className="muted">As of {selected.quality.asOf}. Recheck by {selected.quality.validUntil}.</p>
        <p className="muted">Source revision ID: {selected.sourceRevisionId}</p>
        <p className="muted">Quality: reliability {selected.quality.R}, freshness {selected.quality.F}, directness {selected.quality.D}, corroboration {selected.quality.C}. {selected.quality.rationale}</p>
      </>}
    </div>}
  </section>;
}
