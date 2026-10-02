import { z } from "zod";
import { STAFFING_LIMITS, staffingIdSchema, staffingDateSchema, staffingRegionSchema, staffingTimestampSchema } from "../contracts/staffing";
import { competencyFreshness, availabilityFreshness, type StaffingFreshness } from "./freshness";
export const STAFFING_MATCHING_VERSION = "staffing-matching-v1";
const requestedSkill = z.object({ skillId: staffingIdSchema, minimumLevel: z.number().int().min(1).max(4) }).strict();
const matchingDemand = z.object({ requiredSkills: z.array(requestedSkill).min(1).max(20), desiredSkills: z.array(requestedSkill).max(20),
  days: z.array(z.object({ date: staffingDateSchema, requiredMinutes: z.number().int().min(1).max(960) }).strict()).min(1).max(91),
  allowedRegions: z.array(staffingRegionSchema).max(20), overlapRequired: z.boolean(),
  minimumOverlapMinutes: z.number().int().min(1).max(960).nullable(),
}).strict().superRefine((d, ctx) => {
  const skills = [...d.requiredSkills, ...d.desiredSkills].map(s => s.skillId), dates = d.days.map(d => d.date).sort();
  if (new Set(skills).size !== skills.length || new Set(dates).size !== dates.length ||
    new Set(d.allowedRegions).size !== d.allowedRegions.length ||
    Date.parse(dates.at(-1)!) - Date.parse(dates[0]) > 90 * 86_400_000 || d.overlapRequired !== (d.minimumOverlapMinutes !== null)) {
    ctx.addIssue({ code: "custom", message: "Invalid matching demand" });
  }
});
const matchingResource = z.object({ resourceId: staffingIdSchema, active: z.boolean(), regionCode: staffingRegionSchema.nullable(),
  kind: z.enum(["internal", "partner"]), asOfDate: staffingDateSchema, partnerEligible: z.boolean().nullable(),
  calendar: z.object({ observedAt: staffingTimestampSchema.nullable(), nextReviewAt: staffingTimestampSchema.nullable() }).strict().nullable(),
  skills: z.array(z.object({ skillId: staffingIdSchema, level: z.number().int().min(0).max(4), eligible: z.boolean(),
    assessmentDate: staffingDateSchema.nullable(), nextReviewDate: staffingDateSchema.nullable() }).strict()).max(40),
  days: z.array(z.object({ date: staffingDateSchema, certified: z.boolean(), remainingMinutes: z.number().int().min(-960).max(960).nullable(),
    overlapMinutes: z.number().int().min(0).max(960).nullable() }).strict()).max(91),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.skills.map(s => s.skillId)).size !== r.skills.length || new Set(r.days.map(d => d.date)).size !== r.days.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate resource input" });
  }
});
export type StaffingMatchingResource = z.infer<typeof matchingResource>;
export type StaffingMatchingDemand = z.infer<typeof matchingDemand>;
export type MatchingConstraint = { kind: "resource" | "region" | "partner_eligibility" | "availability" | "required_skill" | "calendar_coverage" | "capacity" | "overlap";
  outcome: "passed" | "failed" | "unknown"; reason: "satisfied" | "inactive" | "region_mismatch" | "grant_ineligible" | "source_ineligible" |
    "missing" | "stale" | "invalid_through_work" | "insufficient_level" | "uncertified_date" | "insufficient_minutes" | "insufficient_overlap";
  skillId?: string; date?: string; freshness?: StaffingFreshness };
export type StaffingMatch = { resourceId: string; status: "eligible" | "needs_review" | "ineligible";
  desiredSkillCount: number; minimumRemainingAfterRequest: number | null; availabilityFreshness: StaffingFreshness;
  constraints: MatchingConstraint[] };

/** Inputs must be authorized current projections, with resolved per-resource-day
 * overlap and confirmed capacity. This pure layer performs no retrieval and
 * accepts no cost, leave prose, demographic attribute or model score. */
