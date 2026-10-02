import type { PoolClient } from "pg";
import { staffingIdSchema } from "../../contracts/staffing";
import { HttpFailure } from "../../contracts/http";
import { allocationLedgerUnion, planAllocationLedgerChange, StaffingLedgerConflict, type AllocationLedgerRow } from "../../staffing/allocation-ledger";
import { parseStaffing, staffingSha256 } from "./commands";
import { getServerConfig } from "../config";
import { requireStaffingCapability, type StaffingActor } from "./policy";

const held = Symbol("staffing-ledgers-held");
type ResourceIdentity = { resourceId: string; date: string };
type DemandIdentity = { demandId: string; date: string };
type LedgerSnapshot = { confirmedMinutes: number; generation: number };
export type LockedAllocationLedgers = { readonly [held]: PoolClient;
  resourceDays: (ResourceIdentity & LedgerSnapshot)[]; demandDays: (DemandIdentity & LedgerSnapshot)[];
  oldRows: AllocationLedgerRow[]; newRows: AllocationLedgerRow[] };
const changed = () => new HttpFailure(409, "source_changed", "Allocation ledger changed; reload");

/** Internal decision suffix only: caller has already locked live manager,
 * baseline/demand/source/competency/resource/calendar inputs in governed order.
 * Acquire the full stable date union before locking allocation/preview heads.
 * No source payload, other-customer identity or finance field is retrieved. */
export async function lockAllocationLedgers(db: PoolClient, actor: StaffingActor,
  oldRows: AllocationLedgerRow[], newRows: AllocationLedgerRow[]): Promise<LockedAllocationLedgers> {
  requireStaffingCapability(actor, "manager");
  const union = allocationLedgerUnion(oldRows, newRows), environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const resources = [...new Set(union.resourceDays.map(row => parseStaffing(staffingIdSchema, row.resourceId)))];
  const demands = [...new Set(union.demandDays.map(row => parseStaffing(staffingIdSchema, row.demandId)))];
  const scopedResources = await db.query(`SELECT id FROM workforce_resources WHERE id=ANY($1::uuid[])
    AND environment_id=$2 AND workspace_id=$3`, [resources, environmentId, actor.workspaceId]);
  const scopedDemands = await db.query(`SELECT id FROM staffing_demands WHERE id=ANY($1::uuid[])
    AND environment_id=$2 AND workspace_id=$3`, [demands, environmentId, actor.workspaceId]);
  if (scopedResources.rowCount !== resources.length || scopedDemands.rowCount !== demands.length) throw changed();
  const resourceDays: LockedAllocationLedgers["resourceDays"] = [], demandDays: LockedAllocationLedgers["demandDays"] = [];
  for (const identity of union.resourceDays) {
    // Explicit domain ledger materialization; no schema initialization occurs.
    // INSERT conflicts serialize first writers even when usage did not exist.
    await db.query(`INSERT INTO staffing_capacity_days(resource_id,service_date) VALUES($1,$2) ON CONFLICT DO NOTHING`, [identity.resourceId, identity.date]);
    const row = (await db.query(`SELECT confirmed_minutes,generation FROM staffing_capacity_days
      WHERE resource_id=$1 AND service_date=$2 FOR UPDATE`, [identity.resourceId, identity.date])).rows[0];
    if (!row) throw changed();
    resourceDays.push({ ...identity, confirmedMinutes: Number(row.confirmed_minutes), generation: Number(row.generation) });
  }
  for (const identity of union.demandDays) {
    // Approved demand revisions materialize stable demand/day identities; never
    // infer requested effort from a new allocation or reset existing usage.
    const row = (await db.query(`SELECT confirmed_minutes,generation FROM staffing_demand_days
      WHERE demand_id=$1 AND service_date=$2 FOR UPDATE`, [identity.demandId, identity.date])).rows[0];
    if (!row) throw changed();
    demandDays.push({ ...identity, confirmedMinutes: Number(row.confirmed_minutes), generation: Number(row.generation) });
  }
  return { [held]: db, resourceDays, demandDays, oldRows: structuredClone(oldRows), newRows: structuredClone(newRows) };
}

