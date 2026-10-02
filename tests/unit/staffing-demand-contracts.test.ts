import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingDemandInputSchema } from "../../lib/contracts/staffing-demands";
import { staffingAdvisoryStartSchema } from "../../lib/contracts/staffing-advisory";
const input = () => ({ customerId: randomUUID(), workloadId: null, engagementId: randomUUID(), planId: randomUUID(),
  baselineId: randomUUID(), planRevisionId: randomUUID(), baselineDigest: "a".repeat(64), workPackageKey: "delivery",
  title: "Synthetic scoped demand", role: "Delivery engineer", fromDate: "2026-10-01", toDate: "2026-10-02",
  requiredSkills: [{ skillId: randomUUID(), minimumLevel: 2 }], desiredSkills: [],
  days: [{ date: "2026-10-01", requiredMinutes: 120 }, { date: "2026-10-02", requiredMinutes: 240 }],
  allowedRegions: [], overlap: null, billable: true });

describe("exact bounded staffing demand inputs", () => {
  it("requires exact advisory scope and explicit mode without caller capability or scenario widening", () => {
    const value = { requestKey: randomUUID(), customerId: randomUUID(), demandId: randomUUID(), revisionId: randomUUID(),
      contentDigest: "a".repeat(64), expectedAggregateVersion: 1, mode: "operational", scenarioId: null, instructions: "Explain the request" };
    expect(staffingAdvisoryStartSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ instructions: "" }, { instructions: "x".repeat(8001) }, { mode: "internal" },
      { scenarioId: randomUUID() }, { expectedAggregateVersion: 0 }, { canConfirm: true }, { conversationId: randomUUID() }]) {
      expect(staffingAdvisoryStartSchema.safeParse({ ...value, ...patch }).success).toBe(false);
    }
    expect(staffingAdvisoryStartSchema.safeParse({ ...value, mode: "finance", scenarioId: randomUUID() }).success).toBe(true);
  });
  it("requires explicit accepted-baseline identity without inferring qualification", () => {
    expect(staffingDemandInputSchema.safeParse(input()).success).toBe(true);
    for (const field of ["baselineId", "planRevisionId", "baselineDigest", "engagementId"]) {
      const value = input(); delete (value as Record<string, unknown>)[field]; expect(staffingDemandInputSchema.safeParse(value).success).toBe(false);
    }
    expect(staffingDemandInputSchema.safeParse({ ...input(), state: "qualified" }).success).toBe(false);
  });
  it("rejects duplicate skills across required/desired and level-zero qualification", () => {
    const value = input();
    for (const patch of [{ requiredSkills: [] }, { requiredSkills: [...value.requiredSkills, ...value.requiredSkills] },
      { desiredSkills: value.requiredSkills }, { requiredSkills: [{ skillId: randomUUID(), minimumLevel: 0 }] },
      { desiredSkills: Array.from({ length: 21 }, () => ({ skillId: randomUUID(), minimumLevel: 1 })) }])
      expect(staffingDemandInputSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it("bounds daily effort and the inclusive period across month/leap boundaries", () => {
    const value = input();
    for (const days of [[], [value.days[0], value.days[0]], [{ date: "2026-09-30", requiredMinutes: 1 }],
      [{ date: "2026-10-01", requiredMinutes: 0 }], [{ date: "2026-10-01", requiredMinutes: 961 }]])
      expect(staffingDemandInputSchema.safeParse({ ...value, days }).success).toBe(false);
    expect(staffingDemandInputSchema.safeParse({ ...value, fromDate: "2028-02-28", toDate: "2028-03-01",
      days: [{ date: "2028-02-29", requiredMinutes: 960 }] }).success).toBe(true);
    expect(staffingDemandInputSchema.safeParse({ ...value, toDate: "2027-01-01" }).success).toBe(false);
  });
  it("requires a separately zoned minute-resolution overlap interval for each work date", () => {
    const value = input(), overlap = { timezone: "America/Denver", minimumOverlapMinutes: 60,
      windows: value.days.map(day => ({ date: day.date, from: `${day.date}T09:00`, to: `${day.date}T11:00`, fromOffset: null, toOffset: null })) };
    expect(staffingDemandInputSchema.safeParse({ ...value, overlap }).success).toBe(true);
    for (const patch of [{ timezone: "not/a-zone" }, { minimumOverlapMinutes: 0 }, { windows: overlap.windows.slice(0, 1) },
      { windows: [overlap.windows[0], overlap.windows[0]] }, { windows: [{ ...overlap.windows[0], from: "2026-10-01T09:00:01" }, overlap.windows[1]] }])
      expect(staffingDemandInputSchema.safeParse({ ...value, overlap: { ...overlap, ...patch } }).success).toBe(false);
  });
});
