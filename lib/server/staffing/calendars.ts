import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingIdSchema, STAFFING_LIMITS } from "../../contracts/staffing";
import { staffingCreateCalendarSchema, staffingReviseCalendarSchema, staffingCalendarPeriodSchema, staffingCalendarInputSchema } from "../../contracts/staffing-calendar";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { parseStaffing, runStaffingCommand, staffingSha256, tryStaffingCommandReplay } from "./commands";
import { lockResourceHeads } from "./resources";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { resolveStaffingCalendar, type ResolvedStaffingCalendar } from "./temporal";
import { calculateDailyCapacity, type StaffingInterval } from "../../staffing/calendar";
import { availabilityFreshness } from "../../staffing/freshness";
import { isStaffingManager } from "./read";

async function prepare(actor: StaffingActor, resourceId: string, timezone: string) {
  return withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager", { write: true });
    const [resource] = await lockResourceHeads(db, actor, [resourceId]);
    const profile = (await db.query(`SELECT timezone FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE`, [resource.current_revision_id])).rows[0];
    if (!resource.active || !profile) throw new HttpFailure(409, "source_changed", "Resource unavailable");
    if (profile.timezone !== timezone) throw new HttpFailure(422, "invalid_input", "Calendar must use the resource timezone");
    return { revisionId: resource.current_revision_id, aggregateVersion: resource.aggregate_version };
  });
}
async function append(db: PoolClient, actor: StaffingActor, resourceId: string, calendarId: string, version: number,
  resolved: ResolvedStaffingCalendar, rationale: string) {
  const revisionId = randomUUID(), env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const content = { calendar: resolved.input, intervals: resolved.intervals, timezoneDataVersion: resolved.timezoneDataVersion };
  if (Buffer.byteLength(JSON.stringify(content), "utf8") > STAFFING_LIMITS.revisionBytes) throw new HttpFailure(413, "too_large", "Resolved calendar exceeds revision limit");
  const digest = staffingSha256(content), input = resolved.input;
  await db.query(`INSERT INTO resource_calendar_revisions(id,environment_id,workspace_id,calendar_id,resource_id,revision_number,
    content_digest,timezone,timezone_data_version,from_date,to_date,observed_at,next_review_at,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [revisionId, env, actor.workspaceId, calendarId, resourceId,
    version, digest, input.timezone, resolved.timezoneDataVersion, input.fromDate, input.toDate, input.observedAt, input.nextReviewAt, actor.membershipId]);
  await db.query(`INSERT INTO resource_calendar_payloads(revision_id,content,rationale) VALUES($1,$2,$3)`, [revisionId, JSON.stringify(content), rationale]);
  for (const row of resolved.intervals) await db.query(`INSERT INTO resource_calendar_intervals(id,environment_id,workspace_id,
    revision_id,resource_id,service_date,kind,ordinal,start_at,end_at,local_start,local_end,explicit_start_offset,explicit_end_offset)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [randomUUID(), env, actor.workspaceId, revisionId, resourceId,
    row.serviceDate, row.kind, row.ordinal, row.startAt, row.endAt, row.localStart, row.localEnd, row.explicitStartOffset, row.explicitEndOffset]);
  // Only explicitly certified dates select this revision. Other date selections
  // and every confirmed allocation/ledger survive a narrower replacement.
  for (const day of resolved.days) await db.query(`INSERT INTO resource_calendar_days(resource_id,service_date,revision_id)
    VALUES($1,$2,$3) ON CONFLICT(resource_id,service_date) DO UPDATE SET revision_id=excluded.revision_id`, [resourceId, day.date, revisionId]);
  await db.query(`UPDATE resource_calendars SET aggregate_version=$2 WHERE id=$1`, [calendarId, version]);
  return { entityId: calendarId, resourceId, revisionId, contentDigest: digest, aggregateVersion: version, state: "approved" };
}
/** Syntax/authority preflight -> local timezone resolution outside DB locks ->
 * current resource/head recheck and atomic publication. No caller UTC is trusted. */
