"use client";

import { useEffect,useState } from "react";

type Fact = { id: string; payload: Record<string, unknown>; kind: string };
type Conflict = { id: string; state: "flagged" | "confirmed"; version: number;
  firstRevisionId: string; secondRevisionId: string; rationale: string };

function label(fact: Fact): string {
  for (const key of ["displayName", "name", "title", "subject", "statement", "text"])
    if (typeof fact.payload[key] === "string") return String(fact.payload[key]).slice(0, 80);
  return fact.kind.replaceAll("_", " ");
}

type TypedConflict = { id: string; first: { kind: string; revisionId: string };
  second: { kind: string; revisionId: string }; state: string; version: number;
  periodStart: string; periodEnd: string; rationale: string };

export function TypedConflictReview({ customerId,canReview,scopeKind = "customer" }: {
  customerId?: string;canReview: boolean;scopeKind?: "customer" | "shared";
}) {
  const [items,setItems] = useState<TypedConflict[]>([]);
  const [firstKind,setFirstKind] = useState("accepted_profile");
  const [secondKind,setSecondKind] = useState("verified_research");
  const [firstId,setFirstId] = useState("");
  const [secondId,setSecondId] = useState("");
  const [start,setStart] = useState("");
  const [end,setEnd] = useState("");
  const [rationale,setRationale] = useState("");
  const [decisionReasons,setDecisionReasons] = useState<Record<string,string>>({});
  const [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  const [version,setVersion] = useState(0);
  const [open,setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/research/conflicts?scope=${scopeKind}${customerId ?
      `&customerId=${encodeURIComponent(customerId)}` : ""}`,
      { cache: "no-store" }).then(async (response) => {
      const envelope = await response.json() as { data?: TypedConflict[] };
      if (active && response.ok && envelope.data) setItems(envelope.data);
    }).catch(() => { if (active) setStatus("Conflict status is unavailable."); });
    return () => { active = false; };
  },[customerId,scopeKind,version]);
  async function write(path: string,body: unknown) {
    setBusy(true);setStatus("Saving conflict review…");
    try {
      const authResponse = await fetch("/api/auth/session",{ cache: "no-store" });
      const auth = await authResponse.json() as { data?: { csrfToken: string } };
      if (!authResponse.ok || !auth.data?.csrfToken) throw new Error("Sign in again.");
      const response = await fetch(path,{ method: "POST",cache: "no-store",
        headers: { "content-type": "application/json","x-csrf-token": auth.data.csrfToken },
        body: JSON.stringify(body) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Conflict review unavailable");
      setVersion((value) => value+1);setStatus("Conflict review saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Conflict review unavailable"); }
    finally { setBusy(false); }
  }
  const kinds = scopeKind === "shared" ? ["published_shared"] :
    ["accepted_profile","verified_research","published_shared"];
  return <section className="profile-section" aria-label="Typed evidence conflicts">
    <div className="profile-section-head"><h2>Source conflicts</h2></div>
    <p className="muted">Flag two current source revisions covering the same period. A steward confirms a material conflict before current fact answers are blocked.</p>
    <button className="secondary-button" type="button" aria-expanded={open}
      onClick={() => setOpen((value) => !value)}>{open ? "Close conflict form" : "Flag source conflict"}</button>
    {open && <form className="profile-card" onSubmit={(event) => {
      event.preventDefault();void write("/api/research/conflicts",{
        idempotencyKey: crypto.randomUUID(),scope: scopeKind,
        ...(customerId ? { customerId } : {}),
        first: { kind: scopeKind === "shared" ? "published_shared" : firstKind,
          revisionId: firstId },
        second: { kind: scopeKind === "shared" ? "published_shared" : secondKind,
          revisionId: secondId },
        periodStart: start,periodEnd: end,rationale });
    }}>
      <label>First source type<select className="field" value={firstKind}
        onChange={(event) => setFirstKind(event.target.value)}>{kinds.map((kind) =>
          <option key={kind} value={kind}>{kind.replaceAll("_"," ")}</option>)}</select></label>
      <label>First source revision ID<input className="field" required value={firstId}
        onChange={(event) => setFirstId(event.target.value)} /></label>
      <label>Second source type<select className="field" value={secondKind}
        onChange={(event) => setSecondKind(event.target.value)}>{kinds.map((kind) =>
          <option key={kind} value={kind}>{kind.replaceAll("_"," ")}</option>)}</select></label>
      <label>Second source revision ID<input className="field" required value={secondId}
        onChange={(event) => setSecondId(event.target.value)} /></label>
      <label>Period start<input className="field" type="date" required value={start}
        onChange={(event) => setStart(event.target.value)} /></label>
      <label>Period end<input className="field" type="date" required value={end}
        onChange={(event) => setEnd(event.target.value)} /></label>
      <label>Reason<textarea className="field" required maxLength={2_000} value={rationale}
        onChange={(event) => setRationale(event.target.value)} /></label>
      <button className="secondary-button" type="submit" disabled={busy}>Flag source conflict</button>
    </form>}
    {!items.length && <p className="muted">No source conflicts are visible.</p>}
    {items.map((item) => <article className="profile-card" key={item.id}>
      <h3>{item.state} source conflict</h3>
      <p>{item.first.kind.replaceAll("_"," ")} {item.first.revisionId} ↔ {item.second.kind.replaceAll("_"," ")} {item.second.revisionId}</p>
      <p>{item.periodStart}–{item.periodEnd}. {item.rationale}</p>
      {canReview && ["flagged","confirmed"].includes(item.state) && <><label>
        Decision reason<textarea className="field" required maxLength={2_000}
          value={decisionReasons[item.id] ?? ""}
          onChange={(event) => setDecisionReasons((current) => ({ ...current,
            [item.id]: event.target.value }))} /></label><button type="button"
        className="secondary-button" disabled={busy || !decisionReasons[item.id]?.trim()}
        onClick={() => void write(`/api/research/conflicts/${item.id}/decisions`,{
          idempotencyKey: crypto.randomUUID(),expectedVersion: item.version,
          action: item.state === "flagged" ? "confirm" : "resolve",
          rationale: (decisionReasons[item.id] ?? "").trim() })}>
        {item.state === "flagged" ? "Confirm conflict" : "Resolve after source correction"}</button></>}
    </article>)}
    {status && <p role="status">{status}</p>}
  </section>;
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
