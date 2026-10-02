"use client";

import { useEffect, useState } from "react";

type Assignment = { membershipId: string; displayName: string; active: boolean; version: number };
type Account = { displayName: string; membership: { id: string; kind: string; active: boolean } };

export function StewardEditor({ customerId, refresh }: { customerId: string; refresh: number }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [admin, setAdmin] = useState(false);
  const [csrf, setCsrf] = useState("");
  const [selected, setSelected] = useState("");
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState<{ memberId: string; action: string; key: string } | null>(null);
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/customers/${customerId}/stewards`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
    ]).then(async ([assignmentResponse, authResponse]) => {
      if (!assignmentResponse.ok || !authResponse.ok) throw new Error("Unavailable");
      const assignmentResult = await assignmentResponse.json() as { data: { items: Assignment[] } };
      const authResult = await authResponse.json() as { data: { csrfToken: string;
        membership: { role: string; kind: string } } };
      setAssignments(assignmentResult.data.items); setCsrf(authResult.data.csrfToken);
      const canAdmin = authResult.data.membership.kind === "internal" &&
        authResult.data.membership.role === "admin";
      setAdmin(canAdmin);
      if (canAdmin) {
        const response = await fetch("/api/admin/access?limit=50", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const result = await response.json() as { data: { accounts: Account[] } };
          setAccounts(result.data.accounts.filter((account) => account.membership.kind === "internal" &&
            account.membership.active));
        }
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Steward assignments are unavailable.");
    });
    return () => controller.abort();
  }, [customerId, refresh, version]);

  async function change(memberId: string, action: "assign_steward" | "revoke_steward") {
    if (!rationale.trim()) { setStatus("Provide an assignment rationale."); return; }
    const key = pending?.key ?? crypto.randomUUID();
    setPending({ memberId, action, key }); setStatus("Saving assignment…");
    const assignment = assignments.find((item) => item.membershipId === memberId);
    try {
      const response = await fetch(`/api/customers/${customerId}/commands`, { method: "POST",
        cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ action, requestKey: key, membershipId: memberId,
          expectedAssignmentVersion: assignment?.version ?? 0, rationale: rationale.trim() }) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) setPending(null);
        setStatus(result.error?.message ?? "Assignment was not saved."); return;
      }
      setPending(null); setStatus(action === "assign_steward" ? "Steward assigned." : "Steward revoked.");
      setVersion((value) => value + 1);
    } catch { setStatus("The result is uncertain. Retry the same assignment with its key."); }
  }
  return <section className="profile-section" aria-labelledby="profile-stewards">
    <div className="profile-section-head"><h2 id="profile-stewards">Customer Stewards</h2></div>
    {assignments.length === 0 && <p className="muted">No active steward is assigned.</p>}
    <div className="profile-grid">{assignments.map((item) => <article className="profile-card" key={item.membershipId}>
      <div className="profile-card-head"><h3>{item.displayName}</h3><span className="profile-badge">{item.active ? "Active" : "Revoked"}</span></div>
      {admin && item.active && <button type="button" className="secondary-button" disabled={Boolean(pending && pending.memberId !== item.membershipId)}
        onClick={() => void change(item.membershipId, "revoke_steward")}>Revoke stewardship</button>}
    </article>)}</div>
    {admin && <div className="profile-steward-controls"><label className="field-label" htmlFor="steward-person">Internal member</label>
      <select id="steward-person" className="field" value={selected} disabled={Boolean(pending)}
        onChange={(event) => setSelected(event.target.value)}><option value="">Select a member</option>
        {accounts.map((account) => <option key={account.membership.id} value={account.membership.id}>{account.displayName}</option>)}</select>
      <label className="field-label" htmlFor="steward-rationale">Assignment rationale</label>
      <textarea id="steward-rationale" className="field" rows={2} value={rationale}
        disabled={Boolean(pending)} onChange={(event) => setRationale(event.target.value)} />
      <button type="button" className="secondary-button" disabled={!selected || !csrf || Boolean(pending && pending.memberId !== selected)}
        onClick={() => void change(selected, "assign_steward")}>Assign stewardship</button></div>}
    {status && <p role="status">{status}</p>}
  </section>;
}
