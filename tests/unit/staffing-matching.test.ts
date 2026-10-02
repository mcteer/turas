import { describe, expect, it } from "vitest";
import { evaluateStaffingMatches } from "../../lib/staffing/matching";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const demand = { requiredSkills: [{ skillId: id(1), minimumLevel: 2 }], desiredSkills: [{ skillId: id(2), minimumLevel: 3 }],
  days: [{ date: "2026-10-01", requiredMinutes: 240 }, { date: "2026-10-02", requiredMinutes: 240 }],
  allowedRegions: ["US-MTN"], overlapRequired: true, minimumOverlapMinutes: 60 };
const resource = (n: number) => ({ resourceId: id(n), active: true, regionCode: "US-MTN", kind: "internal" as const,
  asOfDate: "2026-09-30", partnerEligible: null, calendar: { observedAt: "2026-09-29T12:00:00Z", nextReviewAt: "2026-10-06T12:00:00Z" },
  skills: [1, 2].map(skill => ({ skillId: id(skill), level: 3, eligible: true, assessmentDate: "2026-09-01", nextReviewDate: "2026-12-01" })),
  days: demand.days.map(day => ({ date: day.date, certified: true, remainingMinutes: 480, overlapMinutes: 120 })) });
const asOf = "2026-09-30T12:00:00Z";
describe("explained deterministic staffing matches", () => {
  it("does not backdate a competency to service dates preceding its assessment", () => {
    const input = resource(10);
    input.asOfDate = "2026-10-03";
    input.skills.forEach(skill => { skill.assessmentDate = "2026-10-02"; });
    const result = evaluateStaffingMatches(demand, [input], "2026-10-03T12:00:00Z")[0];
    expect(result.status).toBe("needs_review"); expect(result.desiredSkillCount).toBe(0);
    expect(result.constraints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "required_skill", reason: "invalid_through_work", outcome: "unknown" })]));
  });
  it("ranks desired count then worst-day remaining then identity across the full pool", () => {
    const first = resource(10), last = resource(30), middle = resource(20);
    last.skills.pop(); first.days[1].remainingMinutes = 300;
    const result = evaluateStaffingMatches(demand, [last, first, middle], asOf);
    expect(result.map(r => r.resourceId)).toEqual([id(20), id(10), id(30)]);
    expect(result[0]).toMatchObject({ status: "eligible", desiredSkillCount: 1, minimumRemainingAfterRequest: 240 });
    expect(result[0].constraints.every(c => c.outcome === "passed")).toBe(true);
    expect(evaluateStaffingMatches(demand, [resource(11), resource(10)], asOf).map(r => r.resourceId)).toEqual([id(10), id(11)]);
  });
  it("explains every failed and unknown hard constraint rather than short circuiting", () => {
    const input = resource(10); input.active = false; input.regionCode = "EU"; input.skills[0].level = 1;
    input.days[0].remainingMinutes = 100; input.days[1].overlapMinutes = 30;
    const result = evaluateStaffingMatches(demand, [input], asOf)[0];
    expect(result.status).toBe("ineligible");
    expect(result.constraints.filter(c => c.outcome === "failed").map(c => c.kind)).toEqual(expect.arrayContaining(["resource", "region", "required_skill", "capacity", "overlap"]));
    const unknown = { ...resource(20), calendar: null, skills: [], days: [] };
    const pending = evaluateStaffingMatches(demand, [unknown], asOf)[0];
    expect(pending.status).toBe("needs_review");
    expect(pending.constraints.filter(c => c.outcome === "unknown").map(c => c.kind)).toEqual(expect.arrayContaining(["availability", "required_skill", "calendar_coverage", "capacity", "overlap"]));
  });
  it("requires competency validity across work and availability age at decision time", () => {
    const oldSkill = resource(10); oldSkill.skills[0].nextReviewDate = "2026-10-01";
    const staleCalendar = resource(20); staleCalendar.calendar.observedAt = "2026-09-15T12:00:00Z";
    const aging = resource(30); aging.calendar.observedAt = "2026-09-20T12:00:00Z";
    expect(evaluateStaffingMatches(demand, [oldSkill, staleCalendar, aging], asOf).map(r => [r.resourceId, r.status]))
      .toEqual([[id(30), "eligible"], [id(10), "needs_review"], [id(20), "needs_review"]]);
    expect(evaluateStaffingMatches(demand, [aging], asOf)[0].availabilityFreshness).toBe("aging");
    oldSkill.skills[0].level = 1;
    expect(evaluateStaffingMatches(demand, [oldSkill], asOf)[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "required_skill", reason: "insufficient_level", outcome: "failed" }),
      expect.objectContaining({ kind: "required_skill", reason: "invalid_through_work", outcome: "unknown" }),
    ]));
    oldSkill.skills[0].eligible = false;
    expect(evaluateStaffingMatches(demand, [oldSkill], asOf)[0].constraints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "required_skill", reason: "source_ineligible" })]));
  });
  it("treats zero or negative remaining as insufficient and partner grants as hard boundaries", () => {
    const partner = { ...resource(10), kind: "partner" as const, partnerEligible: false };
    partner.days[0].remainingMinutes = -60; partner.days[1].remainingMinutes = 0;
    const result = evaluateStaffingMatches(demand, [partner], asOf)[0];
    expect(result.status).toBe("ineligible");
    expect(result.constraints.filter(c => c.kind === "capacity" && c.outcome === "failed")).toHaveLength(2);
    expect(result.constraints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "partner_eligibility", outcome: "failed" })]));
  });
  it("does not count stale optional skills and orders review/failed groups by identity", () => {
    const optional = resource(30); optional.skills[1].nextReviewDate = "2026-09-29";
    const review = { ...resource(20), calendar: null }, failed = { ...resource(10), active: false };
    const result = evaluateStaffingMatches(demand, [failed, review, optional], asOf);
    expect(result.map(r => r.resourceId)).toEqual([id(30), id(20), id(10)]);
    expect(result[0]).toMatchObject({ status: "eligible", desiredSkillCount: 0 });
  });
  it("rejects incomplete overflow, duplicate identities and extraneous ranking attributes", () => {
    expect(() => evaluateStaffingMatches(demand, Array.from({ length: 501 }, (_, i) => resource(i + 10)), asOf)).toThrow();
    expect(() => evaluateStaffingMatches(demand, [resource(10), resource(10)], asOf)).toThrow();
    expect(() => evaluateStaffingMatches(demand, [{ ...resource(10), cost: 0 }], asOf)).toThrow();
    expect(() => evaluateStaffingMatches({ ...demand, days: [] }, [resource(10)], asOf)).toThrow();
  });
});