export function evaluateStaffingMatches(rawDemand: unknown, rawResources: unknown, rawAsOf: unknown): StaffingMatch[] {
  const demand = matchingDemand.parse(rawDemand), resources = z.array(matchingResource).max(STAFFING_LIMITS.resources).parse(rawResources),
    asOf = staffingTimestampSchema.parse(rawAsOf);
  if (new Set(resources.map(r => r.resourceId)).size !== resources.length) throw new Error("Duplicate matching resource identity");
  const serviceDates = demand.days.map(d => d.date).sort(), fromDate = serviceDates[0], throughDate = serviceDates.at(-1)!;
  const results = resources.map(resource => {
    const constraints: MatchingConstraint[] = [];
    const add = (kind: MatchingConstraint["kind"], outcome: MatchingConstraint["outcome"], reason: MatchingConstraint["reason"],
      detail: Partial<Pick<MatchingConstraint, "date" | "skillId" | "freshness">> = {}) => constraints.push({ kind, outcome, reason, ...detail });
    add("resource", resource.active ? "passed" : "failed", resource.active ? "satisfied" : "inactive");
    if (!demand.allowedRegions.length) add("region", "passed", "satisfied");
    else if (!resource.regionCode) add("region", "unknown", "missing");
    else add("region", demand.allowedRegions.includes(resource.regionCode) ? "passed" : "failed", demand.allowedRegions.includes(resource.regionCode) ? "satisfied" : "region_mismatch");
    if (resource.kind === "internal") add("partner_eligibility", "passed", "satisfied");
    else if (resource.partnerEligible === null) add("partner_eligibility", "unknown", "missing");
    else add("partner_eligibility", resource.partnerEligible ? "passed" : "failed", resource.partnerEligible ? "satisfied" : "grant_ineligible");
    const availability = availabilityFreshness(resource.calendar, asOf);
    add("availability", availability.validThrough ? "passed" : "unknown", availability.validThrough ? "satisfied" : availability.freshness === "stale" ? "stale" : "missing",
      { freshness: availability.freshness });
    for (const required of demand.requiredSkills) {
      const skill = resource.skills.find(s => s.skillId === required.skillId), detail = { skillId: required.skillId };
      if (!skill) { add("required_skill", "unknown", "missing", detail); continue; }
      if (!skill.eligible) { add("required_skill", "unknown", "source_ineligible", detail); continue; }
      const fresh = competencyFreshness(skill, resource.asOfDate, throughDate);
      if (skill.assessmentDate && fromDate < skill.assessmentDate) fresh.validThrough = false;
      // Level and dated eligibility are separate known constraints. A low level
      // remains a failure even when its evidence also needs freshness review.
      if (!fresh.validThrough && skill.level < required.minimumLevel) add("required_skill", "failed", "insufficient_level", detail);
      if (!fresh.validThrough) add("required_skill", "unknown", fresh.freshness === "unknown" ? "missing" : fresh.freshness === "stale" ? "stale" : "invalid_through_work", { ...detail, freshness: fresh.freshness });
      else add("required_skill", skill.level >= required.minimumLevel ? "passed" : "failed", skill.level >= required.minimumLevel ? "satisfied" : "insufficient_level", { ...detail, freshness: fresh.freshness });
    }
    let minimumRemainingAfterRequest: number | null = null, completeCapacity = true;
    for (const request of demand.days) {
      const day = resource.days.find(d => d.date === request.date), detail = { date: request.date };
      add("calendar_coverage", day?.certified ? "passed" : "unknown", day?.certified ? "satisfied" : day ? "uncertified_date" : "missing", detail);
      if (!day?.certified || day.remainingMinutes === null) { add("capacity", "unknown", "missing", detail); completeCapacity = false; }
      else {
        const after = day.remainingMinutes - request.requiredMinutes;
        minimumRemainingAfterRequest = minimumRemainingAfterRequest === null ? after : Math.min(minimumRemainingAfterRequest, after);
        add("capacity", after >= 0 ? "passed" : "failed", after >= 0 ? "satisfied" : "insufficient_minutes", detail);
      }
      if (demand.overlapRequired) {
        if (!day?.certified || day.overlapMinutes === null) add("overlap", "unknown", "missing", detail);
        else add("overlap", day.overlapMinutes >= demand.minimumOverlapMinutes! ? "passed" : "failed", day.overlapMinutes >= demand.minimumOverlapMinutes! ? "satisfied" : "insufficient_overlap", detail);
      }
    }
    const desiredSkillCount = demand.desiredSkills.filter(desired => {
      const skill = resource.skills.find(s => s.skillId === desired.skillId);
      return skill?.eligible && skill.assessmentDate !== null && skill.assessmentDate <= fromDate &&
        skill.level >= desired.minimumLevel && competencyFreshness(skill, resource.asOfDate, throughDate).validThrough;
    }).length;
    const status = constraints.some(c => c.outcome === "failed") ? "ineligible" : constraints.some(c => c.outcome === "unknown") ? "needs_review" : "eligible";
    return { resourceId: resource.resourceId, status, desiredSkillCount, minimumRemainingAfterRequest: completeCapacity ? minimumRemainingAfterRequest : null,
      availabilityFreshness: availability.freshness, constraints } satisfies StaffingMatch;
  });
  const groups = { eligible: 0, needs_review: 1, ineligible: 2 };
  return results.sort((a, b) => groups[a.status] - groups[b.status] || (a.status === "eligible" && b.status === "eligible"
    ? b.desiredSkillCount - a.desiredSkillCount || b.minimumRemainingAfterRequest! - a.minimumRemainingAfterRequest! : 0) ||
    (a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0));
}
