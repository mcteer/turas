"use client";

import { useEffect, useState } from "react";

type Account = {
  id: string; loginName: string; active: boolean;
  membership: { id: string; kind: string; role: string; active: boolean; revision: number };
};
type Grant = { membershipId: string; customerId: string; state: "active" | "revoked"; revision: number };
type Customer = { id: string; displayName: string };

export function AccessEditor({ csrfToken }: { csrfToken: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [accessResponse, customersResponse] = await Promise.all([
        fetch("/api/admin/access", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
      ]);
      if (!accessResponse.ok || !customersResponse.ok) throw new Error();
      const access = await accessResponse.json() as { data: { accounts: Account[]; grants: Grant[] } };
      const directory = await customersResponse.json() as { data: { items: Customer[] } };
      setAccounts(access.data.accounts);
      setGrants(access.data.grants);
      setCustomers(directory.data.items);
    } catch {
      setError("Access data is unavailable. Reload to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function updateMembership(account: Account) {
    setError("");
    const response = await fetch(`/api/admin/memberships/${account.membership.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ active: !account.membership.active,
        expectedRevision: account.membership.revision, requestKey: crypto.randomUUID() }),
    });
    const message = response.ok ? "" : response.status === 409 ? "Access changed. Reload and retry." : "Access update failed.";
    await load();
    if (message) setError(message);
  }

  async function updateGrant(account: Account, customerId: string, existing?: Grant) {
    setError("");
    const next = existing?.state === "active" ? "revoked" : "active";
    const response = await fetch(`/api/admin/grants/${account.membership.id}/${customerId}`, {
      method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ state: next, expectedRevision: existing?.revision ?? 0,
        requestKey: crypto.randomUUID() }),
    });
    const message = response.ok ? "" : response.status === 409 ? "Grant changed. Reload and retry." : "Grant update failed.";
    await load();
    if (message) setError(message);
  }

  return (
    <main style={{ maxWidth: 900, margin: "5vh auto", padding: 24 }}>
      <h1>Access</h1>
      <p>Manage demo account membership and partner customer assignments.</p>
      {loading && <p role="status">Loading access…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Reload</button></p>}
      {accounts.map((account) => (
        <section key={account.id} aria-label={`${account.loginName} access`}>
          <h2>{account.loginName}</h2>
          <p>{account.membership.kind} · {account.membership.role} · {account.membership.active ? "Active" : "Disabled"}</p>
          <button type="button" onClick={() => void updateMembership(account)}>
            {account.membership.active ? "Disable" : "Enable"} {account.loginName}
          </button>
          {account.membership.kind === "partner" && <div>
            <label htmlFor={`customer-${account.id}`}>Customer assignment</label>{" "}
            <select id={`customer-${account.id}`} value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
              <option value="">Choose a customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
            </select>{" "}
            <button type="button" disabled={!selectedCustomer} onClick={() => void updateGrant(account, selectedCustomer,
              grants.find((grant) => grant.membershipId === account.membership.id && grant.customerId === selectedCustomer))}>
              Toggle assignment
            </button>
            <ul>{grants.filter((grant) => grant.membershipId === account.membership.id).map((grant) => (
              <li key={grant.customerId}>{customers.find((customer) => customer.id === grant.customerId)?.displayName ?? grant.customerId}: {grant.state}</li>
            ))}</ul>
          </div>}
        </section>
      ))}
    </main>
  );
}
