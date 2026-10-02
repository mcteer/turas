import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingAllocationInputSchema, staffingAllocationDecisionSchema, staffingAllocationPreviewSchema, staffingReserveAllocationSchema, staffingAllocationListSchema } from "../../lib/contracts/staffing-allocations";
import { staffingAssignmentSchema, staffingAssignmentPageSchema } from "../../lib/contracts/staffing-assignments";
const allocation = () => ({ resourceId: randomUUID(), demandId: randomUUID(), demandRevisionId: randomUUID(),
  demandDigest: "a".repeat(64), expectedDemandVersion: 1, days: [{ date: "2026-10-01", minutes: 120 }, { date: "2026-10-02", minutes: 240 }] });
const exact = () => ({ requestKey: randomUUID(), rationale: "Synthetic exact allocation review", revisionId: randomUUID(), contentDigest: "b".repeat(64), expectedAggregateVersion: 1 });
describe("strict human allocation contracts", () => {
  it("allows only delivery-safe assignment fields, including explicitly withheld narrative", () => {
    const record = { assignmentId: randomUUID(), displayName: null, deliveryRole: null,
      days: [{ date: "2026-10-02", minutes: 120 }], reviewRequired: true };
    expect(staffingAssignmentSchema.safeParse(record).success).toBe(true);
    for (const field of ["resourceId", "competencies", "evidence", "provenance", "leave", "rates", "otherCustomers", "rationale", "tentativeMinutes"]) {
      expect(staffingAssignmentSchema.safeParse({ ...record, [field]: "PRIVATE_SYNTHETIC_SENTINEL" }).success).toBe(false);
    }
    expect(staffingAssignmentPageSchema.safeParse({ items: Array.from({ length: 51 }, () => record), nextCursor: null }).success).toBe(false);
  });
  it("requires customer scope and bounds identity pagination without caller visibility overrides", () => {
    expect(staffingAllocationListSchema.parse({ customerId: randomUUID() }).pageSize).toBe(20);
    for (const input of [{}, { customerId: randomUUID(), pageSize: 51 }, { customerId: randomUUID(), includePrivate: true },
      { customerId: randomUUID(), demandId: "foreign" }]) expect(staffingAllocationListSchema.safeParse(input).success).toBe(false);
  });
  it("requires a single resource and exact demand binding without caller-selected state or timezone", () => {
    const input = allocation(); expect(staffingAllocationInputSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ demandRevisionId: undefined }, { demandDigest: undefined }, { expectedDemandVersion: 0 },
      { state: "confirmed" }, { resourceTimezone: "UTC" }, { needsReview: false }]) expect(staffingAllocationInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("bounds and deduplicates dates/minutes including sparse work intervals", () => {
    const input = allocation();
    for (const days of [[], [input.days[0], input.days[0]], [{ date: "2026-10-01", minutes: 0 }], [{ date: "2026-10-01", minutes: 961 }],
      [{ date: "2026-10-01", minutes: 1 }, { date: "2026-12-31", minutes: 1 }]]) expect(staffingAllocationInputSchema.safeParse({ ...input, days }).success).toBe(false);
    expect(staffingAllocationInputSchema.safeParse({ ...input, days: [{ date: "2028-02-29", minutes: 960 }, { date: "2028-05-29", minutes: 960 }] }).success).toBe(true);
  });
  it("requires an exact preview on all four human commitment actions and rejects overload override", () => {
    for (const action of ["confirm", "amend", "release", "cancel"]) {
      const input = { ...exact(), action, reviewPreviewId: randomUUID() };
      expect(staffingAllocationDecisionSchema.safeParse(input).success).toBe(true);
      expect(staffingAllocationDecisionSchema.safeParse({ ...input, reviewPreviewId: undefined }).success).toBe(false);
      expect(staffingAllocationDecisionSchema.safeParse({ ...input, overloadOverride: true }).success).toBe(false);
    }
  });
  it("has no caller expiry and cannot turn a reservation or preview into confirmation", () => {
    expect(staffingReserveAllocationSchema.safeParse(exact()).success).toBe(true);
    expect(staffingReserveAllocationSchema.safeParse({ ...exact(), expiresAt: "2099-01-01T00:00:00Z" }).success).toBe(false);
    expect(staffingAllocationPreviewSchema.safeParse({ ...exact(), action: "confirm" }).success).toBe(true);
    expect(staffingAllocationPreviewSchema.safeParse({ ...exact(), action: "reserve" }).success).toBe(false);
  });
});
