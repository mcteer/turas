import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { STAFFING_LIMITS, staffingIdSchema } from "../../contracts/staffing";
import { staffingCalendarPeriodSchema } from "../../contracts/staffing-calendar";
import { HttpFailure } from "../../contracts/http";
import { parseStaffing } from "./commands";
import { getServerConfig } from "../config";
import type { StaffingActor } from "./policy";
import { calculateDailyCapacity, subtractIntervals, intersectIntervals, type StaffingInterval } from "../../staffing/calendar";

type CalendarDayInput = { date: string; revisionId: string | null; contentDigest: string | null;
  capacityGeneration: number | null; confirmedMinutes: number; timezone: string | null; timezoneDataVersion: string | null;
  observedAt: string | null; nextReviewAt: string | null; contractedMinutes: number | null; availableMinutes: number | null; protectedMinutes: number | null; remainingMinutes: number | null; overlapMinutes: number | null };
type IntervalBucket = { contracted: StaffingInterval[]; holiday: StaffingInterval[]; leave: StaffingInterval[]; protected: StaffingInterval[] };
// Only immutable revision intervals are cached. Current date selection, ledger,
// actor/source eligibility and resource state are always read and locked anew.
// Bounded private in-process data expire without publication or disk persistence.
const intervalCache = new Map<string, { bucket: IntervalBucket; contracted: number; available: number; protected: number; expires: number }>();
const cacheLifetimeMs = 600_000, maxCachedDays = 100_000;
// Cache only the derived operational calendar. Every use first locks the current
// capacity ledger and hashes all selected day/revision and ledger identities in
// the same transaction. Resource locks held by callers stop calendar writers;
// the ledger locks stop confirmations until the caller commits. No source or
// personnel prose is cached, and a missed/changed hash rebuilds the projection.
const calendarCache = new Map<string, { signature: string; days: Map<string, CalendarDayInput[]>; expires: number }>();
const maxCalendarEntries = 2;
const calendarSignatures = new WeakMap<Map<string, CalendarDayInput[]>, string>();
export function matchingCalendarSignature(days: Map<string, CalendarDayInput[]>): string {
  const signature = calendarSignatures.get(days);
  if (!signature) throw new Error("Matching calendar has no current transaction signature");
  return signature;
}
async function currentCalendarSignature(db: PoolClient, ids: string[], fromDate: string, toDate: string,
  capacityLock: "SHARE" | "none") {
  const result = await db.query<{ calendar_hash: string; capacity_hash: string }>(`WITH selected AS MATERIALIZED (
      SELECT resource_id,service_date,revision_id FROM resource_calendar_days
      WHERE resource_id=ANY($1::uuid[]) AND service_date BETWEEN $2 AND $3
    ), capacity AS MATERIALIZED (
      SELECT resource_id,service_date,confirmed_minutes,generation FROM staffing_capacity_days
      WHERE resource_id=ANY($1::uuid[]) AND service_date BETWEEN $2 AND $3
      ${capacityLock === "SHARE" ? "FOR SHARE" : ""}
    )
    SELECT (SELECT encode(sha256(convert_to(COALESCE(string_agg(
      resource_id::text||'/'||service_date::text||'/'||revision_id::text,'|' ORDER BY resource_id,service_date),''),'UTF8')),'hex') FROM selected) AS calendar_hash,
      (SELECT encode(sha256(convert_to(COALESCE(string_agg(
      resource_id::text||'/'||service_date::text||'/'||confirmed_minutes::text||'/'||generation::text,'|' ORDER BY resource_id,service_date),''),'UTF8')),'hex') FROM capacity) AS capacity_hash`,
    [ids, fromDate, toDate]);
  return `${result.rows[0].calendar_hash}:${result.rows[0].capacity_hash}`;
}
/** Internal batch only: the caller must have locked the authorized demand,
 * competency sources/heads and all sorted resources first. Calendar writers
 * take resource UPDATE before changing any day selection, so the caller's
 * resource SHARE lock protects the selected immutable revisions. Ledger rows
 * retain their own locks because commitments can change under resource SHARE.
 * Reads no personnel prose, leave category, finance or other-customer identity. */
