import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HttpFailure } from "../../contracts/http";
import { staffingCalendarInputSchema, staffingLocalWindowSchema, type StaffingCalendarInput } from "../../contracts/staffing-calendar";
import { staffingDemandInputSchema, type StaffingDemandInput } from "../../contracts/staffing-demands";
import { calculateDailyCapacity, type StaffingInterval } from "../../staffing/calendar";
import { parseStaffing } from "./commands";

// The adapter is intentionally a lazy optional load while the dependency pin is
// pending. It has no Date/Intl/native-Temporal fallback and refuses other versions.
// Load/resolve outside DB transactions; approval reauthorizes in its own short tx.
type Zoned = { epochMilliseconds: number; offset: string;
  toPlainDateTime: () => { toString: (options: { smallestUnit: "minute" }) => string } };
type PlainDate = { toZonedDateTime: (zone: string) => Zoned };
type TemporalApi = { ZonedDateTime: { from: (value: string,
  options: { disambiguation: "reject"; offset: "reject"; overflow: "reject" }) => Zoned };
  PlainDate: { from: (date: string) => PlainDate } };
let loaded: TemporalApi | undefined;
function temporal(): TemporalApi {
  if (loaded) return loaded;
  try {
    const localRequire = createRequire(resolve(process.cwd(), "package.json"));
    const entry = localRequire.resolve("@js-temporal/polyfill");
    const metadata = JSON.parse(readFileSync(resolve(dirname(entry), "../package.json"), "utf8"));
    if (metadata.name !== "@js-temporal/polyfill" || metadata.version !== "0.5.1") throw new Error("Pinned version required");
    const module = localRequire("@js-temporal/polyfill") as { Temporal: TemporalApi };
    if (!module.Temporal?.ZonedDateTime?.from || !module.Temporal.PlainDate?.from) throw new Error("Temporal unavailable");
    loaded = module.Temporal; return loaded;
  } catch { throw new HttpFailure(503, "staffing_calendar_unavailable", "Pinned staffing timezone resolver unavailable"); }
}
function timezoneDataVersion() {
  const { node, icu, tz } = process.versions;
  if (!node.startsWith("24.") || !icu || !tz) throw new HttpFailure(503, "staffing_calendar_unavailable", "Staffing timezone data unavailable");
  return `node=${node};icu=${icu};tz=${tz};temporal=0.5.1`;
}
const invalidTime = () => new HttpFailure(422, "invalid_calendar_time", "Calendar interval cannot be resolved within its certified limits");
function endpoint(api: TemporalApi, local: string, zone: string, offset: string | null) {
  const resolved = api.ZonedDateTime.from(`${local}:00${offset ?? ""}[${zone}]`,
    { disambiguation: "reject", offset: "reject", overflow: "reject" });
  if (!Number.isSafeInteger(resolved.epochMilliseconds) || resolved.epochMilliseconds % 60_000 !== 0 ||
    resolved.toPlainDateTime().toString({ smallestUnit: "minute" }) !== local || (offset !== null && resolved.offset !== offset)) throw invalidTime();
  return resolved.epochMilliseconds;
}
function dayAfter(date: string) { return new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10); }
export type ResolvedStaffingCalendarInterval = { serviceDate: string; kind: "contracted" | "holiday" | "leave" | "protected";
  ordinal: number; startAt: string; endAt: string; localStart: string; localEnd: string;
  explicitStartOffset: string | null; explicitEndOffset: string | null };
