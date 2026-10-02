"use client";

import { useState } from "react";

type Unit = { id: string; ordinal: number; text: string; locator: { kind: string } };
type Source = { id: string; publishedRunId: string | null; lifecycleGeneration: number;
  state: string; canPropose: boolean };

export function EvidenceSelection({ source, units }: { source: Source; units: Unit[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [claim, setClaim] = useState("");
  const [audience, setAudience] = useState<"internal" | "delivery">("internal");
  const [dataCategory, setDataCategory] = useState("other_internal");
  const [informationType, setInformationType] = useState("unknown");
  const [dateBasis, setDateBasis] = useState("unknown");
  const [scores, setScores] = useState({ R: 0, D: 0, C: 0 });
  const [rationales, setRationales] = useState({ reliabilityRationale: "", directnessRationale: "",
    corroborationRationale: "" });
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const chosen = units.filter((unit) => selected.includes(unit.id));
  const excerpt = chosen.map((unit) => unit.text).join("\n");
  const count = Array.from(excerpt).length;
  const valid = Boolean(source.publishedRunId && claim.trim() && selected.length &&
    selected.length <= 20 && count <= 8_000 && Object.values(rationales).every((value) => value.trim()));
  function changeSelected(id: string, checked: boolean) {
    setSelected((current) => checked ? [...current, id] : current.filter((item) => item !== id));
    setRequestKey(null);
  }
  async function submit() {
    if (!valid || !source.publishedRunId) return;
    setSaving(true); setMessage("Submitting exact proposal…");
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    try {
      const bytes = new TextEncoder().encode(excerpt);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const excerptDigest = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) throw new Error("Session unavailable");
      const auth = await session.json() as { data: { csrfToken: string } };
      const response = await fetch(`/api/artifacts/${source.id}/proposals`, { method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": auth.data.csrfToken },
        body: JSON.stringify({ selection: { versionId: source.id, runId: source.publishedRunId,
          lifecycleGeneration: source.lifecycleGeneration,
          ranges: chosen.map((unit) => ({ unitId: unit.id, start: 0, end: Array.from(unit.text).length })),
          excerpt, excerptDigest, audience, dataCategory },
        command: { action: "propose_record", requestKey: key, requestedAudience: audience,
          dataCategory, payload: { kind: "claim", text: claim.trim(), sourceType: "manual" },
          qualityInput: { rubricVersion: "evidence-quality-v1", ...scores, ...rationales,
            informationType, dateBasis } } }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setRequestKey(null);
        setMessage(result.error?.message ?? "Proposal could not be submitted."); return;
      }
      setMessage("Submitted as Pending for review. The excerpt is not an accepted fact.");
    } catch { setMessage("Result uncertain. Retry with the same selection and request key."); }
    finally { setSaving(false); }
  }
  return <section className="profile-card" aria-label="Propose source evidence">
    <h3>Propose Evidence for Review</h3>
    <p>Select exact units from this source. The proposal stays Pending until a reviewer accepts it.</p>
    <p className="profile-caution">A reviewer may inspect the original file after submission. Confirm that it may be shared with the customer profile reviewers.</p>
    <fieldset><legend>Exact Source Units</legend>{units.map((unit) => <label key={unit.id} className="profile-check">
      <input type="checkbox" checked={selected.includes(unit.id)}
        onChange={(event) => changeSelected(unit.id, event.target.checked)} />
      Unit {unit.ordinal} ({unit.locator.kind}): {unit.text.slice(0, 120)}
    </label>)}</fieldset>
    <p>{selected.length} units · {count}/8,000 characters. Load more units above if needed.</p>
    {chosen.length > 0 && <div><h4>Exact Excerpt Preview</h4><pre className="source-excerpt-preview">{excerpt}</pre></div>}
    <label className="field-label" htmlFor={`artifact-claim-${source.id}`}>Claim to review</label>
    <textarea id={`artifact-claim-${source.id}`} className="field" maxLength={8000} rows={3}
      value={claim} onChange={(event) => { setClaim(event.target.value); setRequestKey(null); }} />
    <label className="field-label" htmlFor={`artifact-audience-${source.id}`}>Audience</label>
    <select id={`artifact-audience-${source.id}`} className="field" value={audience} onChange={(event) => {
      const value = event.target.value as "internal" | "delivery"; setAudience(value);
      setDataCategory(value === "delivery" ? "delivery_context" : "other_internal"); setRequestKey(null);
    }}><option value="internal">Internal</option><option value="delivery">Delivery</option></select>
    {audience === "internal" && <><label className="field-label" htmlFor={`artifact-category-${source.id}`}>Data category</label>
      <select id={`artifact-category-${source.id}`} className="field" value={dataCategory}
        onChange={(event) => { setDataCategory(event.target.value); setRequestKey(null); }}>
        {[["other_internal","Other internal"],["internal_operations","Internal operations"],
          ["commercial","Commercial"],["personnel","Personnel"],["delivery_context","Delivery context"]]
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></>}
    <label className="field-label" htmlFor={`artifact-type-${source.id}`}>Information type</label>
    <select id={`artifact-type-${source.id}`} className="field" value={informationType}
      onChange={(event) => { setInformationType(event.target.value); setRequestKey(null); }}>
      {[["unknown","Unknown"],["account_status","Account status"],["product_availability","Product availability"],
        ["product_capability","Product capability"],["adoption_process","Adoption process"],["architecture","Architecture"]]
        .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <label className="field-label" htmlFor={`artifact-date-${source.id}`}>Date basis</label>
    <select id={`artifact-date-${source.id}`} className="field" value={dateBasis}
      onChange={(event) => { setDateBasis(event.target.value); setRequestKey(null); }}>
      <option value="unknown">Unknown</option><option value="observation">Observation</option>
      <option value="publication">Publication</option></select>
    {(["R", "D", "C"] as const).map((key) => <div key={key}>
      <label className="field-label" htmlFor={`artifact-score-${key}-${source.id}`}>{key} score (0–4)</label>
      <select id={`artifact-score-${key}-${source.id}`} className="field" value={scores[key]}
        onChange={(event) => { setScores((value) => ({ ...value, [key]: Number(event.target.value) })); setRequestKey(null); }}>
        {[0,1,2,3,4].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>)}
    {(["reliabilityRationale", "directnessRationale", "corroborationRationale"] as const).map((key) =>
      <div key={key}><label className="field-label" htmlFor={`artifact-${key}-${source.id}`}>
        {key.replace("Rationale", " rationale")}</label><textarea id={`artifact-${key}-${source.id}`}
        className="field" maxLength={2000} rows={2} value={rationales[key]}
        onChange={(event) => { setRationales((value) => ({ ...value, [key]: event.target.value })); setRequestKey(null); }} /></div>)}
    {message && <p role="status">{message}</p>}
    <button type="button" className="primary-button" disabled={!valid || saving}
      onClick={() => void submit()}>Submit Pending proposal</button>
  </section>;
}
