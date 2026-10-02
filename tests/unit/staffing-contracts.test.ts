import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingDateSchema, staffingDigestSchema, staffingRequestKeySchema,
  staffingRationaleSchema, staffingScopeSchema, staffingListSchema,
  staffingVersionSchema, staffingTimestampSchema, staffingResourceInputSchema,
  staffingOperationalResourceSchema } from "../../lib/contracts/staffing";
import { syntheticResource } from "../fixtures/staffing/seed";
import { staffingAdvisoryStartSchema } from "../../lib/contracts/staffing-advisory";

describe("strict staffing shared envelopes", () => {
  it("rejects multibyte staffing instructions beyond the actual native transport limit", () => {
    const input = { requestKey: randomUUID(), customerId: randomUUID(), demandId: randomUUID(), revisionId: randomUUID(),
      contentDigest: "a".repeat(64), expectedAggregateVersion: 1, mode: "operational", scenarioId: null, instructions: "中".repeat(5461) };
    expect(staffingAdvisoryStartSchema.safeParse(input).success).toBe(true);
    expect(staffingAdvisoryStartSchema.safeParse({ ...input, instructions: "中".repeat(5462) }).success).toBe(false);
    expect(staffingAdvisoryStartSchema.safeParse({ ...input, instructions: "a".repeat(8000) }).success).toBe(true);
  });
  it("validates actual bounded business dates including leap years", () => {
    for (const date of ["2000-02-29", "2028-02-29", "2100-12-31"]) expect(staffingDateSchema.parse(date)).toBe(date);
    for (const date of ["1999-12-31", "2101-01-01", "2100-02-29", "2026-02-30", "2026-9-30"])
      expect(staffingDateSchema.safeParse(date).success).toBe(false);
  });
  it("rejects unsafe versions, noncanonical digests and request keys", () => {
    for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(staffingVersionSchema.safeParse(version).success).toBe(false);
    expect(staffingVersionSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(staffingDigestSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(staffingDigestSchema.parse("a".repeat(64))).toBe("a".repeat(64));
    for (const key of ["short", "x".repeat(129), "request private", "request/unsafe"])
      expect(staffingRequestKeySchema.safeParse(key).success).toBe(false);
    expect(staffingRequestKeySchema.parse(randomUUID())).toHaveLength(36);
  });
  it("requires explicit valid scope, offset timestamps and trimmed rationale", () => {
    expect(staffingScopeSchema.safeParse({ workspaceId: randomUUID() }).success).toBe(false);
    expect(staffingScopeSchema.safeParse({ environmentId: "test-synthetic", workspaceId: randomUUID(), role: "admin" }).success).toBe(false);
    expect(staffingTimestampSchema.safeParse("2026-09-30T12:00:00").success).toBe(false);
    expect(staffingTimestampSchema.safeParse("2026-09-30T12:00:00-06:00").success).toBe(true);
    expect(staffingRationaleSchema.parse("  Explicit review  ")).toBe("Explicit review");
    expect(staffingRationaleSchema.safeParse("   ").success).toBe(false);
  });
  it("bounds list size and rejects caller filters", () => {
    expect(staffingListSchema.parse({})).toEqual({ pageSize: 20 });
    for (const value of [{ pageSize: 0 }, { pageSize: 51 }, { pageSize: 1.5 }, { sql: "hidden" }])
      expect(staffingListSchema.safeParse(value).success).toBe(false);
  });
  it("requires exact resource identity fields and excludes private operational properties", () => {
    const resource = syntheticResource();
    expect(staffingResourceInputSchema.safeParse(resource).success).toBe(true);
    expect(staffingResourceInputSchema.safeParse({ ...resource, timezone: "invalid/zone" }).success).toBe(false);
    expect(staffingResourceInputSchema.safeParse({ ...resource, kind: "partner" }).success).toBe(false);
    const operational = { resourceId: randomUUID(), displayName: resource.displayName, kind: resource.kind,
      state: resource.state, timezone: resource.timezone, regionCode: resource.regionCode, aggregateVersion: 1, skills: [], skillsNextCursor: null };
    expect(staffingOperationalResourceSchema.safeParse(operational).success).toBe(true);
    for (const field of ["evidence", "leaveReason", "hourlyRate", "contribution"])
      expect(staffingOperationalResourceSchema.safeParse({ ...operational, [field]: "PRIVATE_SENTINEL" }).success).toBe(false);
  });
});
