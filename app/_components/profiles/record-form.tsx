"use client";

import { titleCaseLabel } from "../title-case-label";

import { useEffect, useMemo, useState } from "react";
import type { RecordKind } from "../../../lib/contracts/profile-payloads";

type Fact = { id: string; recordId: string; kind: string; workloadId: string | null;
  recordVersion: number; payload: Record<string, unknown>;
  audience?: "internal" | "delivery"; dataCategory?: string;
  qualityInput?: Record<string, unknown> };
type Field = { name: string; label: string; type?: "text" | "textarea" | "date" | "number" | "ids" | "select";
  required?: boolean; options?: string[] };
const dimensionNames = ["outcome_ownership", "delivery_collaboration", "experience_adoption",
  "operational_trust", "platform_organization", "innovation_ai"] as const;
const dimensionStates = ["Unknown", "Emerging", "Established", "Measured", "Scaled", "Adaptive"];
const fields: Record<RecordKind, Field[]> = {
  customer_details: [
    { name: "displayName", label: "Customer name", required: true },
    { name: "businessDescription", label: "Business description", type: "textarea" },
    { name: "objectives", label: "Objectives, one per line", type: "ids" },
    { name: "region", label: "Region" }, { name: "aliases", label: "Aliases, one per line", type: "ids" },
  ],
  workload_details: [
    { name: "name", label: "Workload name", required: true },
    { name: "purpose", label: "Purpose", type: "textarea", required: true },
    { name: "ownerReferenceId", label: "Owner record ID" },
    { name: "boundaries", label: "Boundaries", type: "textarea" },
    { name: "mergeTargetId", label: "Merge target workload ID" },
  ],
  stakeholder: [
    { name: "name", label: "Name", required: true }, { name: "role", label: "Role", required: true },
    { name: "responsibilities", label: "Responsibilities", type: "textarea", required: true },
    { name: "contactDetail", label: "Synthetic contact detail" },
    { name: "classification", label: "Classification", type: "select", options: ["internal", "delivery"] },
  ],
  product_use: [
    { name: "productKey", label: "Product key", required: true },
    { name: "displayName", label: "Product name", required: true },
    { name: "state", label: "Use state", type: "select", options: ["actual", "evaluating", "planned", "retired", "unknown"] },
    { name: "usageDescription", label: "How the product is used", type: "textarea", required: true },
    { name: "observedAt", label: "Observed at", type: "date", required: true },
    { name: "ownerReferenceId", label: "Owner record ID" },
    { name: "evidenceRevisionIds", label: "Evidence revision IDs, one per line", type: "ids" },
  ],
  maturity_assessment: [
    { name: "observationStart", label: "Observation start", type: "date", required: true },
    { name: "observationEnd", label: "Observation end", type: "date", required: true },
    { name: "assessor", label: "Assessor", required: true },
    { name: "rationale", label: "Assessment rationale", type: "textarea", required: true },
    { name: "journeyStage", label: "Journey stage", type: "select", options: ["", "Explore", "Activate", "Accelerate", "Optimize", "Scale", "Transform"] },
    { name: "nextCapability", label: "Next capability", type: "textarea", required: true },
    { name: "reviewAt", label: "Review due", type: "date", required: true },
    { name: "evidenceRevisionIds", label: "Assessment evidence IDs, one per line", type: "ids" },
  ],
  risk: [
    { name: "category", label: "Risk category", required: true },
    { name: "description", label: "Description", type: "textarea", required: true },
    { name: "owner", label: "Owner", required: true },
    { name: "likelihood", label: "Likelihood (1–5)", type: "number", required: true },
    { name: "impact", label: "Impact (1–5)", type: "number", required: true },
    { name: "severity", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"] },
    { name: "severityRationale", label: "Severity rationale", type: "textarea", required: true },
    { name: "mitigation", label: "Mitigation", type: "textarea", required: true },
    { name: "status", label: "Status", type: "select", options: ["open", "mitigating", "resolved", "accepted"] },
    { name: "observedAt", label: "Observed at", type: "date", required: true },
    { name: "reviewAt", label: "Review due", type: "date" },
    { name: "evidenceRevisionIds", label: "Evidence revision IDs, one per line", type: "ids" },
  ],
  engagement_reference: [
    { name: "title", label: "Engagement title", required: true },
    { name: "timing", label: "Timing", type: "select", options: ["past", "current", "future"] },
    { name: "deliveryPhase", label: "Delivery phase", required: true },
    { name: "startsAt", label: "Starts at", type: "date" },
    { name: "endsAt", label: "Ends at", type: "date" },
    { name: "referenceId", label: "Reference ID" },
  ],
  decision: [
    { name: "statement", label: "Decision", type: "textarea", required: true },
    { name: "rationale", label: "Rationale", type: "textarea", required: true },
    { name: "effectiveAt", label: "Effective at", type: "date", required: true },
    { name: "accountableOwner", label: "Accountable owner", required: true },
    { name: "evidenceRevisionIds", label: "Evidence revision IDs, one per line", type: "ids" },
  ],
  outcome: [
    { name: "statement", label: "Outcome", type: "textarea", required: true },
    { name: "measure", label: "Measure" }, { name: "unit", label: "Unit" },
    { name: "period", label: "Period" }, { name: "baseline", label: "Baseline", type: "textarea" },
    { name: "comparison", label: "Comparison", type: "textarea" },
    { name: "evidenceRevisionIds", label: "Evidence revision IDs, one per line", type: "ids" },
  ],
  next_review: [
    { name: "subject", label: "Review subject", required: true },
    { name: "recordReferenceId", label: "Related record ID" },
    { name: "owner", label: "Owner", required: true },
    { name: "dueAt", label: "Due at", type: "date", required: true },
    { name: "action", label: "Next action", type: "textarea", required: true },
    { name: "completedAt", label: "Completed at", type: "date" },
  ],
  claim: [
    { name: "title", label: "Short title" },
    { name: "text", label: "Claim", type: "textarea", required: true },
    { name: "sourceUrl", label: "Public HTTPS source URL" },
    { name: "sourceExcerpt", label: "Source excerpt", type: "textarea" },
    { name: "evidenceRevisionIds", label: "Evidence revision IDs, one per line", type: "ids" },
  ],
};
const kinds = Object.keys(fields) as RecordKind[];
const today = () => new Date().toISOString().slice(0, 16);
function initial(kind: RecordKind): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields[kind]) values[field.name] = field.type === "select" ? field.options?.[0] ?? "" : "";
  if (kind === "claim") values.sourceType = "manual";
  if (kind === "maturity_assessment") values.rubricVersion = "customer-maturity-v1";
  for (const field of fields[kind]) if (field.type === "date" && field.required) values[field.name] = today();
  return values;
}
function parsePayload(kind: RecordKind, values: Record<string, string>,
  dimensions: Record<string, Record<string, string>>): Record<string, unknown> {
  const payload: Record<string, unknown> = { kind };
  for (const field of fields[kind]) {
    const value = values[field.name]?.trim() ?? "";
    if (!value && !field.required) continue;
    if (field.type === "date") payload[field.name] = value ? new Date(value).toISOString() : "";
    else if (field.type === "number") payload[field.name] = Number(value);
    else if (field.type === "ids") payload[field.name] = value ? value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean) : [];
    else payload[field.name] = value;
  }
  if (kind === "claim") payload.sourceType = "manual";
  if (kind === "maturity_assessment") {
    payload.rubricVersion = "customer-maturity-v1";
    payload.dimensions = dimensionNames.map((key) => ({ key,
      state: dimensions[key]?.state || "Unknown",
      rationale: dimensions[key]?.rationale || "",
      nextCapability: dimensions[key]?.nextCapability || "",
      evidenceRevisionIds: (dimensions[key]?.evidenceRevisionIds || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
    }));
  }
  return payload;
}

