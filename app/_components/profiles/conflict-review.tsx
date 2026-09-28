"use client";

import { useState } from "react";

type Fact = { id: string; payload: Record<string, unknown>; kind: string };
type Conflict = { id: string; state: "flagged" | "confirmed"; version: number;
  firstRevisionId: string; secondRevisionId: string; rationale: string };

function label(fact: Fact): string {
  for (const key of ["displayName", "name", "title", "subject", "statement", "text"])
    if (typeof fact.payload[key] === "string") return String(fact.payload[key]).slice(0, 80);
  return fact.kind.replaceAll("_", " ");
}

export function ConflictReview({ customerId, facts, conflicts, canReview, onChanged }: {
  customerId: string; facts: Fact[]; conflicts: Conflict[]; canReview: boolean;
  onChanged: () => void;
}) {
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [reason, setReason] = useState("");
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [resolutionIds, setResolutionIds] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(command: Record<string, unknown>) {
    setSaving(true); setStatus("Saving conflict decision…");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }).then((response) =>
        response.json()) as { data?: { csrfToken: string } };
      if (!session.data?.csrfToken) throw new Error("Sign-in unavailable");
      const response = await fetch(`/api/customers/${customerId}/commands`, {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": session.data.csrfToken },
        body: JSON.stringify({ ...command, requestKey: crypto.randomUUID() }),
      });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) { setStatus(result.error?.message ?? "Conflict decision was not saved."); return; }
      setStatus("Conflict decision saved."); onChanged();
    } catch { setStatus("The result is uncertain. Reload this profile before retrying."); }
    finally { setSaving(false); }
  }

  function flag() {
    if (!firstId || !secondId || firstId === secondId || !reason.trim()) {
      setStatus("Select two different accepted facts and explain the contradiction."); return;
    }
    void submit({ action: "flag_conflict", firstRevisionId: firstId,
      secondRevisionId: secondId, reason: reason.trim() });
  }

  function decide(conflict: Conflict, action: "confirm_conflict" | "resolve_conflict") {
    const rationale = actionReasons[conflict.id]?.trim();
    if (!rationale) { setStatus("Provide a decision rationale."); return; }
    const chosen = resolutionIds[conflict.id];
    if (action === "resolve_conflict" && !chosen) {
      setStatus("Select current resolution evidence after correcting or retracting a conflicting fact."); return;
    }
    void submit({ action, conflictId: conflict.id, expectedVersion: conflict.version,
      rationale, ...(action === "resolve_conflict" ? { resolutionRevisionIds: [chosen] } : {}) });
  }

  const factName = (id: string) => {
    const fact = facts.find((item) => item.id === id);
    return fact ? label(fact) : "No longer current";
  };
  if (facts.length < 2 && conflicts.length === 0) return null;
  return <section className="profile-section" aria-labelledby="profile-conflicts">
    <div className="profile-section-head"><h2 id="profile-conflicts">Evidence conflicts</h2>
      <span>{conflicts.length}</span></div>
    <p className="muted">Flag contradictory accepted facts. A steward confirms the conflict before it blocks their use as support.</p>
    {facts.length >= 2 && <div className="profile-grid"><div className="profile-card">
      <h3>Flag a contradiction</h3>
      <label>First accepted fact<select className="field" value={firstId}
        onChange={(event) => setFirstId(event.target.value)}><option value="">Select a fact</option>
        {facts.map((fact) => <option key={fact.id} value={fact.id}>{label(fact)}</option>)}</select></label>
      <label>Second accepted fact<select className="field" value={secondId}
        onChange={(event) => setSecondId(event.target.value)}><option value="">Select a fact</option>
        {facts.map((fact) => <option key={fact.id} value={fact.id}>{label(fact)}</option>)}</select></label>
      <label>Contradiction reason<textarea className="field" rows={2} value={reason}
        onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" className="secondary-button" disabled={saving} onClick={flag}>Flag conflict</button>
    </div></div>}
    {conflicts.length === 0 ? <p className="muted">No open conflicts.</p> :
      <div className="profile-grid">{conflicts.map((conflict) => <article className="profile-card" key={conflict.id}>
        <h3>{conflict.state === "confirmed" ? "Confirmed conflict" : "Flagged conflict"}</h3>
        <p>{factName(conflict.firstRevisionId)} ↔ {factName(conflict.secondRevisionId)}</p>
        <p className="muted">{conflict.rationale}</p>
        {canReview && <><label>Decision rationale<textarea className="field" rows={2}
          value={actionReasons[conflict.id] ?? ""}
          onChange={(event) => setActionReasons((current) => ({ ...current,
            [conflict.id]: event.target.value }))} /></label>
          {conflict.state === "confirmed" && <label>Current resolution evidence
            <select className="field" value={resolutionIds[conflict.id] ?? ""}
              onChange={(event) => setResolutionIds((current) => ({ ...current,
                [conflict.id]: event.target.value }))}>
              <option value="">Select current evidence</option>
              {facts.map((fact) => <option key={fact.id} value={fact.id}>{label(fact)}</option>)}
            </select></label>}
          <button type="button" className="secondary-button" disabled={saving}
            onClick={() => decide(conflict, conflict.state === "flagged" ? "confirm_conflict" : "resolve_conflict")}>
            {conflict.state === "flagged" ? "Confirm conflict" : "Resolve conflict"}</button></>}
      </article>)}</div>}
    {status && <p role="status">{status}</p>}
  </section>;
}
