import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { calculateDailyCapacity, type StaffingInterval } from "../../staffing/calendar";
import { availabilityFreshness } from "../../staffing/freshness";
import { lockResourceHeads } from "../staffing/resources";
import type { ExecutionActor } from "./policy";
import { executionBaseline } from "./baselines";
import { lockExecutionOriginalSources, verifyExecutionSources } from "./sources";
import type { ExecutionSource } from "./schema";
import type { TimeInput } from "./time-schema";
import { executionTimezoneVersion } from "./time-schema";

export type TimeEvidence = { eligible: boolean; baselineId: string; activeBaselineId: string; activityRevisionId: string;
  acceptedRevisionId: string | null; sourceDigest: string | null };
export type TimeCalendar = { revisionId: string | null; timezone: string | null; timezoneVersion: string;
  capacity: number | null; availableMinutes: number | null; resourceVersion: number; resourceActive: boolean };
export type TimeDependency = Pick<TimeInput, "baselineId" | "resourceId" | "workPackageKey" | "serviceDate" | "activityRevisionId" | "allocationRevisionId" | "billable" | "timezone">;
/** Lock original plan/source union before engagement/workforce/execution suffixes.
 * Metadata remains available for a reviewed numerical source exception. */
export async function lockTimeDependencies(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  rows: TimeDependency[], extraResourceIds: string[] = []) {
  const baselines = [];
  for (const id of [...new Set(rows.map(r => r.baselineId))].sort()) baselines.push(await executionBaseline(db, actor, customerId, engagementId, id));
  await db.query("SELECT id FROM delivery_plans WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[...new Set(baselines.map(b => b.plan_id))].sort()]);
  const evidence = new Map<string, TimeEvidence>();
  const refs: ExecutionSource[] = [];
  const perActivity=new Map<string,ExecutionSource[]>();
  for (const row of rows) {
    const baseline = baselines.find(b => b.id === row.baselineId)!;
    const activity = (await db.query(`SELECT v.record_id,v.content_digest,v.revision_number,r.accepted_revision_id,v.baseline_id,v.kind
      FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id
      WHERE v.id=$1 AND v.engagement_id=$2 AND v.environment_id=$3 AND v.workspace_id=$4 AND v.customer_id=$5`,
    [row.activityRevisionId, engagementId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId])).rows[0];
    if (!activity || activity.kind !== "activity" || activity.baseline_id !== row.baselineId) throw hiddenRecord();
    if (!(await db.query(`SELECT 1 FROM execution_baseline_items WHERE baseline_id=$1 AND item_kind='work_package' AND item_key=$2`,
      [row.baselineId, row.workPackageKey])).rowCount) throw new HttpFailure(422, "invalid_input", "Use an exact bound work package");
    const identity = { baselineId: baseline.id, activeBaselineId: baseline.active_baseline_id,
      activityRevisionId: row.activityRevisionId, acceptedRevisionId: activity.accepted_revision_id as string | null };
    evidence.set(row.activityRevisionId, { ...identity, eligible: activity.accepted_revision_id === row.activityRevisionId && baseline.active_baseline_id === baseline.id, sourceDigest: null });
    const pair:ExecutionSource[]=[{ kind: "milestone_baseline", id: baseline.id, sourceRevisionId: baseline.id, generation: Number(baseline.baseline_number), contentDigest: baseline.content_digest },
      { kind: "execution_record", id: activity.record_id, sourceRevisionId: row.activityRevisionId, generation: Number(activity.revision_number), contentDigest: activity.content_digest }];
    refs.push(...pair);perActivity.set(row.activityRevisionId,pair);
  }
  const union = [...new Map(refs.map(r => [`${r.kind}/${r.sourceRevisionId}`, r])).values()];
  await lockExecutionOriginalSources(db,actor,customerId,engagementId,union);
  await db.query("SELECT id FROM engagements WHERE id=$1 FOR UPDATE", [engagementId]);
  // Execution writers also hold the engagement. Recheck each exact pointer under
  // that lock; one unavailable source must not taint independent valid rows.
  for(const [id,pair] of perActivity) {
    const value=evidence.get(id)!;
    value.acceptedRevisionId=(await db.query(`SELECT r.accepted_revision_id FROM execution_records r
      JOIN execution_record_revisions v ON v.record_id=r.id WHERE v.id=$1`,[id])).rows[0]?.accepted_revision_id??null;
    value.activeBaselineId=(await db.query("SELECT active_baseline_id FROM engagements WHERE id=$1",[engagementId])).rows[0].active_baseline_id;
    try {
      value.sourceDigest=await verifyExecutionSources(db,actor,customerId,engagementId,actor.kind==="partner"?"delivery":"internal",pair,false);
      value.eligible=value.acceptedRevisionId===id&&value.activeBaselineId===value.baselineId;
    } catch(error) {
      if(!(error instanceof HttpFailure)||![403,404,409].includes(error.status))throw error;
      value.eligible=false;
    }
  }
  const allocations = (await db.query(`SELECT a.id,a.state,a.confirmed_revision_id,v.id AS revision_id,v.resource_id,v.demand_id,
    d.current_revision_id AS current_demand_revision,v.demand_revision_id,d.state AS demand_state,r.baseline_id,r.engagement_id,r.work_package_key
    FROM staffing_allocation_revisions v JOIN staffing_allocations a ON a.id=v.allocation_id
    JOIN staffing_demand_revisions r ON r.id=v.demand_revision_id JOIN staffing_demands d ON d.id=v.demand_id
    WHERE v.id=ANY($1::uuid[]) AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4`,
  [[...new Set(rows.flatMap(r => r.allocationRevisionId ? [r.allocationRevisionId] : []))], process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId])).rows;
  if (rows.some(r => r.allocationRevisionId && !allocations.some(a => a.revision_id === r.allocationRevisionId))) throw hiddenRecord();
  await db.query("SELECT id FROM staffing_demands WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [[...new Set(allocations.map(a => a.demand_id))].sort()]);
  const resources = await lockResourceHeads(db, actor, [...rows.map(r => r.resourceId), ...extraResourceIds], "UPDATE");
  const calendars = new Map<string, TimeCalendar>();
  for (const row of [...new Map(rows.map(r => [`${r.resourceId}/${r.serviceDate}`, r])).values()].sort((a,b) => `${a.resourceId}/${a.serviceDate}`.localeCompare(`${b.resourceId}/${b.serviceDate}`))) {
    const resource = resources.find(r => r.id === row.resourceId)!;
    await db.query("SELECT id FROM resource_calendars WHERE resource_id=$1 FOR SHARE", [row.resourceId]);
    const day = (await db.query(`SELECT d.revision_id,r.timezone,r.timezone_data_version,r.observed_at,r.next_review_at
      FROM resource_calendar_days d JOIN resource_calendar_revisions r ON r.id=d.revision_id
      WHERE d.resource_id=$1 AND d.service_date=$2 FOR SHARE OF d`, [row.resourceId, row.serviceDate])).rows[0];
    const profile = (await db.query("SELECT timezone FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE", [resource.current_revision_id])).rows[0];
    const payload = day ? (await db.query("SELECT revision_id FROM resource_calendar_payloads WHERE revision_id=$1 FOR SHARE", [day.revision_id])).rowCount : 0;
    const eligible = Boolean(resource.active && profile && day && payload && profile.timezone === day.timezone &&
      availabilityFreshness({ observedAt: new Date(day.observed_at).toISOString(), nextReviewAt: new Date(day.next_review_at).toISOString() }, new Date().toISOString()).validThrough);
    let capacity: number | null = null, availableMinutes: number | null = null;
    if (eligible) {
      const intervals = (await db.query("SELECT kind,start_at,end_at FROM resource_calendar_intervals WHERE revision_id=$1 AND service_date=$2 ORDER BY kind,ordinal", [day.revision_id, row.serviceDate])).rows;
      const set = (kind: string): StaffingInterval[] => intervals.filter(r => r.kind === kind).map(r => [new Date(r.start_at).getTime()/60000, new Date(r.end_at).getTime()/60000]);
      const result = calculateDailyCapacity({ contracted: set("contracted"), holidays: set("holiday"), leave: set("leave"), protected: set("protected"), confirmed: 0, billable: 0, tentative: 0 });
      availableMinutes = result.availableMinutes; capacity = result.availableMinutes - result.protectedMinutes;
    }
    calendars.set(`${row.resourceId}/${row.serviceDate}`, { revisionId: day?.revision_id ?? null,
      timezone: eligible ? day.timezone : null, timezoneVersion: eligible ? day.timezone_data_version : executionTimezoneVersion(),
      capacity, availableMinutes, resourceVersion: Number(resource.aggregate_version), resourceActive: resource.active });
  }
  await db.query("SELECT id FROM staffing_allocations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [allocations.map(a => a.id).sort()]);
  // Recheck mutable allocation/demand pointers after acquiring their lock union.
  const planned = new Map<string, boolean>();
  for (const row of rows) {
    const valid = row.allocationRevisionId ? await db.query(`SELECT 1 FROM staffing_allocation_days day
      JOIN staffing_allocations a ON a.id=day.allocation_id JOIN staffing_allocation_revisions v ON v.id=day.revision_id
      JOIN staffing_demands d ON d.id=v.demand_id JOIN staffing_demand_revisions r ON r.id=v.demand_revision_id
      WHERE day.revision_id=$1 AND day.resource_id=$2 AND day.service_date=$3 AND day.billable=$4
        AND a.confirmed_revision_id=v.id AND a.state='confirmed' AND d.current_revision_id=r.id AND d.state='qualified'
        AND r.baseline_id=$5 AND r.engagement_id=$6 AND r.work_package_key=$7 AND a.customer_id=$8`,
    [row.allocationRevisionId, row.resourceId, row.serviceDate, row.billable, row.baselineId, engagementId, row.workPackageKey, customerId]) : null;
    planned.set(`${row.activityRevisionId}/${row.resourceId}/${row.serviceDate}/${row.allocationRevisionId}/${row.billable}`, !!valid?.rowCount);
  }
  return { evidence, calendars, resources, planned };
}