export function resolveStaffingCalendar(raw: unknown) {
  const input = parseStaffing(staffingCalendarInputSchema, raw), api = temporal(), version = timezoneDataVersion();
  const buckets = new Map(input.days.map(day => [day.date, { contracted: [] as StaffingInterval[], holiday: [] as StaffingInterval[],
    leave: [] as StaffingInterval[], protected: [] as StaffingInterval[] }]));
  const intervals: ResolvedStaffingCalendarInterval[] = [];
  try {
    for (const day of input.days) for (const [field, kind] of [["contracted", "contracted"], ["holidays", "holiday"], ["leave", "leave"], ["protected", "protected"]] as const) {
      for (const window of day[field]) {
        const start = endpoint(api, window.from, input.timezone, window.fromOffset), end = endpoint(api, window.to, input.timezone, window.toOffset);
        if (end <= start) throw invalidTime();
        for (let date = window.date; date <= window.to.slice(0, 10); date = dayAfter(date)) {
          // PlainDate.toZonedDateTime(zone) uses the first valid instant of the
          // local date, including midnight gaps/folds. User endpoints above still
          // require explicit valid disambiguation; no clock hour is invented.
          const next = dayAfter(date), dateStart = api.PlainDate.from(date).toZonedDateTime(input.timezone).epochMilliseconds;
          const dateEnd = api.PlainDate.from(next).toZonedDateTime(input.timezone).epochMilliseconds;
          const from = Math.max(start, dateStart), to = Math.min(end, dateEnd);
          if (to <= from) continue;
          const bucket = buckets.get(date);
          if (!bucket || from % 60_000 || to % 60_000) throw invalidTime();
          const ordinal = bucket[kind].length;
          bucket[kind].push([from / 60_000, to / 60_000]);
          intervals.push({ serviceDate: date, kind, ordinal, startAt: new Date(from).toISOString(), endAt: new Date(to).toISOString(),
            localStart: window.from, localEnd: window.to, explicitStartOffset: window.fromOffset, explicitEndOffset: window.toOffset });
        }
      }
    }
    const days = [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({ date,
      capacity: calculateDailyCapacity({ contracted: day.contracted, holidays: day.holiday, leave: day.leave, protected: day.protected,
        confirmed: 0, billable: 0, tentative: 0 }) }));
    return { input, timezoneDataVersion: version, intervals, days };
  } catch (error) {
    if (error instanceof HttpFailure) throw error;
    throw invalidTime();
  }
}
export type ResolvedStaffingCalendar = ReturnType<typeof resolveStaffingCalendar>;
export function resolveStaffingOverlap(raw: NonNullable<StaffingDemandInput["overlap"]>) {
  // Reuse the strict demand-owned overlap shape without accepting scope/head
  // fields or caller-supplied UTC instants.
  const input = parseStaffing(staffingDemandInputSchema.shape.overlap.unwrap(), raw), api = temporal();
  timezoneDataVersion();
  try {
    return input.windows.map(window => {
      parseStaffing(staffingLocalWindowSchema, window);
      const start = endpoint(api, window.from, input.timezone, window.fromOffset), end = endpoint(api, window.to, input.timezone, window.toOffset);
      if (end <= start || (end - start) / 60_000 < input.minimumOverlapMinutes) throw invalidTime();
      return { date: window.date, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(),
        minutes: (end - start) / 60_000, timezone: input.timezone, fromOffset: window.fromOffset, toOffset: window.toOffset };
    });
  } catch (error) { if (error instanceof HttpFailure) throw error; throw invalidTime(); }
}

/** Internal reservation boundary, based on the proposal's immutable creation
 * instant and its first resource-local service date. Never caller-selected UTC. */
export function resolveStaffingReservationDeadline(firstDate: string, timezone: string, createdAt: string, now: string) {
  const api = temporal(); timezoneDataVersion();
  try {
    const midnight = api.PlainDate.from(firstDate).toZonedDateTime(timezone).epochMilliseconds;
    const created = Date.parse(createdAt), current = Date.parse(now);
    const deadline = Math.min(created + 7 * 86_400_000, midnight);
    if (![created, current, deadline].every(Number.isSafeInteger) || created > current || deadline <= current) {
      throw new HttpFailure(409, "reservation_expired", "Reservation would already be expired");
    }
    return new Date(deadline).toISOString();
  } catch (error) { if (error instanceof HttpFailure) throw error; throw invalidTime(); }
}
