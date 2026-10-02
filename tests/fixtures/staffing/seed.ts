import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";

/** Synthetic-only factories. They never create approvals, grants or DB rows. */
export const STAFFING_FIXTURE_SCOPE = {
  workspaceId: DEMO_IDS.workspace, customerId: DEMO_IDS.sharedCustomer,
  otherCustomerId: DEMO_IDS.deniedCustomer,
} as const;

export function serviceDates(firstDate: string, count: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || !Number.isInteger(count) || count < 1 || count > 91) {
    throw new Error("Invalid synthetic service-date interval");
  }
  const first = new Date(`${firstDate}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 10) !== firstDate) {
    throw new Error("Invalid synthetic service date");
  }
  return Array.from({ length: count }, (_, i) =>
    new Date(first.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export function syntheticResource(name = "Synthetic Engineer") {
  return { displayName: name, externalKey: `synthetic_${randomUUID()}`,
    kind: "internal" as const, state: "active" as const, membershipId: null,
    partnerOrganizationId: null, timezone: "America/Denver", regionCode: "US-MTN" };
}

export function syntheticSkill() {
  return { key: `synthetic_${randomUUID().replaceAll("-", "")}`, name: "Synthetic web delivery",
    definition: "Independently validate a synthetic web delivery workflow.", state: "active" as const };
}

export function syntheticManualCompetency(resourceId: string, skillId: string, date: string) {
  return { resourceId, skillId, level: 2, assessmentDate: date,
    nextReviewDate: serviceDates(date, 91)[90],
    evidence: "Synthetic accountable assessment: reviewer observed the complete test exercise." };
}

export function syntheticCalendar(firstDate: string, count = 5, asOf = new Date().toISOString()) {
  const dates = serviceDates(firstDate, count);
  return { timezone: "America/Denver", observedAt: asOf,
    nextReviewAt: new Date(new Date(asOf).getTime() + 7 * 86_400_000).toISOString(),
    fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.map((date) => ({ date,
      contracted: [{ start: `${date}T09:00`, end: `${date}T17:00` }],
      holidays: [], leave: [], protected: [] })) };
}

export function syntheticCompetencyCsv(resourceId: string, skillId: string, date: string): Buffer {
  return Buffer.from(["resource_id,skill_id,level,assessment_date,next_review_date,evidence",
    `${resourceId},${skillId},2,${date},${serviceDates(date, 91)[90]},Synthetic observed exercise`,
    ""].join("\n"), "utf8");
}

export const STAFFING_SENTINELS = {
  personnel: "PRIVATE_STAFFING_EVIDENCE_DO_NOT_PROJECT",
  finance: "PRIVATE_STAFFING_FINANCE_DO_NOT_PROJECT",
  leave: "PRIVATE_STAFFING_LEAVE_DO_NOT_PROJECT",
  hiddenCustomer: "HIDDEN_STAFFING_CUSTOMER_DO_NOT_PROJECT",
} as const;

export const STAFFING_BENCHMARK_SHAPE = {
  resources: 500, skills: 50, competencyRevisions: 20_000, allocationDays: 10_000,
  serviceDays: 91, clients: 5, warmups: 10, measuredCalls: 100,
} as const;