function draftFromFact(fact: Fact): { values: Record<string, string>; dimensions: Record<string, Record<string, string>> } {
  const next = initial(fact.kind as RecordKind);
  for (const field of fields[fact.kind as RecordKind]) {
    const raw = fact.payload[field.name];
    if (typeof raw === "string") next[field.name] = field.type === "date" ? raw.slice(0, 16) : raw;
    else if (Array.isArray(raw)) next[field.name] = raw.join("\n");
    else if (typeof raw === "number") next[field.name] = String(raw);
  }
  const dimensions: Record<string, Record<string, string>> = {};
  if (fact.kind === "maturity_assessment" && Array.isArray(fact.payload.dimensions)) {
    for (const item of fact.payload.dimensions) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      if (typeof value.key !== "string") continue;
      dimensions[value.key] = {
        state: String(value.state ?? "Unknown"), rationale: String(value.rationale ?? ""),
        nextCapability: String(value.nextCapability ?? ""),
        evidenceRevisionIds: Array.isArray(value.evidenceRevisionIds) ? value.evidenceRevisionIds.join("\n") : "",
      };
    }
  }
  return { values: next, dimensions };
}

export function RecordForm({ customerId, workloads, acceptedFacts, onSaved }: {
  customerId: string; workloads: { id: string; displayName: string }[];
  acceptedFacts: Fact[]; onSaved: () => void;
}) {
  const [kind, setKind] = useState<RecordKind>("claim");
  const [values, setValues] = useState<Record<string, string>>(() => initial("claim"));
  const [dimensions, setDimensions] = useState<Record<string, Record<string, string>>>({});
  const [workloadId, setWorkloadId] = useState("");
  const [correctionId, setCorrectionId] = useState("");
  const [audience, setAudience] = useState<"internal" | "delivery">("internal");
  const [category, setCategory] = useState("other_internal");
  const [quality, setQuality] = useState<Record<string, string>>({ R: "0", D: "0", C: "0",
    reliabilityRationale: "Missing reliability input", directnessRationale: "Missing directness input",
    corroborationRationale: "Missing corroboration input", informationType: "unknown", dateBasis: "unknown" });
  const [csrf, setCsrf] = useState("");
  const [memberKind, setMemberKind] = useState<"internal" | "partner" | null>(null);
  const [pendingCommand, setPendingCommand] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json())
      .then((result: { data?: { csrfToken: string; membership: { kind: "internal" | "partner" } } }) => {
        if (!result.data) return;
        setCsrf(result.data.csrfToken); setMemberKind(result.data.membership.kind);
        if (result.data.membership.kind === "partner") { setAudience("delivery"); setCategory("delivery_context"); }
      }).catch(() => setStatus("Sign-in status is unavailable."));
  }, []);
  const existing = useMemo(() => acceptedFacts.filter((fact) => fact.kind === kind &&
    fact.workloadId === (workloadId || null)), [acceptedFacts, kind, workloadId]);

  function changeKind(next: RecordKind) {
    setKind(next); setValues(initial(next)); setDimensions({}); setCorrectionId(""); setPendingCommand(null); setStatus("");
  }
  function useAccepted(fact: Fact) {
    const draft = draftFromFact(fact);
    setValues(draft.values); setDimensions(draft.dimensions); setCorrectionId(fact.recordId);
    if (memberKind === "internal" && fact.audience) {
      setAudience(fact.audience);
      if (fact.audience === "internal" && fact.dataCategory) setCategory(fact.dataCategory);
    }
    if (fact.qualityInput && memberKind === "internal") {
      setQuality((current) => Object.fromEntries(Object.keys(current).map((key) =>
        [key, fact.qualityInput?.[key] === undefined ? current[key] : String(fact.qualityInput[key])])));
    }
    setStatus("Accepted values copied into a new Pending correction draft.");
  }
  async function send(command: Record<string, unknown>) {
    setSaving(true); setPendingCommand(command); setStatus("Submitting a pending proposal…");
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(command) });
      const result = await response.json() as { data?: { reviewState?: string }; error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setPendingCommand(null);
        setStatus(response.status === 409 ? "Profile changed. Your draft is preserved; reload current values before a new proposal." :
          result.error?.message ?? "The proposal was not saved.");
        return;
      }
      setPendingCommand(null); setStatus("Proposal saved as Pending. Accepted context remains unchanged until review.");
      onSaved();
    } catch { setStatus("The result is uncertain. Retry the exact proposal with its retained request key."); }
    finally { setSaving(false); }
  }
  function submit() {
    if (pendingCommand) { void send(pendingCommand); return; }
    if (kind === "maturity_assessment") {
      for (const key of dimensionNames) {
        const state = dimensions[key]?.state ?? "Unknown";
        const hasEvidence = Boolean(dimensions[key]?.evidenceRevisionIds?.trim());
        if (state !== "Unknown" && !hasEvidence) {
          setStatus("Known dimensions require eligible evidence. Add a reviewed source or accepted fact ID.");
          return;
        }
        if (state === "Unknown" && hasEvidence) {
          setStatus("Unknown dimensions cannot cite support. Explain what evidence is missing.");
          return;
        }
      }
    }
    let payload: Record<string, unknown>;
    try { payload = parsePayload(kind, values, dimensions); }
    catch { setStatus("Enter valid dates and required fields."); return; }
    const scope = workloadId || null;
    const selected = existing.find((fact) => fact.recordId === correctionId) ??
      (["customer_details", "workload_details", "maturity_assessment"].includes(kind) ? existing[0] :
        kind === "product_use" ? existing.find((fact) => fact.payload.productKey === String(payload.productKey).toLowerCase()) : undefined);
    const qualityInput = { rubricVersion: "evidence-quality-v1",
      R: Number(quality.R), D: Number(quality.D), C: Number(quality.C),
      reliabilityRationale: quality.reliabilityRationale,
      directnessRationale: quality.directnessRationale,
      corroborationRationale: quality.corroborationRationale,
      informationType: quality.informationType, dateBasis: quality.dateBasis };
    const command: Record<string, unknown> = { requestKey: crypto.randomUUID(),
      action: selected ? "propose_revision" : kind === "workload_details" && !scope ? "propose_workload" : "propose_record",
      payload, qualityInput };
    if (command.action !== "propose_workload") {
      command.workloadId = scope; command.requestedAudience = memberKind === "partner" ? "delivery" : audience;
      command.dataCategory = command.requestedAudience === "delivery" ? "delivery_context" : category;
      command.evidenceRevisionIds = [];
    }
    if (selected) {
      command.recordId = selected.recordId; command.expectedRecordVersion = selected.recordVersion;
      command.expectedAcceptedRevisionId = selected.id;
    }
    void send(command);
  }
  if (!memberKind) return <section className="profile-section profile-form" aria-label="Customer context proposal">
    <p role="status">Loading proposal permissions…</p></section>;
  return <section className="profile-section profile-form" aria-labelledby="profile-proposal-heading">
    <div className="profile-section-head"><h2 id="profile-proposal-heading">Propose Customer Context</h2></div>
    <p className="muted">Your submission stays Pending until a steward accepts it. A correction does not replace the current fact before review.</p>
    <div className="profile-form-grid"><label>Record type<select className="field" value={kind} disabled={saving || Boolean(pendingCommand)}
      onChange={(event) => changeKind(event.target.value as RecordKind)}>{kinds.filter((item) => memberKind === "internal" || item !== "workload_details")
        .map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      {kind !== "customer_details" && <label>Workload<select className="field" value={workloadId}
        disabled={saving || Boolean(pendingCommand)} onChange={(event) => { setWorkloadId(event.target.value); setCorrectionId(""); }}>
        <option value="">Customer-wide{kind === "workload_details" ? " / new workload" : ""}</option>
        {workloads.map((workload) => <option key={workload.id} value={workload.id}>{workload.displayName}</option>)}</select></label>}
      {!["customer_details", "workload_details", "maturity_assessment", "product_use"].includes(kind) && existing.length > 0 &&
        <label>Correction target<select className="field" value={correctionId} disabled={saving || Boolean(pendingCommand)}
          onChange={(event) => setCorrectionId(event.target.value)}><option value="">New record</option>
          {existing.map((fact) => <option key={fact.recordId} value={fact.recordId}>{String(fact.payload.title ?? fact.payload.name ?? fact.payload.statement ?? fact.recordId)}</option>)}</select></label>}
      {memberKind === "internal" && commandAudienceFields(audience, setAudience, category, setCategory, saving || Boolean(pendingCommand))}
    </div>
    {existing.length > 0 && <div className="profile-correction-options"><h3>Accepted Context</h3>
      <p className="muted">Use an accepted record as the starting point for a correction. It remains visible until the correction is reviewed.</p>
      {existing.map((fact) => <button key={fact.recordId} type="button" className="secondary-button"
        disabled={saving || Boolean(pendingCommand)} onClick={() => useAccepted(fact)}>
        Correct {String(fact.payload.displayName ?? fact.payload.name ?? fact.payload.title ?? fact.payload.statement ?? fact.recordId)}
      </button>)}</div>}
    <div className="profile-form-grid">{fields[kind].map((field) => <label key={field.name}>{field.label}
      {field.type === "textarea" || field.type === "ids" ? <textarea className="field" rows={field.type === "ids" ? 2 : 3}
        value={values[field.name] ?? ""} required={field.required} disabled={saving || Boolean(pendingCommand)}
        onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /> :
        field.type === "select" ? <select className="field" value={values[field.name] ?? ""}
          disabled={saving || Boolean(pendingCommand)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>
          {field.options?.map((option) => <option key={option} value={option}>{option || "Not assessed"}</option>)}</select> :
          <input className="field" type={field.type === "date" ? "datetime-local" : field.type === "number" ? "number" : "text"}
            min={field.type === "number" ? 1 : undefined} max={field.type === "number" ? 5 : undefined}
            value={values[field.name] ?? ""} required={field.required} disabled={saving || Boolean(pendingCommand)}
            onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />}</label>)}</div>
    {kind === "maturity_assessment" && <div className="profile-dimensions"><h3>Independent Maturity Dimensions</h3>
      {dimensionNames.map((key) => <fieldset key={key} className="profile-card"><legend>{titleCaseLabel(key)}</legend>
        <div className="profile-form-grid"><label>State<select className="field" value={dimensions[key]?.state ?? "Unknown"}
          disabled={saving || Boolean(pendingCommand)} onChange={(event) => setDimensions((current) => ({ ...current,
            [key]: { ...current[key], state: event.target.value } }))}>{dimensionStates.map((state) => <option key={state}>{state}</option>)}</select></label>
          {(["rationale", "nextCapability", "evidenceRevisionIds"] as const).map((name) => <label key={name}>{name.replace(/([A-Z])/g, " $1")}
            <textarea className="field" rows={2} value={dimensions[key]?.[name] ?? ""}
              disabled={saving || Boolean(pendingCommand)} onChange={(event) => setDimensions((current) => ({ ...current,
                [key]: { ...current[key], [name]: event.target.value } }))} /></label>)}</div></fieldset>)}</div>}
    <fieldset className="profile-quality"><legend>Proposed Evidence Quality</legend>
      <p className="muted">R, D and C are proposed inputs. The server calculates freshness and the final score.</p>
      <div className="profile-form-grid">{(["R", "D", "C"] as const).map((name) => <label key={name}>{name} (0–4)<input className="field" type="number" min={0} max={4}
        value={quality[name]} disabled={saving || Boolean(pendingCommand)} onChange={(event) => setQuality((current) => ({ ...current, [name]: event.target.value }))} /></label>)}
        {(["reliabilityRationale", "directnessRationale", "corroborationRationale"] as const).map((name) => <label key={name}>{name.replace(/([A-Z])/g, " $1")}
          <textarea className="field" rows={2} value={quality[name]}
            disabled={saving || Boolean(pendingCommand)} onChange={(event) => setQuality((current) => ({ ...current, [name]: event.target.value }))} /></label>)}
        <label>Information type<select className="field" value={quality.informationType}
          disabled={saving || Boolean(pendingCommand)} onChange={(event) => setQuality((current) => ({ ...current, informationType: event.target.value }))}>
          {["unknown", "account_status", "product_availability", "product_capability", "adoption_process", "architecture"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Date basis<select className="field" value={quality.dateBasis}
          disabled={saving || Boolean(pendingCommand)} onChange={(event) => setQuality((current) => ({ ...current, dateBasis: event.target.value }))}>
          {["unknown", "observation", "publication"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    </fieldset>
    {status && <p role="status" className="profile-form-status">{status}</p>}
    <div className="profile-review-actions"><button type="button" className="primary-button" disabled={saving || !csrf}
      onClick={submit}>{pendingCommand ? "Retry exact proposal" : "Save as Pending"}</button>
      {pendingCommand && <button type="button" className="secondary-button" disabled={saving}
        onClick={() => { setPendingCommand(null); setStatus("Draft retained. A new request key will be used."); }}>Start a new request</button>}</div>
  </section>;
}

function commandAudienceFields(audience: "internal" | "delivery", setAudience: (value: "internal" | "delivery") => void,
  category: string, setCategory: (value: string) => void, disabled: boolean) {
  return <><label>Requested audience<select className="field" value={audience} disabled={disabled}
    onChange={(event) => setAudience(event.target.value as "internal" | "delivery")}>
    <option value="internal">Internal</option><option value="delivery">Delivery</option></select></label>
    {audience === "internal" && <label>Data category<select className="field" value={category}
      disabled={disabled} onChange={(event) => setCategory(event.target.value)}>
      {["other_internal", "internal_operations", "commercial", "personnel", "delivery_context"].map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>}</>;
}
