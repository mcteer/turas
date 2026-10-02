import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingEmptyToolSchema, staffingMatchToolSchema, staffingCapacityToolSchema,
  staffingCapacityToolResultSchema, staffingMatchToolResultSchema } from "../../lib/contracts/staffing-tools";

describe("staffing native read boundaries", () => {
  it("rejects supplied scope, finance capability and write intent on empty and matching reads", () => {
    expect(staffingEmptyToolSchema.parse({})).toEqual({});
    expect(staffingMatchToolSchema.parse({})).toEqual({ pageSize: 20 });
    for (const patch of [{ customerId: randomUUID() }, { demandId: randomUUID() }, { mode: "finance" },
      { scenarioId: randomUUID() }, { resourceIds: [randomUUID()] }, { action: "confirm" }, { resultId: randomUUID() }]) {
      expect(staffingEmptyToolSchema.safeParse(patch).success).toBe(false);
      expect(staffingMatchToolSchema.safeParse(patch).success).toBe(false);
    }
    for (const pageSize of [0, 51, 1.5]) expect(staffingMatchToolSchema.safeParse({ pageSize }).success).toBe(false);
  });
  it("bounds capacity dates and identities without accepting private or commercial inputs", () => {
    const resourceId = randomUUID(), value = { resourceIds: [resourceId], fromDate: "2026-10-01", toDate: "2026-12-30" };
    expect(staffingCapacityToolSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ resourceIds: [] }, { resourceIds: [resourceId, resourceId] },
      { resourceIds: Array.from({ length: 21 }, () => randomUUID()) }, { toDate: "2026-12-31" },
      { toDate: "2026-09-30" }, { fromDate: "2026-02-30" }, { leaveReason: "PRIVATE_SYNTHETIC_REASON" }, { loadedCost: "1000" }]) {
      expect(staffingCapacityToolSchema.safeParse({ ...value, ...patch }).success).toBe(false);
    }
  });
  it("preserves unknown calendar coverage, negative capacity and unavailable actual utilization", () => {
    const day = { date: "2026-10-01", calendarRevisionId: null, capacityGeneration: 1,
      contractedMinutes: null, availableMinutes: null, protectedMinutes: null, confirmedMinutes: 120,
      remainingMinutes: null, freshness: "unknown", reviewRequired: true, actualUtilization: null, actualReason: "actual_unavailable" };
    const value = { contractVersion: "staffing-advice-v1", demandId: randomUUID(), demandRevisionId: randomUUID(),
      asOf: "2026-10-01T00:00:00.000Z", citations: [], formulaVersion: "staffing-capacity-v1",
      fromDate: day.date, toDate: day.date, items: [{ resourceId: randomUUID(), days: [day] }], planningOnly: true };
    expect(staffingCapacityToolResultSchema.parse(value).items[0].days[0].remainingMinutes).toBeNull();
    expect(staffingCapacityToolResultSchema.parse({ ...value, items: [{ ...value.items[0], days: [{ ...day, remainingMinutes: -120 }] }] })
      .items[0].days[0].remainingMinutes).toBe(-120);
    for (const patch of [{ leaveReason: "PRIVATE_SYNTHETIC_REASON" }, { customerId: randomUUID() }, { actualUtilization: 0 }]) {
      expect(staffingCapacityToolResultSchema.safeParse({ ...value, items: [{ ...value.items[0], days: [{ ...day, ...patch }] }] }).success).toBe(false);
    }
  });
  it("requires explicit whole-pool coverage and rejects private evidence or finance in a match result", () => {
    const item = { resourceId: randomUUID(), displayName: "Synthetic engineer", timezone: "UTC", status: "needs_review",
      desiredSkillCount: 0, minimumRemainingAfterRequest: null, availabilityFreshness: "unknown",
      constraints: [{ kind: "required_skill", outcome: "unknown", reason: "source_ineligible", skillId: randomUUID() }] };
    const value = { contractVersion: "staffing-advice-v1", demandId: randomUUID(), demandRevisionId: randomUUID(),
      asOf: "2026-10-01T00:00:00.000Z", citations: [], resultId: randomUUID(), inputDigest: "a".repeat(64),
      formulaVersion: "staffing-matching-v1", fromDate: "2026-10-01", toDate: "2026-10-01", skills: [],
      items: [item], totalResources: 500, completePool: true, nextCursor: "opaque-synthetic-cursor", planningOnly: true };
    expect(staffingMatchToolResultSchema.parse(value).items[0].constraints[0].outcome).toBe("unknown");
    expect(staffingMatchToolResultSchema.safeParse({ ...value, completePool: false }).success).toBe(false);
    for (const patch of [{ evidence: "PRIVATE_SYNTHETIC_EVIDENCE" }, { loadedCost: "1000" }, { margin: "10.00" }, { leaveReason: "PRIVATE_SYNTHETIC_REASON" }]) {
      expect(staffingMatchToolResultSchema.safeParse({ ...value, items: [{ ...item, ...patch }] }).success).toBe(false);
    }
  });
});