export async function readConfirmedAllocationLedger(db: PoolClient, actor: StaffingActor, allocationId: string) {
  parseStaffing(staffingIdSchema, allocationId);
  const rows = (await db.query(`SELECT day.resource_id,day.demand_id,day.service_date::text,day.minutes,day.billable,revision.resource_timezone
    FROM staffing_allocations allocation JOIN staffing_allocation_days day ON day.allocation_id=allocation.id
    JOIN staffing_allocation_revisions revision ON revision.id=day.revision_id AND revision.allocation_id=allocation.id
    WHERE allocation.id=$1 AND allocation.environment_id=$2 AND allocation.workspace_id=$3 ORDER BY day.service_date`,
    [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows;
  return rows.map(row => ({ resourceId: row.resource_id as string, resourceTimezone: row.resource_timezone as string,
    demandId: row.demand_id as string, date: row.service_date as string, minutes: Number(row.minutes), billable: row.billable as boolean }));
}

/** Persist only after the caller validates exact head and actor/session-bound
 * preview under its allocation/preview locks. Every write shares that caller's
 * transaction with the immutable decision and receipt. No independent commit. */
export async function applyAllocationLedgerChange(db: PoolClient, actor: StaffingActor, locks: LockedAllocationLedgers,
  input: { allocationId: string; revisionId: string; action: "confirm" | "amend" | "release" | "cancel";
    schedulableMinutes: ReadonlyMap<string, number | null>; requiredMinutes: ReadonlyMap<string, number | null> }) {
  requireStaffingCapability(actor, "manager");
  if (locks[held] !== db) throw new Error("Allocation ledger transaction differs");
  parseStaffing(staffingIdSchema, input.allocationId); parseStaffing(staffingIdSchema, input.revisionId);
  const actualOld = await readConfirmedAllocationLedger(db, actor, input.allocationId);
  if (staffingSha256(actualOld) !== staffingSha256([...locks.oldRows].sort((a, b) => a.date.localeCompare(b.date)))) throw changed();
  if (locks.newRows.length) {
    const revision = (await db.query(`SELECT resource_id,demand_id,resource_timezone FROM staffing_allocation_revisions
      WHERE id=$1 AND allocation_id=$2 AND environment_id=$3 AND workspace_id=$4`,
      [input.revisionId, input.allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!revision || locks.newRows.some(row => row.resourceId !== revision.resource_id || row.demandId !== revision.demand_id || row.resourceTimezone !== revision.resource_timezone)) throw changed();
  }
  const zoneRows = (await db.query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS as_of)
    SELECT zone,(clock.as_of AT TIME ZONE zone)::date::text AS local_date
    FROM unnest($1::text[]) AS zones(zone) CROSS JOIN clock`,
    [[...new Set([...locks.oldRows, ...locks.newRows].map(row => row.resourceTimezone))]])).rows;
  let result;
  try {
    result = planAllocationLedgerChange({ action: input.action, oldRows: locks.oldRows, newRows: locks.newRows,
      currentDatesByTimezone: new Map(zoneRows.map(row => [row.zone as string, row.local_date as string])),
      resourceDays: locks.resourceDays.map(row => ({ ...row, schedulableMinutes: input.schedulableMinutes.get(`${row.resourceId}/${row.date}`) ?? null })),
      demandDays: locks.demandDays.map(row => ({ ...row, requiredMinutes: input.requiredMinutes.get(`${row.demandId}/${row.date}`) ?? null })) });
  } catch (error) {
    if (error instanceof StaffingLedgerConflict) throw new HttpFailure(409, error.code, "Allocation daily limits or history changed; reload");
    throw error;
  }
  for (const row of result.removedFutureRows) {
    const removed = await db.query(`DELETE FROM staffing_allocation_days WHERE allocation_id=$1 AND service_date=$2`, [input.allocationId, row.date]);
    if (removed.rowCount !== 1) throw changed();
  }
  for (const row of result.insertedFutureRows) await db.query(`INSERT INTO staffing_allocation_days(allocation_id,revision_id,
    resource_id,demand_id,service_date,minutes,billable) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [input.allocationId, input.revisionId, row.resourceId, row.demandId, row.date, row.minutes, row.billable]);
  for (const row of result.resourceChanges.filter(row => row.changed)) {
    const updated = await db.query(`UPDATE staffing_capacity_days SET confirmed_minutes=$3,generation=generation+1
      WHERE resource_id=$1 AND service_date=$2 AND generation=$4`, [row.resourceId, row.date, row.confirmedMinutes, row.generation]);
    if (updated.rowCount !== 1) throw changed();
  }
  for (const row of result.demandChanges.filter(row => row.changed)) {
    const updated = await db.query(`UPDATE staffing_demand_days SET confirmed_minutes=$3,generation=generation+1
      WHERE demand_id=$1 AND service_date=$2 AND generation=$4`, [row.demandId, row.date, row.confirmedMinutes, row.generation]);
    if (updated.rowCount !== 1) throw changed();
  }
  return result;
}
