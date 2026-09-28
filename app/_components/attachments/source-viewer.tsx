"use client";

import { useEffect, useState } from "react";
import { EvidenceSelection } from "./evidence-selection";
import { LifecycleActions } from "./lifecycle-actions";

type Unit = { id: string; ordinal: number; text: string; locator: { kind: string };
  origin: string; ocrConfidence: number | null; hidden: boolean; formula: string | null };
type Source = { id: string; publishedRunId: string | null; lifecycleGeneration: number;
  canPropose: boolean; canManageLifecycle: boolean; submitted: boolean;
  displayName: string; state: string; coverage: { total: number | null; visited: number;
  omitted: Array<{ kind: string; count: number; reason: string }> } | null };
export type DraftSourceSelection = { versionId: string; runId: string; lifecycleGeneration: number;
  ranges: Array<{ unitId: string; start: number; end: number }> };

export function SourceViewer({ versionId, onClose, onDraftSelection }: { versionId: string;
  onClose: () => void; onDraftSelection?: (selection: DraftSourceSelection | null) => void }) {
  const [source, setSource] = useState<Source | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [draftUnitIds, setDraftUnitIds] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void fetch(`/api/artifacts/${versionId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Source unavailable");
      const next = (await response.json() as { data: Source }).data;
      if (active) { setSource(next); if (!["ready","partial"].includes(next.state)) setUnits([]); }
    }).catch(() => { if (active) setNotice("Source unavailable"); });
    return () => { active = false; };
  }, [versionId,refresh]);
  async function load(next: string | null) {
    try {
      const response = await fetch(`/api/artifacts/${versionId}/units?limit=25${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
        { cache: "no-store" });
      if (!response.ok) throw new Error();
      const page = (await response.json() as { data: { items: Unit[]; nextCursor: string | null } }).data;
      setUnits((current) => next ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch { setUnits([]); setNotice("Source text is unavailable. Reload to check access."); }
  }
  useEffect(() => { void load(null); }, [versionId]);
  return <div className="source-viewer" role="dialog" aria-modal="false" aria-label="Source viewer">
    <div className="source-viewer-heading"><h2>{source?.displayName ?? "Source"}</h2>
      <button type="button" className="secondary-button" onClick={onClose}>Close</button></div>
    {source?.state === "partial" && <p role="status">Extraction is partial. Review omitted coverage before citing this source.</p>}
    {source?.coverage?.omitted.map((omission, index) => <p key={index} className="state-message">
      {omission.count} {omission.kind} omitted: {omission.reason}</p>)}
    {notice && <p role="alert">{notice}</p>}
    <ol className="source-units">{["ready","partial"].includes(source?.state ?? "") && units.map((item) => <li key={item.id}>
      <p className="muted">Unit {item.ordinal} · {item.locator.kind} · {item.origin}
        {item.ocrConfidence !== null ? ` · OCR ${item.ocrConfidence.toFixed(0)}%` : ""}
        {item.hidden ? " · hidden source" : ""}</p>
      {onDraftSelection && <label className="profile-check"><input type="checkbox"
        checked={draftUnitIds.includes(item.id)} onChange={(event) => setDraftUnitIds((current) =>
          event.target.checked ? [...current,item.id] : current.filter((id) => id !== item.id))} />
        Include unit {item.ordinal} in draft chat context</label>}
      <p>{item.text}</p>{item.formula && <p className="muted">Formula (not calculated): {item.formula}</p>}
    </li>)}</ol>
    {cursor && <button type="button" className="secondary-button" onClick={() => void load(cursor)}>More units</button>}
    {onDraftSelection && source?.publishedRunId && <div>
      <p className="muted">Selected source text is unverified and will be cited only in this private chat.</p>
      <button type="button" className="secondary-button" onClick={() => {
        const chosen = units.filter((unit) => draftUnitIds.includes(unit.id));
        if (!chosen.length) { onDraftSelection(null); setNotice("Source removed from draft selection."); return; }
        if (chosen.length > 20 || chosen.reduce((sum,unit) => sum + Array.from(unit.text).length,0) > 12_000) {
          setNotice("Select at most 20 units and 12,000 characters."); return;
        }
        onDraftSelection({ versionId: source.id, runId: source.publishedRunId!,
          lifecycleGeneration: source.lifecycleGeneration,
          ranges: chosen.map((unit) => ({ unitId: unit.id,start: 0,end: Array.from(unit.text).length })) });
        setNotice("Exact units added to draft chat context.");
      }}>Use selected units in chat</button></div>}
    {source?.canPropose && source.publishedRunId &&
      <EvidenceSelection source={source} units={units} />}
    {source && <LifecycleActions source={source} onChanged={() => {
      setUnits([]); setDraftUnitIds([]); onDraftSelection?.(null);
      setRefresh((value) => value + 1);
    }} />}
    {source && ["ready","partial"].includes(source.state) &&
      <a className="secondary-button" href={`/api/artifacts/${versionId}/original`} download>Download original</a>}
  </div>;
}