export async function readMatchingCalendars(db: PoolClient, actor: StaffingActor, rawIds: string[], rawPeriod: unknown,
  overlap: readonly { date: string; startAt: string; endAt: string }[] = [], capacityLock: "SHARE" | "none" = "SHARE") {
  const period = parseStaffing(staffingCalendarPeriodSchema, rawPeriod), ids = [...new Set(rawIds)].sort();
  if (rawIds.length !== ids.length || ids.length > STAFFING_LIMITS.resources) throw new HttpFailure(422, "invalid_input", "Invalid matching resource pool");
  ids.forEach(id => parseStaffing(staffingIdSchema, id));
  if (!ids.length) {
    const empty = new Map<string, CalendarDayInput[]>();
    calendarSignatures.set(empty, createHash("sha256").update("empty-calendar-pool-v1").digest("hex"));
    return empty;
  }
  const cacheKey = createHash("sha256").update(JSON.stringify({ environment: getServerConfig().TURAS_ENVIRONMENT_ID,
    workspace: actor.workspaceId, ids, period, overlap, capacityLock })).digest("hex");
  const signature = await currentCalendarSignature(db, ids, period.fromDate, period.toDate, capacityLock);
  const cached = calendarCache.get(cacheKey);
  if (cached && cached.signature === signature && cached.expires > Date.now()) {
    calendarCache.delete(cacheKey); calendarCache.set(cacheKey, cached);
    return cached.days;
  }
  const current = (await db.query(`SELECT d.resource_id,d.service_date::text,d.revision_id,r.content_digest,r.timezone,
    r.timezone_data_version,r.observed_at,r.next_review_at FROM resource_calendar_days d
    JOIN resource_calendar_revisions r ON r.id=d.revision_id AND r.resource_id=d.resource_id
    WHERE d.resource_id=ANY($1::uuid[]) AND d.service_date BETWEEN $2 AND $3 ORDER BY d.resource_id,d.service_date`,
    [ids, period.fromDate, period.toDate])).rows;
  const ledgers = (await db.query(`SELECT resource_id,service_date::text,confirmed_minutes,generation FROM staffing_capacity_days
    WHERE resource_id=ANY($1::uuid[]) AND service_date BETWEEN $2 AND $3 ORDER BY resource_id,service_date ${capacityLock === "SHARE" ? "FOR SHARE" : ""}`,
    [ids, period.fromDate, period.toDate])).rows;
  const currentByDate = new Map(current.map(row => [`${row.resource_id}:${row.service_date}`, row]));
  const ledgersByDate = new Map(ledgers.map(row => [`${row.resource_id}:${row.service_date}`, row]));
  const scope = `${getServerConfig().TURAS_ENVIRONMENT_ID}:${actor.workspaceId}:`, asOf = Date.now();
  const intervalKey = (row: { resource_id: string; revision_id: string; service_date: string }) =>
    `${scope}${row.resource_id}:${row.revision_id}:${row.service_date}`;
  const missing = current.filter(row => {
    const entry = intervalCache.get(intervalKey(row));
    return !entry || entry.expires <= asOf;
  });
  if (missing.length) {
    const intervals = (await db.query(`SELECT resource_id,revision_id,service_date::text,kind,start_at,end_at FROM resource_calendar_intervals
      WHERE resource_id=ANY($1::uuid[]) AND revision_id=ANY($2::uuid[]) AND service_date BETWEEN $3 AND $4
      ORDER BY resource_id,service_date,kind,ordinal`, [[...new Set(missing.map(row => row.resource_id))],
        [...new Set(missing.map(row => row.revision_id))], period.fromDate, period.toDate])).rows;
    const missingKeys = new Set(missing.map(intervalKey));
    const grouped = new Map<string, IntervalBucket>();
    for (const row of intervals) {
      const selected = currentByDate.get(`${row.resource_id}:${row.service_date}`);
      if (selected?.revision_id !== row.revision_id || !missingKeys.has(intervalKey(row))) continue;
      if (!["contracted", "holiday", "leave", "protected"].includes(row.kind)) throw new HttpFailure(503, "staffing_calendar_unavailable", "Calendar unavailable");
      const key = intervalKey(row), bucket = grouped.get(key) ?? { contracted: [], holiday: [], leave: [], protected: [] };
      bucket[row.kind as keyof IntervalBucket].push([new Date(row.start_at).getTime() / 60_000, new Date(row.end_at).getTime() / 60_000]);
      grouped.set(key, bucket);
    }
    if (intervalCache.size + missing.length > maxCachedDays) intervalCache.clear();
    for (const row of missing) {
      const bucket = grouped.get(intervalKey(row)) ?? { contracted: [], holiday: [], leave: [], protected: [] };
      const capacity = calculateDailyCapacity({ contracted: bucket.contracted, holidays: bucket.holiday, leave: bucket.leave,
        protected: bucket.protected, confirmed: 0, billable: 0, tentative: 0 });
      intervalCache.set(intervalKey(row), { bucket, contracted: capacity.contractedMinutes, available: capacity.availableMinutes,
        protected: capacity.protectedMinutes, expires: asOf + cacheLifetimeMs });
    }
  }
  const dates = Array.from({ length: (Date.parse(period.toDate) - Date.parse(period.fromDate)) / 86_400_000 + 1 },
    (_, index) => new Date(Date.parse(period.fromDate) + index * 86_400_000).toISOString().slice(0, 10));
  const overlaps = new Map(overlap.map(row => [row.date, [Date.parse(row.startAt) / 60_000, Date.parse(row.endAt) / 60_000] as StaffingInterval]));
  const result = new Map(ids.map(resourceId => [resourceId, dates.map(date => {
    const key = `${resourceId}:${date}`, selected = currentByDate.get(key), ledger = ledgersByDate.get(key);
    const identity = { date, revisionId: selected?.revision_id ?? null, contentDigest: selected?.content_digest ?? null,
      capacityGeneration: ledger ? Number(ledger.generation) : null, confirmedMinutes: Number(ledger?.confirmed_minutes ?? 0), timezone: selected?.timezone ?? null,
      timezoneDataVersion: selected?.timezone_data_version ?? null,
      observedAt: selected ? new Date(selected.observed_at).toISOString() : null,
      nextReviewAt: selected ? new Date(selected.next_review_at).toISOString() : null };
    if (!selected) return { ...identity, contractedMinutes: null, availableMinutes: null, protectedMinutes: null, remainingMinutes: null, overlapMinutes: null } satisfies CalendarDayInput;
    const entry = intervalCache.get(intervalKey(selected));
    if (!entry || entry.expires <= asOf) throw new HttpFailure(503, "staffing_calendar_unavailable", "Calendar unavailable");
    const confirmed = Number(ledger?.confirmed_minutes ?? 0);
    if (!Number.isSafeInteger(confirmed) || confirmed < 0) throw new HttpFailure(503, "staffing_calendar_unavailable", "Calendar unavailable");
    const window = overlaps.get(date), bucket = entry.bucket;
    const overlapMinutes = window ? intersectIntervals(
      subtractIntervals(bucket.contracted, [...bucket.holiday, ...bucket.leave, ...bucket.protected]), [window])
      .reduce((total, [from, to]) => total + to - from, 0) : null;
    return { ...identity, contractedMinutes: entry.contracted, availableMinutes: entry.available,
      protectedMinutes: entry.protected, remainingMinutes: entry.available - entry.protected - confirmed, overlapMinutes } satisfies CalendarDayInput;
  })]));
  calendarSignatures.set(result, signature);
  calendarCache.delete(cacheKey);
  calendarCache.set(cacheKey, { signature, days: result, expires: Date.now() + cacheLifetimeMs });
  while (calendarCache.size > maxCalendarEntries) calendarCache.delete(calendarCache.keys().next().value!);
  return result;
}
