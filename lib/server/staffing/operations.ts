import type { PoolClient } from "pg";
import { staffingOperationsSchema } from "../../contracts/staffing-operations";
import { HttpFailure } from "../../contracts/http";
import { calculateDailyCapacity, STAFFING_CAPACITY_VERSION, type StaffingInterval } from "../../staffing/calendar";
import { availabilityFreshness, competencyFreshness } from "../../staffing/freshness";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { parseStaffing, staffingSha256 } from "./commands";
import { lockApprovedReadInputs, readStaffingPageCursor, staffingPageCursor } from "./read";
import { observeStaffingRead } from "./telemetry";
import { lockOperationsBaselines, selectOperationsCommitments } from "./operations-baselines";
import { lockStaffingPartnerAuthority, staffingPartnerEligible } from "./partner-authority";
import type { ResourceHead } from "./resources";

/** Customer-authorized resource load, including historical commitments after
 * invalidation. This projection never returns evidence, finance or leave reasons.
 * Calendars and stable capacity are retrieved in batches, before arithmetic. */
export async function readStaffingOperations(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingOperationsSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational", { customerId: input.customerId });
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    const scope = { environment: env, workspace: actor.workspaceId, actor: actor.membershipId,
      session: actor.sessionId, projection: "operations", customerId: input.customerId, fromDate: input.fromDate, toDate: input.toDate };
    const after = readStaffingPageCursor(input.cursor, scope);
    const selected = (await db.query(`SELECT id FROM workforce_resources r WHERE r.environment_id=$1 AND r.workspace_id=$2
      AND ($6::uuid IS NULL OR r.id>$6) AND (
        EXISTS(SELECT 1 FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id
          WHERE day.resource_id=r.id AND day.service_date BETWEEN $4 AND $5 AND a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3)
        OR EXISTS(SELECT 1 FROM staffing_allocations a JOIN staffing_allocation_revisions v ON v.id=a.current_revision_id
          WHERE v.resource_id=r.id AND a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3 AND a.state='tentative'
            AND a.reservation_expires_at>clock_timestamp() AND v.from_date<=$5 AND v.to_date>=$4))
      ORDER BY r.id LIMIT $7`, [env, actor.workspaceId, input.customerId, input.fromDate, input.toDate, after, input.pageSize + 1])).rows;
    const ids = selected.slice(0, input.pageSize).map(row => row.id as string);
    const commitments = (await selectOperationsCommitments(db, actor, input, ids)).rows;
    const baseline = await lockOperationsBaselines(db, actor, input.customerId, commitments);
    const identities = (await db.query<ResourceHead>(`SELECT id,kind,membership_id,partner_organization_id FROM workforce_resources
      WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id`, [env, actor.workspaceId, ids])).rows;
    const partnerAuthority = await lockStaffingPartnerAuthority(db, actor, identities, input.customerId);
    // Original workforce sources and skill heads precede competency/resource
    // locks. Reuse the read fence, including its first-competency phantom check.
    const requiredSkillIds = [...new Set([...baseline.requirements.values()].flat().map(row => row.skillId))].sort();
    const heads = await lockApprovedReadInputs(db, actor, ids, false, [], undefined, "SHARE", undefined, requiredSkillIds);
    // Eligibility metadata only: do not retrieve evidence or personnel prose.
    const assessments = (await db.query(`SELECT c.resource_id,c.skill_id,skill.active,v.level,v.assessment_date::text,v.next_review_date::text,
      COALESCE(CASE WHEN v.manual_evidence_id IS NOT NULL THEN m.state='active' AND m.generation=v.source_generation
        ELSE source.state IN ('ready','reviewed') AND source.generation=v.source_generation
          AND source.current_version_id=v.source_version_id AND extraction.complete AND extraction.scan_clean END,false) AS eligible
      FROM workforce_competencies c JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
      JOIN workforce_skills skill ON skill.id=c.skill_id
      LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id
      LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
      LEFT JOIN workforce_sources source ON source.id=original.source_id
      LEFT JOIN workforce_extractions extraction ON extraction.id=v.extraction_id
      WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.resource_id=ANY($3::uuid[])
      ORDER BY c.resource_id,c.id`, [env, actor.workspaceId, ids])).rows;
    const profiles = (await db.query(`SELECT r.id,p.display_name,p.timezone,
      (clock_timestamp() AT TIME ZONE p.timezone)::date::text AS local_today FROM workforce_resources r
      JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR SHARE OF p`, [ids])).rows;
    await db.query("SELECT id FROM resource_calendars WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id FOR SHARE", [ids]);
    const calendars = (await db.query(`SELECT day.resource_id,day.service_date::text,day.revision_id,v.content_digest,v.timezone,
      v.timezone_data_version,v.observed_at,v.next_review_at FROM resource_calendar_days day
      JOIN resource_calendar_revisions v ON v.id=day.revision_id AND v.resource_id=day.resource_id
      WHERE day.resource_id=ANY($1::uuid[]) AND day.service_date BETWEEN $2 AND $3
      ORDER BY day.resource_id,day.service_date FOR SHARE OF day`, [ids, input.fromDate, input.toDate])).rows;
    await db.query("SELECT id FROM staffing_allocations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
      [[...new Set(commitments.map(row => row.allocation_id))].sort()]);
    const readLedgers = () => db.query(`SELECT resource_id,service_date::text,confirmed_minutes,generation FROM staffing_capacity_days
      WHERE resource_id=ANY($1::uuid[]) AND service_date BETWEEN $2 AND $3 ORDER BY resource_id,service_date FOR SHARE`, [ids, input.fromDate, input.toDate]);
    const ledgers = (await readLedgers()).rows;
    const intervals = (await db.query(`SELECT resource_id,revision_id,service_date::text,kind,start_at,end_at FROM resource_calendar_intervals
      WHERE resource_id=ANY($1::uuid[]) AND revision_id=ANY($2::uuid[]) AND service_date BETWEEN $3 AND $4
      ORDER BY resource_id,service_date,kind,ordinal`, [ids, [...new Set(calendars.map(row => row.revision_id))], input.fromDate, input.toDate])).rows;
    const usage = (await db.query(`SELECT day.resource_id,day.service_date::text,
      SUM(day.minutes) FILTER(WHERE day.billable) AS billable,
      SUM(day.minutes) FILTER(WHERE a.customer_id=$4) AS customer_minutes,
      SUM(day.minutes) FILTER(WHERE a.customer_id=$4 AND day.billable) AS customer_billable
      FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id
      WHERE day.resource_id=ANY($1::uuid[]) AND day.service_date BETWEEN $2 AND $3
        AND a.environment_id=$5 AND a.workspace_id=$6 GROUP BY day.resource_id,day.service_date`,
      [ids, input.fromDate, input.toDate, input.customerId, env, actor.workspaceId])).rows;
    const asOf = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString() as string;
    const declarations = (await db.query(`SELECT day.resource_id,day.service_date::text,latest.state
      FROM (SELECT DISTINCT resource_id,service_date FROM staffing_allocation_days WHERE resource_id=ANY($1::uuid[])
        AND service_date BETWEEN $2 AND $3) day
      LEFT JOIN LATERAL(SELECT state FROM workforce_partner_eligibility WHERE resource_id=day.resource_id
        AND customer_id=$4 AND environment_id=$5 AND workspace_id=$6 AND day.service_date BETWEEN from_date AND to_date
        ORDER BY revision_number DESC LIMIT 1) latest ON true ORDER BY day.resource_id,day.service_date`,
      [ids, input.fromDate, input.toDate, input.customerId, env, actor.workspaceId])).rows;
    const tentative = (await db.query(`SELECT v.resource_id,day->>'date' AS service_date,SUM((day->>'minutes')::integer) AS minutes,
      SUM((day->>'minutes')::integer) FILTER(WHERE a.customer_id=$6) AS customer_minutes
      FROM staffing_allocations a JOIN staffing_allocation_revisions v ON v.id=a.current_revision_id
      JOIN staffing_allocation_payloads p ON p.revision_id=v.id CROSS JOIN LATERAL jsonb_array_elements(p.content->'days') day
      WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.state='tentative' AND a.reservation_expires_at>$7
        AND v.resource_id=ANY($3::uuid[]) AND (day->>'date')::date BETWEEN $4 AND $5 GROUP BY v.resource_id,service_date`,
      [env, actor.workspaceId, ids, input.fromDate, input.toDate, input.customerId, asOf])).rows;
    // A concurrently inserted first ledger was absent from the earlier SHARE
    // selection. Refuse a mixed snapshot rather than report zero capacity usage.
    if (staffingSha256(ledgers) !== staffingSha256((await readLedgers()).rows)) throw new HttpFailure(409, "source_changed", "Capacity changed; reload");
    if (staffingSha256(commitments) !== staffingSha256((await selectOperationsCommitments(db, actor, input, ids)).rows)) {
      throw new HttpFailure(409, "source_changed", "Commitments changed; reload");
    }
    const dates = Array.from({ length: (Date.parse(input.toDate) - Date.parse(input.fromDate)) / 86_400_000 + 1 },
      (_, i) => new Date(Date.parse(input.fromDate) + i * 86_400_000).toISOString().slice(0, 10));
    const dayKey = (row: { resource_id: string; service_date: string }) => `${row.resource_id}/${row.service_date}`;
    const calendarByDay = new Map(calendars.map(row => [dayKey(row), row]));
    const ledgerByDay = new Map(ledgers.map(row => [dayKey(row), row]));
    const usageByDay = new Map(usage.map(row => [dayKey(row), row]));
    const tentativeByDay = new Map(tentative.map(row => [dayKey(row), row]));
    const intervalsByDay = new Map<string, typeof intervals>();
    for (const row of intervals) {
      const key = `${dayKey(row)}/${row.revision_id}`, group = intervalsByDay.get(key);
      if (group) group.push(row); else intervalsByDay.set(key, [row]);
    }
    return { contractVersion: "staffing-v1" as const, formulaVersion: STAFFING_CAPACITY_VERSION,
      customerId: input.customerId, fromDate: input.fromDate, toDate: input.toDate, asOf,
      actualUtilization: null, actualReason: "actual_unavailable" as const,
      nextCursor: selected.length > input.pageSize ? staffingPageCursor(ids.at(-1)!, scope) : null,
      items: heads.map(head => {
        const profile = profiles.find(row => row.id === head.id);
        if (!profile) throw new HttpFailure(409, "source_changed", "Resource changed; reload");
        const resourceAssessments = assessments.filter(row => row.resource_id === head.id);
        return { resourceId: head.id, displayName: profile.display_name as string, timezone: profile.timezone as string,
          resourceRevisionId: head.current_revision_id, resourceVersion: Number(head.aggregate_version), asOf,
          active: head.active, days: dates.map(date => {
            const key = `${head.id}/${date}`;
            const calendar = calendarByDay.get(key), ledger = ledgerByDay.get(key), assigned = usageByDay.get(key), reserved = tentativeByDay.get(key);
            const confirmed = Number(ledger?.confirmed_minutes ?? 0), billable = Number(assigned?.billable ?? 0);
            if (billable > confirmed) throw new HttpFailure(409, "source_changed", "Capacity changed; reload");
            const identity = { date, capacityGeneration: ledger ? Number(ledger.generation) : null,
              revisionId: calendar?.revision_id as string | null ?? null, contentDigest: calendar?.content_digest as string | null ?? null,
              timezoneDataVersion: calendar?.timezone_data_version as string | null ?? null,
              confirmedMinutes: confirmed, confirmedBillableMinutes: billable, tentativeMinutes: Number(reserved?.minutes ?? 0),
              customerConfirmedMinutes: Number(assigned?.customer_minutes ?? 0), customerConfirmedBillableMinutes: Number(assigned?.customer_billable ?? 0),
              customerTentativeMinutes: Number(reserved?.customer_minutes ?? 0) };
            if (!head.active || !calendar || calendar.timezone !== profile.timezone) return { ...identity, capacity: null,
              freshness: "unknown" as const, needsReview: true, reason: !head.active ? "resource_inactive" : !calendar ? "calendar_missing" : "resource_timezone_changed" };
            const rows = intervalsByDay.get(`${key}/${calendar.revision_id}`) ?? [];
            const set = (kind: string): StaffingInterval[] => rows.filter(row => row.kind === kind).map(row =>
              [new Date(row.start_at).getTime() / 60_000, new Date(row.end_at).getTime() / 60_000]);
            const capacity = calculateDailyCapacity({ contracted: set("contracted"), holidays: set("holiday"), leave: set("leave"), protected: set("protected"),
              confirmed, billable, tentative: identity.tentativeMinutes });
            const fresh = availabilityFreshness({ observedAt: new Date(calendar.observed_at).toISOString(), nextReviewAt: new Date(calendar.next_review_at).toISOString() }, asOf);
            // Historical load remains consumed even when its personnel inputs
            // are no longer suitable for a current commitment. Only this
            // customer's commitments trigger this customer-facing warning.
            const requirements = baseline.requirements.get(key);
            const competencyReview = identity.customerConfirmedMinutes > 0 && (!requirements?.length || requirements.some(requirement =>
              !resourceAssessments.some(row => row.skill_id === requirement.skillId && row.active && row.eligible &&
                Number(row.level) >= requirement.minimumLevel && competencyFreshness({ assessmentDate: row.assessment_date,
                  nextReviewDate: row.next_review_date }, profile.local_today, date).validThrough)));
            const partnerReview = identity.customerConfirmedMinutes > 0 && head.kind === "partner" &&
              staffingPartnerEligible(head, partnerAuthority, declarations.filter(row => row.resource_id === head.id && row.service_date === date), 1) !== true;
            const commitmentReview = baseline.review.has(key);
            return { ...identity, capacity, freshness: fresh.freshness,
              needsReview: capacity.needsReview || !fresh.validThrough || competencyReview || commitmentReview || partnerReview,
              reason: capacity.needsReview ? "overload" : !fresh.validThrough ? "availability_review_required" : commitmentReview ? "baseline_review_required"
                : partnerReview ? "partner_eligibility_review_required" : competencyReview ? "competency_review_required" : null };
          }) };
      }) };
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}
