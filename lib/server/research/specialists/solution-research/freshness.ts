import { z } from "zod";

export const informationTypeSchema = z.enum(["account_status", "availability_pricing", "product_capability", "architecture", "process_adoption"]);
export type InformationType = z.infer<typeof informationTypeSchema>;
// Initial operating policy, not an empirically calibrated probability of truth.
export const freshnessWindows: Record<InformationType, number> = {
  account_status: 7, availability_pricing: 14, product_capability: 30,
  architecture: 180, process_adoption: 90,
};
export const freshnessSchema = z.object({
  policyVersion: z.literal(1), informationType: informationTypeSchema,
  rating: z.enum(["recent", "aging", "stale", "unknown"]),
  dateBasis: z.enum(["publication", "source_title", "observation", "unknown"]),
  evidenceDate: z.iso.date().nullable(), ageDays: z.number().int().nonnegative().nullable(),
  checkedAt: z.iso.datetime().nullable(), reviewWindowDays: z.number().int().positive(),
  action: z.enum(["use_with_scope", "verify_before_current_decision", "seek_date_or_corroboration"]),
  reason: z.string(),
}).strict();

export function rateFreshness(input: { informationType?: InformationType; dateBasis?: "publication" | "source_title" | "observation"; evidenceDate?: string | null; checkedAt?: string | null; reviewAfter?: string | null }, now = new Date()) {
  const informationType = input.informationType ?? "product_capability";
  const reviewWindowDays = freshnessWindows[informationType];
  const date = z.iso.date().safeParse(input.evidenceDate);
  const checked = z.iso.datetime().safeParse(input.checkedAt);
  const elapsed = date.success ? now.getTime() - Date.parse(date.data + "T00:00:00Z") : NaN;
  const ageDays = Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 86400000) : null;
  const overdue = input.reviewAfter != null && input.reviewAfter <= now.toISOString().slice(0, 10);
  const rating = ageDays === null ? "unknown" : overdue || ageDays > 2 * reviewWindowDays ? "stale" : ageDays > reviewWindowDays ? "aging" : "recent";
  return freshnessSchema.parse({
    policyVersion: 1, informationType, rating, dateBasis: ageDays === null ? "unknown" : input.dateBasis ?? "observation", evidenceDate: ageDays === null ? null : date.data,
    ageDays, checkedAt: checked.success ? checked.data : null, reviewWindowDays,
    action: rating === "unknown" ? "seek_date_or_corroboration" : rating === "recent" ? "use_with_scope" : "verify_before_current_decision",
    reason: rating === "unknown"
      ? "No verified evidence date. Retrieval time does not establish claim age. Seek a dated primary source or current corroboration; if unavailable, preserve the gap without repeating the same lookup."
      : `${ageDays} days since the evidence date; ${reviewWindowDays}-day review window for ${informationType}.${overdue ? " Explicit review date is due." : ""} ${rating === "recent" ? "Recent is not verified truth; retain scope and resolve conflicts." : "Refresh decision-critical current claims. Older evidence remains usable as attributed history, not proof of present state."}`,
  });
}

export const evidenceFreshnessSchema = freshnessSchema.extend({ id: z.string(), url: z.url().nullable() });
