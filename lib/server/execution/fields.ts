import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";

export const executionId = z.uuid();
export const executionVersion = z.number().int().positive().safe();
export const executionHash = z.string().regex(/^[a-f0-9]{64}$/);
export const executionRationale = z.string().trim().min(1).max(2000);
export const executionKey = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const executionDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return Temporal.PlainDate.from(value, { overflow: "reject" }).toString() === value; } catch { return false; }
}, "A real ISO date is required");
export const executionTimezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return !/^[+-]/.test(value); } catch { return false; }
}, "An IANA timezone is required");
export const executionPeriodSchema = z.object({ from: executionDate, to: executionDate }).strict().refine(value => {
  try { const days = Temporal.PlainDate.from(value.from).until(Temporal.PlainDate.from(value.to)).days; return days >= 0 && days <= 90; }
  catch { return false; }
}, "Period must contain 1–91 inclusive dates");
export const executionExpectedVersions = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_:.-]{0,99}$/), executionVersion)
  .refine(value => Object.keys(value).length >= 1 && Object.keys(value).length <= 50);
