import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import type { ExecutionActor } from "./policy";

export type ActualContribution = { entryId: string; revisionId: string; resourceId: string; serviceDate: string;
  timezone: string; timezoneVersion: string; minutes: number; baselineId: string; workPackageKey: string; billable: boolean };
export type ActualDay = { resourceId: string; serviceDate: string; timezone: string; timezoneVersion: string; minutes: number };
const key = (r: { resourceId: string; serviceDate: string }) => `${r.resourceId}/${r.serviceDate}`;
const held = Symbol("actual-day-locks");
export type ActualLocks = { readonly [held]: PoolClient; days: ActualDay[]; oldRows: ActualContribution[]; newRows: ActualContribution[] };
export async function currentActuals(db: PoolClient, entryIds: string[]): Promise<ActualContribution[]> {
  const rows = (await db.query(`SELECT d.entry_id,d.revision_id,d.resource_id,d.service_date::text,d.minutes,d.baseline_id,
    d.work_package_key,d.billable,r.timezone,r.timezone_version FROM execution_actual_days d
    JOIN execution_time_revisions r ON r.id=d.revision_id WHERE d.entry_id=ANY($1::uuid[]) AND d.minutes>0 ORDER BY d.entry_id`, [entryIds])).rows;
  return rows.map(r => ({ entryId: r.entry_id, revisionId: r.revision_id, resourceId: r.resource_id, serviceDate: r.service_date,
    timezone: r.timezone, timezoneVersion: r.timezone_version, minutes: r.minutes, baselineId: r.baseline_id,
    workPackageKey: r.work_package_key, billable: r.billable }));
}
/** First writers insert the same stable key. Corrections acquire the entire
 * old/new union in deterministic order before computing any debit or credit. */
export async function lockActualDays(db: PoolClient, actor: ExecutionActor, oldRows: ActualContribution[], newRows: ActualContribution[], materialize = false): Promise<ActualLocks> {
  const union = new Map([...oldRows, ...newRows].map(row => [key(row), row]));
  const days: ActualDay[] = [];
  for (const [, row] of [...union].sort(([a], [b]) => a.localeCompare(b))) {
    if (materialize) await db.query(`INSERT INTO execution_resource_days(environment_id,workspace_id,resource_id,service_date,timezone,timezone_version)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId,
      row.resourceId, row.serviceDate, row.timezone, row.timezoneVersion]);
    const day = (await db.query(`SELECT timezone,timezone_version,approved_minutes FROM execution_resource_days
      WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=$3 AND service_date=$4 FOR UPDATE`,
    [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, row.resourceId, row.serviceDate])).rows[0];
    days.push({ resourceId: row.resourceId, serviceDate: row.serviceDate, timezone: day?.timezone ?? row.timezone,
      timezoneVersion: day?.timezone_version ?? row.timezoneVersion, minutes: day?.approved_minutes ?? 0 });
  }
  return { [held]: db, days, oldRows, newRows };
}
export function actualDayTotals(locks: ActualLocks) {
  return locks.days.map(day => ({ ...day, next: day.minutes
    - locks.oldRows.filter(r => key(r) === key(day)).reduce((n, r) => n + r.minutes, 0)
    + locks.newRows.filter(r => key(r) === key(day)).reduce((n, r) => n + r.minutes, 0) }));
}
/** This is only a suffix of a governed review transaction; it never commits. */
export async function applyActualDays(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  locks: ActualLocks, decisions: Map<string, string>) {
  if (locks[held] !== db) throw new Error("Actual ledger transaction changed");
  const totals = actualDayTotals(locks);
  if (totals.some(d => d.next < 0 || d.next > 1440)) throw new HttpFailure(422, "approval_blocked", "Approved daily effort must remain within 1440 minutes");
  for (const row of locks.newRows) {
    const day = locks.days.find(d => key(d) === key(row))!;
    if (day.timezone !== row.timezone || day.timezoneVersion !== row.timezoneVersion) throw new HttpFailure(409, "source_changed", "Revise the entry to the established day timezone");
  }
  for (const day of totals) await db.query(`UPDATE execution_resource_days SET approved_minutes=$5
    WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=$3 AND service_date=$4`,
  [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, day.resourceId, day.serviceDate, day.next]);
  for (const old of locks.oldRows.filter(old => !locks.newRows.some(row => row.entryId === old.entryId))) {
    await db.query("UPDATE execution_actual_days SET minutes=0,decision_id=$2,approved_at=clock_timestamp() WHERE entry_id=$1", [old.entryId, decisions.get(old.entryId)]);
  }
  for (const row of locks.newRows) await db.query(`INSERT INTO execution_actual_days
    (id,environment_id,workspace_id,customer_id,engagement_id,entry_id,revision_id,decision_id,resource_id,baseline_id,work_package_key,service_date,minutes,billable)
    VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(entry_id) DO UPDATE SET revision_id=excluded.revision_id,decision_id=excluded.decision_id,
      resource_id=excluded.resource_id,baseline_id=excluded.baseline_id,work_package_key=excluded.work_package_key,
      service_date=excluded.service_date,minutes=excluded.minutes,billable=excluded.billable,approved_at=clock_timestamp()`,
  [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, engagementId, row.entryId, row.revisionId,
    decisions.get(row.entryId), row.resourceId, row.baselineId, row.workPackageKey, row.serviceDate, row.minutes, row.billable]);
}
