"use client";
import { useEffect, useState, useRef } from "react";
import type { readDemand } from "../../../lib/server/staffing/demands";
import type { readMatchingResult } from "../../../lib/server/staffing/matching";
import type { MatchingConstraint } from "../../../lib/staffing/matching";
import { staffingGet, useStaffingCommand } from "./client";
type Page = Awaited<ReturnType<typeof readMatchingResult>>;
type Demand = Awaited<ReturnType<typeof readDemand>>;
const kind: Record<MatchingConstraint["kind"], string> = { resource: "Resource", region: "Region", partner_eligibility: "Partner eligibility",
  availability: "Availability review", required_skill: "Required skill", calendar_coverage: "Certified calendar", capacity: "Daily capacity", overlap: "Zoned overlap" };
const reason: Record<MatchingConstraint["reason"], string> = { satisfied: "Satisfied", inactive: "Resource is inactive", region_mismatch: "Region does not match",
  grant_ineligible: "Current partner eligibility is unavailable", source_ineligible: "Approved source is unavailable", missing: "Required information is missing",
  stale: "Review date or evidence age has expired", invalid_through_work: "Competency does not cover the whole work period",
  insufficient_level: "Approved level does not meet the requirement", uncertified_date: "Date is not currently certified", insufficient_minutes: "Insufficient remaining minutes",
  insufficient_overlap: "Insufficient overlap in the requested time window" };
export function StaffingMatches({ demand, csrfToken, contextChanged, selectResource }: { demand: Demand; csrfToken: string; contextChanged: () => Promise<void>;
  selectResource: (resource: { resourceId: string; displayName: string }) => void }) {
  const [resultId, setResultId] = useState<string | null>(null), [page, setPage] = useState<Page | null>(null);
  const [items, setItems] = useState<Page["items"]>([]), [error, setError] = useState(""), [reading, setReading] = useState(false);
  const qualified = demand.state === "qualified" && !demand.reviewRequired && demand.contentAvailability === "readable";
  const scope = useRef(""), activeResult = useRef<string | null>(null), refresh = useRef(contextChanged);
  const reads = useRef(0), comparisonScope = useRef<string | null>(null);
  scope.current = `${demand.demandId}:${demand.revisionId}:${demand.aggregateVersion}:${demand.state}:${demand.contentAvailability}:${demand.reviewRequired}`; refresh.current = contextChanged;
  async function read(id: string, cursor?: string, quiet = false) {
    const captured = scope.current, ticket = ++reads.current;
    if (!quiet) setReading(true);
    try {
      const current = await staffingGet<Page>(`/api/staffing/demands/${demand.demandId}/matches?resultId=${id}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (captured !== scope.current || activeResult.current !== id || reads.current !== ticket) return;
      setPage(old => quiet && old ? { ...old, skills: current.skills } : current);
      if (!quiet) setItems(old => cursor ? [...new Map([...old, ...current.items].map(item => [item.resourceId, item])).values()] : current.items);
      setError("");
    } catch (cause) {
      if (captured !== scope.current || activeResult.current !== id || reads.current !== ticket) return;
      activeResult.current = null; setResultId(null); setPage(null); setItems([]);
      setError(cause instanceof Error ? cause.message : "Comparison unavailable. Reload demand and compare again.");
      void refresh.current();
    } finally { if (captured === scope.current && reads.current === ticket) setReading(false); }
  }
  const command = useStaffingCommand(csrfToken, async result => {
    if (comparisonScope.current !== scope.current) return;
    if (!result.entityId) throw new Error("Comparison receipt unavailable");
    activeResult.current = result.entityId; setResultId(result.entityId); await read(result.entityId);
  });
  useEffect(() => { ++reads.current; activeResult.current = null; setResultId(null); setPage(null); setItems([]); setError(""); setReading(false);
    return () => { ++reads.current; activeResult.current = null; }; },
    [demand.demandId, demand.revisionId, demand.aggregateVersion, demand.state, demand.contentAvailability, demand.reviewRequired]);
  useEffect(() => {
    if (!resultId || !qualified) return;
    const interval = setInterval(() => { void read(resultId, undefined, true); }, 10_000);
    return () => clearInterval(interval);
  }, [resultId, qualified, demand.demandId]);
  if (!qualified) return null;
  return <section className="profile-section" aria-labelledby="matches-heading"><h2 id="matches-heading">Compare staffing resources</h2>
    <p>Compare the whole supported active resource pool. Eligibility is a current feasibility check; it does not reserve or confirm staffing.</p>
    {command.message && <p role="status">{command.message}</p>}{error && <p role="alert">{error}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check comparison receipt</button>}
    <button className="secondary-button" disabled={command.busy || reading || !!command.uncertainKey} onClick={() => {
      comparisonScope.current = scope.current;
      void command.save(`/api/staffing/demands/${demand.demandId}/matches`, { revisionId: demand.revisionId, contentDigest: demand.contentDigest,
        expectedAggregateVersion: demand.aggregateVersion, rationale: "Compare the exact qualified staffing demand" });
    }}>Compare resources</button>
    {reading && <p role="status">Checking current staffing inputs…</p>}
    {page && <><p>As of {new Date(page.asOf).toLocaleString()} · comparison expires {new Date(page.expiresAt).toLocaleString()}.</p>
      <p>Work period {page.fromDate} through {page.toDate}. Service dates use each resource&apos;s timezone.</p>
      {!items.length && <p>No active resources are available in this scope.</p>}
      <div className="profile-grid">{items.map(match => <article className="profile-card" key={match.resourceId}>
        <h3>{match.displayName}</h3><p>{match.status === "eligible" ? "Eligible" : match.status === "needs_review" ? "Needs review" : "Ineligible"} · {match.timezone}</p>
        <p>Current desired skills: {match.desiredSkillCount}. Minimum daily remaining after this request: {match.minimumRemainingAfterRequest ?? "Unknown"} minutes.</p>
        {match.constraints.some(constraint => constraint.reason !== "satisfied") && <ul>{match.constraints.filter(constraint => constraint.reason !== "satisfied").map((constraint, index) => <li key={index}>
          {kind[constraint.kind]}{constraint.skillId ? ` · ${page.skills.find(skill => skill.skillId === constraint.skillId)?.name ?? "Selected demand skill"}` : ""}
          {constraint.date ? ` · ${constraint.date}` : ""}: {reason[constraint.reason]}{constraint.freshness ? ` (${constraint.freshness})` : ""}
        </li>)}</ul>}
        {match.constraints.some(constraint => constraint.reason === "satisfied") && <details>
          <summary>Satisfied checks ({match.constraints.filter(constraint => constraint.reason === "satisfied").length})</summary>
          <ul>{match.constraints.filter(constraint => constraint.reason === "satisfied").map((constraint, index) => <li key={index}>
            {kind[constraint.kind]}{constraint.skillId ? ` · ${page.skills.find(skill => skill.skillId === constraint.skillId)?.name ?? "Selected demand skill"}` : ""}
            {constraint.date ? ` · ${constraint.date}` : ""}: {reason[constraint.reason]}{constraint.freshness ? ` (${constraint.freshness})` : ""}
          </li>)}</ul>
        </details>}
        <button disabled={reading || command.busy || !!command.uncertainKey} onClick={() => selectResource({ resourceId: match.resourceId, displayName: match.displayName })}>Choose {match.displayName} for a proposal</button>
      </article>)}</div>
      {page.nextCursor && <button disabled={reading || command.busy || !!command.uncertainKey} onClick={() => void read(page.resultId, page.nextCursor!)}>More comparison results</button>}
    </>}
  </section>;
}
