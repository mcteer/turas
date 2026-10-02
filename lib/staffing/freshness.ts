import { staffingDateSchema, staffingTimestampSchema } from "../contracts/staffing";
export type StaffingFreshness = "recent" | "aging" | "stale" | "unknown";
const day = 86_400_000;
export function competencyFreshness(observation: { assessmentDate: string | null; nextReviewDate: string | null } | null,
  asOfDate: string, throughDate = asOfDate): { freshness: StaffingFreshness; validThrough: boolean; ageDays: number | null } {
  if (!observation || !staffingDateSchema.safeParse(observation.assessmentDate).success ||
    !staffingDateSchema.safeParse(observation.nextReviewDate).success || !staffingDateSchema.safeParse(asOfDate).success ||
    !staffingDateSchema.safeParse(throughDate).success) return { freshness: "unknown", validThrough: false, ageDays: null };
  const ageDays = (Date.parse(asOfDate) - Date.parse(observation.assessmentDate!)) / day;
  if (ageDays < 0 || observation.nextReviewDate! < observation.assessmentDate!) return { freshness: "unknown", validThrough: false, ageDays };
  const freshness = ageDays > 180 || asOfDate > observation.nextReviewDate! ? "stale" : ageDays <= 90 ? "recent" : "aging";
  const maximumDate = new Date(Date.parse(observation.assessmentDate!) + 180 * day).toISOString().slice(0, 10);
  return { freshness, ageDays, validThrough: freshness !== "stale" && throughDate <= observation.nextReviewDate! && throughDate <= maximumDate };
}
/** Availability age is evaluated now, not at a future service date. Certified
 * calendar coverage is checked independently across every requested resource day. */
export function availabilityFreshness(observation: { observedAt: string | null; nextReviewAt: string | null } | null,
  asOf: string): { freshness: StaffingFreshness; validThrough: boolean; ageDays: number | null } {
  if (!observation || !staffingTimestampSchema.safeParse(observation.observedAt).success ||
    !staffingTimestampSchema.safeParse(observation.nextReviewAt).success || !staffingTimestampSchema.safeParse(asOf).success) {
    return { freshness: "unknown", validThrough: false, ageDays: null };
  }
  const ageDays = (Date.parse(asOf) - Date.parse(observation.observedAt!)) / day;
  if (ageDays < 0 || Date.parse(observation.nextReviewAt!) < Date.parse(observation.observedAt!)) {
    return { freshness: "unknown", validThrough: false, ageDays };
  }
  const freshness = ageDays > 14 || Date.parse(asOf) > Date.parse(observation.nextReviewAt!) ? "stale" : ageDays <= 7 ? "recent" : "aging";
  return { freshness, ageDays, validThrough: freshness !== "stale" };
}
