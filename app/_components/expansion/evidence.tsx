"use client";
import { useState } from "react";
import type { ExpansionSource } from "../../../lib/server/expansion/schema";
type Result = { title: string; text: string; asOf: string | null; quality: { band: string }; caveats: string[]; reference: ExpansionSource };
export function ExpansionEvidence({ customerId, workloadId, csrfToken, selected, onChange, onInspect }: {
  customerId: string; workloadId: string | null; csrfToken: string; selected: ExpansionSource[];
  onChange: (sources: ExpansionSource[]) => void; onInspect: (source: ExpansionSource) => void;
}) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<Result[]>([]), [status, setStatus] = useState('');
  async function search() {
    setStatus('Searching eligible evidence…'); setResults([]);
    try { const params=new URLSearchParams({query,limit:'10'});if(workloadId)params.set('workloadId',workloadId);
      const response = await fetch(`/api/expansion/customers/${customerId}/evidence?${params}`,{cache:'no-store'});
      const body = await response.json() as { data?: { results: Result[] }; error?: { message: string } };
      if (!response.ok || !body.data) throw Error(body.error?.message ?? 'Evidence unavailable'); setResults(body.data.results);
      setStatus(body.data.results.length ? '' : 'No eligible evidence found. Unknowns can remain explicit.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Evidence unavailable'); }
  }
  return <section className="profile-section" aria-labelledby="expansion-evidence-title"><h2 id="expansion-evidence-title">Evidence Selection</h2>
    <label htmlFor="expansion-evidence-query">Search Customer and Shared Evidence<input className="field" id="expansion-evidence-query" maxLength={500} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <button className="secondary-button" type="button" disabled={!query.trim()} onClick={() => void search()}>Search Evidence</button>
    {status && <p role="status">{status}</p>}
    {results.map(item => <article className="profile-card" key={item.reference.id}><h3>{item.title}</h3><p>{item.text}</p>
      <p>Original Date: {item.asOf??"Unknown"} · Quality: {item.quality.band}</p>{item.caveats.map(caveat => <p key={caveat}>{caveat}</p>)}
      <button className="secondary-button" type="button" onClick={() => onInspect(item.reference)}>Inspect Source</button>
      <button className="secondary-button" type="button" disabled={selected.length >= 20 || selected.some(ref => ref.kind === item.reference.kind && ref.sourceRevisionId === item.reference.sourceRevisionId)}
        onClick={() => onChange([...selected, item.reference])}>Select Evidence</button></article>)}
    <ul>{selected.map((source, index) => <li key={source.id}>Evidence {index + 1}: {source.kind.replaceAll('_', ' ')}
      <button className="secondary-button" type="button" onClick={() => onInspect(source)}>Inspect Selected Source {index + 1}</button>
      <button className="secondary-button" type="button" onClick={() => onChange(selected.filter(ref => ref.id !== source.id))}>Remove Evidence {index + 1}</button></li>)}</ul>
  </section>;
}
