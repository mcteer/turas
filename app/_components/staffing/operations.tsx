"use client";
import { useEffect, useRef, useState } from "react";
import type { readStaffingOperations } from "../../../lib/server/staffing/operations";
import { staffingGet } from "./client";
import { EmptyState } from "../empty-state";
type Report = Awaited<ReturnType<typeof readStaffingOperations>>;
type Customers = { items: { id: string; displayName: string }[]; nextCursor: string | null };
export function StaffingOperations() {
  const [customers, setCustomers] = useState<Customers>({ items: [], nextCursor: null });
  const [customerId, setCustomer] = useState(""), [fromDate, setFrom] = useState(""), [toDate, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const generation = useRef(0), query = useRef({ customerId: "", fromDate: "", toDate: "" });
  async function loadCustomers(cursor?: string) {
    setBusy(true);
    try {
      const next = await staffingGet<Customers>(`/api/customers?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setCustomers(old => cursor ? { ...next, items: [...new Map([...old.items, ...next.items].map(item => [item.id, item])).values()] } : next); setError("");
    } catch { setCustomers({ items: [], nextCursor: null }); setError("Customer choices unavailable. Reload to check current access."); }
    finally { setBusy(false); }
  }
  async function load(cursor?: string) {
    const captured = ++generation.current;
    setBusy(true); setError("");
    try {
      const scope = cursor ? query.current : { customerId, fromDate, toDate };
      const params = new URLSearchParams(scope); if (cursor) params.set("cursor", cursor);
      const next = await staffingGet<Report>(`/api/staffing/operations?${params}`);
      if (captured !== generation.current) return;
      query.current = scope; setReport(old => cursor && old ? { ...next, items: [...old.items, ...next.items] } : next);
    } catch { if (captured === generation.current) { setReport(null); setError("Operations unavailable. Check the period and current customer access, then reload."); } }
    finally { if (captured === generation.current) setBusy(false); }
  }
  useEffect(() => { void loadCustomers(); return () => { generation.current++; }; }, []);
  function changed() { generation.current++; setReport(null); setBusy(false); }
  return <><header className="profile-header"><div><p className="profile-eyebrow">Delivery Planning</p><h1>Staffing Operations</h1>
    <p>Review planned capacity and commitments across customer delivery.</p></div><span className="profile-badge">Planned capacity</span></header>
    <p className="muted">Choose up to 91 resource-local service dates. Shared capacity includes all confirmed commitments; customer minutes are shown separately. Actual utilization is unavailable.</p>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Loading operations…</p>}
    <form className="staffing-period" onSubmit={event => { event.preventDefault(); void load(); }}><fieldset disabled={busy}><legend>Operations Period</legend>
      <label>Customer<select className="field" aria-label="Customer" required value={customerId} onChange={event => { changed(); setCustomer(event.target.value); }}>
        <option value="" disabled>Choose customer</option>{customers.items.map(customer => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
      </select></label>
      <label>First service date<input className="field" type="date" min="2000-01-01" max="2100-12-31" required value={fromDate} onChange={event => { changed(); setFrom(event.target.value); }} /></label>
      <label>Last service date<input className="field" type="date" min="2000-01-01" max="2100-12-31" required value={toDate} onChange={event => { changed(); setTo(event.target.value); }} /></label>
      <button className="primary-button">Read planned operations</button>
    </fieldset></form>
    <button disabled={busy} onClick={() => void loadCustomers()}>Reload customer choices</button>
    {customers.nextCursor && <button disabled={busy} onClick={() => void loadCustomers(customers.nextCursor!)}>More customer choices</button>}
    {!report && !busy && !error && <EmptyState icon="operations" title="Choose a period to explore capacity.">Select a customer and service dates above to view confirmed work, tentative reservations, and capacity exceptions.</EmptyState>}
    {report && <StaffingOperationsReport report={report} busy={busy} more={() => void load(report.nextCursor!)} />}
  </>;
}

/** Shared presentation for the live projection and synthetic visual previews. */
export function StaffingOperationsReport({ report, busy, more }: { report: Report; busy: boolean; more: () => void }) {
  return <section className="profile-section"><h2>Planned Resource Capacity</h2>
      <p>As of {new Date(report.asOf).toLocaleString()} · {report.fromDate} through {report.toDate} · formula {report.formulaVersion}</p>
      <dl className="staffing-metrics">
        <div><dt>Resources loaded</dt><dd>{report.items.length}</dd></div>
        <div><dt>Resources needing review</dt><dd>{report.items.filter(resource => resource.days.some(day => day.needsReview)).length}</dd></div>
        <div><dt>Customer confirmed minutes</dt><dd>{report.items.reduce((total, resource) => total + resource.days.reduce((sum, day) => sum + day.customerConfirmedMinutes, 0), 0).toLocaleString("en-US")}</dd></div>
      </dl>
      <p>Summary covers the loaded resources and selected period. Tentative reservations are separate from confirmed commitments.</p>
      {report.items.some(resource => resource.days.some(day => day.needsReview)) && <aside className="profile-state" aria-label="Capacity exceptions">
        <h3>Exceptions Needing Review</h3>
        <ul>{report.items.filter(resource => resource.days.some(day => day.needsReview)).map(resource => <li key={resource.resourceId}>
          {resource.displayName}: {resource.days.filter(day => day.needsReview).length} service dates need review. Confirmed commitments remain counted.
        </li>)}</ul>
      </aside>}
      {!report.items.length && <EmptyState icon="operations" title="No confirmed or active tentative assignments for this customer in the selected period." />}
      {report.items.map(resource => <article key={resource.resourceId} className="profile-card"><h3>{resource.displayName}</h3>
        <p>Resource-local dates in {resource.timezone}{!resource.active ? " · inactive resource" : ""} · as of {new Date(resource.asOf).toLocaleString()}</p>
        <div className="staffing-table-scroll" role="region" aria-label={`${resource.displayName} daily capacity`} tabIndex={0}>
          <table className="staffing-table"><caption>Daily capacity in minutes. Planned ratio is confirmed billable minutes divided by available minutes; unknown inputs remain unknown.</caption>
            <thead><tr>{["Service date", "Confirmed", "Billable", "Tentative", "Customer confirmed / tentative", "Contracted", "Protected", "Available", "Remaining", "Planned ratio", "Review"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{resource.days.map(day => <tr key={day.date}><th scope="row">{day.date}</th>
              <td>{day.confirmedMinutes}</td><td>{day.confirmedBillableMinutes}</td><td>{day.tentativeMinutes}</td>
              <td>{day.customerConfirmedMinutes} / {day.customerTentativeMinutes}</td>
              <td>{day.capacity?.contractedMinutes ?? "Unknown"}</td><td>{day.capacity?.protectedMinutes ?? "Unknown"}</td>
              <td>{day.capacity?.availableMinutes ?? "Unknown"}</td><td>{day.capacity?.remainingMinutes ?? "Unknown"}</td>
              <td>{!day.capacity ? "Unknown" : day.capacity.plannedBillableRatio === null ? "Not applicable: zero available minutes" : `${day.capacity.plannedBillableRatio}%`}</td>
              <td>{day.needsReview ? <span role="status">Needs review: {day.reason?.replaceAll("_", " ") ?? "current staffing inputs"}. Confirmed commitments remain counted.</span> : "Current"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>)}
      {report.nextCursor && <button disabled={busy} onClick={more}>More resource capacity</button>}
    </section>;
}