export async function approveCalendar(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const resourceId = parseStaffing(staffingIdSchema, rawId);
  const input = raw && typeof raw === "object" && Object.hasOwn(raw, "revisionId")
    ? parseStaffing(staffingReviseCalendarSchema, raw) : parseStaffing(staffingCreateCalendarSchema, raw);
  const expected = "revisionId" in input ? parseStaffing(staffingReviseCalendarSchema, input) : null;
  const request = { ...input, resourceId, action: "calendar_approve" };
  const receipt = await tryStaffingCommandReplay(actor, request, { capability: "manager" });
  if (receipt) return receipt;
  const snapshot = await prepare(actor, resourceId, input.calendar.timezone);
  const resolved = resolveStaffingCalendar(input.calendar);
  return runStaffingCommand(actor, request, { capability: "manager" }, async db => {
    const [resource] = await lockResourceHeads(db, actor, [resourceId], "UPDATE");
    if (!resource.active || resource.current_revision_id !== snapshot.revisionId || resource.aggregate_version !== snapshot.aggregateVersion) {
      throw new HttpFailure(409, "source_changed", "Resource changed; reload");
    }
    let head = (await db.query(`SELECT id,aggregate_version FROM resource_calendars WHERE resource_id=$1
      AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`, [resourceId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (head) {
      const revision = (await db.query(`SELECT id,content_digest FROM resource_calendar_revisions WHERE calendar_id=$1
        ORDER BY revision_number DESC LIMIT 1`, [head.id])).rows[0];
      if (!expected || expected.revisionId !== revision?.id || expected.contentDigest !== revision.content_digest ||
        expected.expectedAggregateVersion !== Number(head.aggregate_version)) throw new HttpFailure(409, "version_conflict", "Calendar changed; reload");
    } else {
      if (expected) throw new HttpFailure(409, "version_conflict", "Calendar changed; reload");
      head = { id: randomUUID(), aggregate_version: 0 };
      await db.query(`INSERT INTO resource_calendars(id,environment_id,workspace_id,resource_id)
        VALUES($1,$2,$3,$4)`, [head.id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceId]);
    }
    return append(db, actor, resourceId, head.id, Number(head.aggregate_version) + 1, resolved, input.rationale);
  });
}
function periodDates(from: string, to: string) {
  return Array.from({ length: (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10));
}
function businessDate(value: Date | string) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
/** Daily operational totals contain neither raw interval categories nor other
 * customer assignment identities. Missing approved dates remain unknown. */
export async function readCalendar(actor: StaffingActor, rawId: unknown, rawPeriod: unknown, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawId), period = parseStaffing(staffingCalendarPeriodSchema, rawPeriod);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const [resource] = await lockResourceHeads(db, actor, [resourceId]);
    const profile = (await db.query(`SELECT timezone FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE`, [resource.current_revision_id])).rows[0];
    if (!profile) throw hiddenRecord();
    const head = (await db.query(`SELECT id,aggregate_version FROM resource_calendars WHERE resource_id=$1 AND environment_id=$2
      AND workspace_id=$3 FOR SHARE`, [resourceId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    const current = (await db.query(`SELECT day.service_date::text,day.revision_id,r.content_digest,r.timezone,r.timezone_data_version,r.observed_at,r.next_review_at
      FROM resource_calendar_days day JOIN resource_calendar_revisions r ON r.id=day.revision_id AND r.resource_id=day.resource_id
      WHERE day.resource_id=$1 AND day.service_date BETWEEN $2 AND $3 ORDER BY day.service_date FOR SHARE OF day`, [resourceId, period.fromDate, period.toDate])).rows;
    const ledger = (await db.query(`SELECT service_date::text,confirmed_minutes,generation FROM staffing_capacity_days
      WHERE resource_id=$1 AND service_date BETWEEN $2 AND $3 ORDER BY service_date FOR SHARE`, [resourceId, period.fromDate, period.toDate])).rows;
    const intervals = (await db.query(`SELECT revision_id,service_date::text,kind,start_at,end_at FROM resource_calendar_intervals
      WHERE resource_id=$1 AND revision_id=ANY($2::uuid[]) AND service_date BETWEEN $3 AND $4
      ORDER BY service_date,kind,ordinal`, [resourceId, [...new Set(current.map(day => day.revision_id))], period.fromDate, period.toDate])).rows;
    const usage = (await db.query(`SELECT service_date::text,SUM(minutes) FILTER(WHERE billable) AS billable FROM staffing_allocation_days
      WHERE resource_id=$1 AND service_date BETWEEN $2 AND $3 GROUP BY service_date`, [resourceId, period.fromDate, period.toDate])).rows;
    const tentative = (await db.query(`SELECT revision.resource_id,day->>'date' AS service_date,SUM((day->>'minutes')::integer) AS minutes
      FROM staffing_allocations a JOIN staffing_allocation_revisions revision ON revision.id=a.current_revision_id
      JOIN staffing_allocation_payloads p ON p.revision_id=revision.id CROSS JOIN LATERAL jsonb_array_elements(p.content->'days') day
      WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.state='tentative' AND a.reservation_expires_at>clock_timestamp()
        AND revision.resource_id=$3 AND (day->>'date')::date BETWEEN $4 AND $5 GROUP BY revision.resource_id,service_date`,
      [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceId, period.fromDate, period.toDate])).rows;
    const asOf = new Date().toISOString(), latest = head ? (await db.query(`SELECT id,content_digest FROM resource_calendar_revisions
      WHERE calendar_id=$1 ORDER BY revision_number DESC LIMIT 1`, [head.id])).rows[0] : null;
    const manager = isStaffingManager(actor) && resource.active;
    const authored = manager && latest ? (await db.query(`SELECT content,rationale FROM resource_calendar_payloads
      WHERE revision_id=$1 FOR SHARE`, [latest.id])).rows[0] : null;
    const authoredCalendar = authored ? parseStaffing(staffingCalendarInputSchema, authored.content.calendar) : null;
    return { contractVersion: "staffing-v1" as const, resourceId, timezone: profile.timezone as string, active: resource.active,
      asOf, calendarId: head?.id ?? null, revisionId: latest?.id ?? null, contentDigest: latest?.content_digest ?? null,
      aggregateVersion: head ? Number(head.aggregate_version) : null, fromDate: period.fromDate, toDate: period.toDate,
      ...(manager ? { manager: authoredCalendar?.timezone === profile.timezone ? { calendar: authoredCalendar,
        rationale: authored.rationale as string } : null } : {}),
      days: periodDates(period.fromDate, period.toDate).map(date => {
        const day = current.find(row => businessDate(row.service_date) === date), committed = ledger.find(row => businessDate(row.service_date) === date);
        const billable = Number(usage.find(row => businessDate(row.service_date) === date)?.billable ?? 0);
        const tentativeMinutes = Number(tentative.find(row => businessDate(row.service_date) === date)?.minutes ?? 0);
        const identity = { date, confirmedMinutes: Number(committed?.confirmed_minutes ?? 0), tentativeMinutes,
          capacityGeneration: committed ? Number(committed.generation) : null, revisionId: day?.revision_id ?? null };
        if (!resource.active || !day || day.timezone !== profile.timezone) return { ...identity, capacity: null,
          freshness: "unknown" as const, needsReview: true, reason: !resource.active ? "resource_inactive" : !day ? "calendar_missing" : "resource_timezone_changed" };
        const rows = intervals.filter(row => row.revision_id === day.revision_id && businessDate(row.service_date) === date);
        const set = (kind: string): StaffingInterval[] => rows.filter(row => row.kind === kind).map(row => [new Date(row.start_at).getTime() / 60_000, new Date(row.end_at).getTime() / 60_000]);
        const capacity = calculateDailyCapacity({ contracted: set("contracted"), holidays: set("holiday"), leave: set("leave"), protected: set("protected"),
          confirmed: identity.confirmedMinutes, billable, tentative: tentativeMinutes });
        const fresh = availabilityFreshness({ observedAt: new Date(day.observed_at).toISOString(), nextReviewAt: new Date(day.next_review_at).toISOString() }, asOf);
        return { ...identity, capacity, contentDigest: day.content_digest as string, timezoneDataVersion: day.timezone_data_version as string,
          freshness: fresh.freshness, needsReview: capacity.needsReview || !fresh.validThrough, reason: fresh.validThrough ? null : "availability_review_required" };
      }) };
  };
  return client ? run(client) : withTransaction(run);
}
