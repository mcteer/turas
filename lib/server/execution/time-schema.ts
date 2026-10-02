import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { HttpFailure } from "../../contracts/http";
import { executionId, executionVersion, executionHash, executionRationale, executionKey, executionDate, executionTimezone } from "./fields";

export const timeExceptionCodes = ["on_behalf", "unplanned", "over_capacity", "unknown_capacity", "unavailable_source", "post_closeout"] as const;
export type TimeExceptionCode = typeof timeExceptionCodes[number];
export const timeExceptionsSchema = z.object({ on_behalf: executionRationale.optional(), unplanned: executionRationale.optional(),
  over_capacity: executionRationale.optional(), unknown_capacity: executionRationale.optional(),
  unavailable_source: executionRationale.optional(), post_closeout: executionRationale.optional() }).strict();
export const timeInputSchema = z.object({ baselineId: executionId, resourceId: executionId, workPackageKey: executionKey,
  serviceDate: executionDate, timezone: executionTimezone, minutes: z.number().int().min(1).max(1440), billable: z.boolean(),
  activityRevisionId: executionId, allocationRevisionId: executionId.nullable(), note: executionRationale,
  onBehalfRationale: executionRationale.nullable() }).strict();
export type TimeInput = z.infer<typeof timeInputSchema>;
export const timeIdentitySchema = z.object({ entryId: executionId, revisionId: executionId, contentDigest: executionHash }).strict();
export const timeBatchSchema = z.object({ entries: z.array(timeIdentitySchema.extend({ version: executionVersion,
  exceptions: timeExceptionsSchema }).strict()).min(1).max(25).refine(rows => new Set(rows.map(r => r.entryId)).size === rows.length) }).strict();
export function requirePastServiceDate(date: string, timezone: string) {
  if (Temporal.PlainDate.compare(date, Temporal.Now.plainDateISO(timezone)) > 0)
    throw new HttpFailure(422, "invalid_input", "Service date cannot be in the future in its declared timezone");
}
export function executionTimezoneVersion() {
  const { node, icu, tz } = process.versions;
  if (!node.startsWith("24.") || !icu || !tz) throw new HttpFailure(503, "timezone_unavailable", "Pinned timezone runtime unavailable");
  return `node=${node};icu=${icu};tz=${tz};temporal=0.5.1`;
}
