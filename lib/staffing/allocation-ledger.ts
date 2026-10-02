/** Deterministic precommit arithmetic. The domain must lock the full sorted
 * resource/date and stable demand/date union, then pass current snapshots.
 * This function grants no authority and performs no persistence. */
export type AllocationLedgerRow = { resourceId: string; resourceTimezone: string; demandId: string; date: string; minutes: number; billable: boolean };
type ResourceDay = { resourceId: string; date: string; confirmedMinutes: number; schedulableMinutes: number | null; generation: number };
type DemandDay = { demandId: string; date: string; confirmedMinutes: number; requiredMinutes: number | null; generation: number };
export class StaffingLedgerConflict extends Error {
  constructor(readonly code: "capacity_conflict" | "demand_conflict" | "past_immutable" | "source_changed") {
    super(code); this.name = "StaffingLedgerConflict";
  }
}
const resourceKey = (row: Pick<AllocationLedgerRow, "resourceId" | "date">) => `${row.resourceId}/${row.date}`;
const demandKey = (row: Pick<AllocationLedgerRow, "demandId" | "date">) => `${row.demandId}/${row.date}`;
function validateRows(rows: AllocationLedgerRow[], historical = false) {
  if (!historical && rows.length > 91 || new Set(rows.map(row => row.date)).size !== rows.length || rows.some(row =>
    !row.resourceId || !row.resourceTimezone || !row.demandId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isSafeInteger(row.minutes) || row.minutes < 1 || row.minutes > 960 || typeof row.billable !== "boolean")) throw new Error("Invalid allocation ledger rows");
  if (!historical && new Set(rows.map(row => row.resourceId)).size > 1 || new Set(rows.map(row => row.demandId)).size > 1) throw new Error("Allocation ledger identity differs");
}
export function allocationLedgerUnion(oldRows: AllocationLedgerRow[], newRows: AllocationLedgerRow[]) {
  // Past rows can retain earlier resources/revisions after future transfers.
  // A new proposal revision still selects exactly one resource.
  validateRows(oldRows, true); validateRows(newRows);
  if (oldRows.length && newRows.length && oldRows[0].demandId !== newRows[0].demandId) throw new Error("Stable demand identity differs");
  const rows = [...oldRows, ...newRows];
  return { resourceDays: [...new Map(rows.map(row => [resourceKey(row), { resourceId: row.resourceId, date: row.date }])).values()]
    .sort((a, b) => a.resourceId.localeCompare(b.resourceId) || a.date.localeCompare(b.date)),
  demandDays: [...new Map(rows.map(row => [demandKey(row), { demandId: row.demandId, date: row.date }])).values()]
    .sort((a, b) => a.demandId.localeCompare(b.demandId) || a.date.localeCompare(b.date)) };
}
export function planAllocationLedgerChange(input: { action: "confirm" | "amend" | "release" | "cancel";
  oldRows: AllocationLedgerRow[]; newRows: AllocationLedgerRow[];
  currentDatesByTimezone: ReadonlyMap<string, string>; resourceDays: ResourceDay[]; demandDays: DemandDay[] }) {
  const { action, oldRows, newRows } = input, removing = action === "release" || action === "cancel";
  if (action === "confirm" && oldRows.length || removing && newRows.length || !removing && !newRows.length) throw new Error("Invalid allocation transition rows");
  const union = allocationLedgerUnion(oldRows, newRows);
  const isPast = (row: AllocationLedgerRow) => {
    // Historical commitments keep their revision's timezone even after a
    // resource profile changes timezone; midnight protection must not move.
    const today = input.currentDatesByTimezone.get(row.resourceTimezone);
    if (!today) throw new StaffingLedgerConflict("source_changed");
    return row.date < today;
  };
  const past = oldRows.filter(isPast), future = oldRows.filter(row => !isPast(row));
  // Existing past row/revision identities are retained byte-for-byte by the
  // caller. A release removes today-or-later rows without erasing history.
  for (const row of newRows) {
    const old = past.find(old => old.date === row.date);
    if ((old || isPast(row)) && (!old || old.resourceId !== row.resourceId || old.resourceTimezone !== row.resourceTimezone || old.demandId !== row.demandId || old.minutes !== row.minutes || old.billable !== row.billable)) {
      throw new StaffingLedgerConflict("past_immutable");
    }
  }
  const inserted = newRows.filter(row => !isPast(row));
  const resourceChanges = union.resourceDays.map(identity => {
    const snapshot = input.resourceDays.find(day => resourceKey(day) === resourceKey(identity));
    if (!snapshot || !Number.isSafeInteger(snapshot.confirmedMinutes) || snapshot.confirmedMinutes < 0 || !Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1 ||
      snapshot.schedulableMinutes !== null && (!Number.isSafeInteger(snapshot.schedulableMinutes) || snapshot.schedulableMinutes < 0 || snapshot.schedulableMinutes > 960)) throw new StaffingLedgerConflict("source_changed");
    const removedMinutes = future.filter(row => resourceKey(row) === resourceKey(identity)).reduce((sum, row) => sum + row.minutes, 0);
    const addedMinutes = inserted.filter(row => resourceKey(row) === resourceKey(identity)).reduce((sum, row) => sum + row.minutes, 0);
    const confirmedMinutes = snapshot.confirmedMinutes - removedMinutes + addedMinutes;
    if (!Number.isSafeInteger(confirmedMinutes) || snapshot.confirmedMinutes < removedMinutes) throw new StaffingLedgerConflict("capacity_conflict");
    if (addedMinutes && (snapshot.schedulableMinutes === null || confirmedMinutes > snapshot.schedulableMinutes)) throw new StaffingLedgerConflict("capacity_conflict");
    // A replaced confirmed revision/billable classification changes lineage
    // even when its minute total is unchanged. Advance generation on every
    // touched future date so previews/scenarios cannot retain obsolete inputs.
    return { ...identity, generation: snapshot.generation, confirmedMinutes, changed: removedMinutes > 0 || addedMinutes > 0 };
  });
  const demandChanges = union.demandDays.map(identity => {
    const snapshot = input.demandDays.find(day => demandKey(day) === demandKey(identity));
    if (!snapshot || !Number.isSafeInteger(snapshot.confirmedMinutes) || snapshot.confirmedMinutes < 0 || !Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1 ||
      snapshot.requiredMinutes !== null && (!Number.isSafeInteger(snapshot.requiredMinutes) || snapshot.requiredMinutes < 0 || snapshot.requiredMinutes > 960)) throw new StaffingLedgerConflict("source_changed");
    const removedMinutes = future.filter(row => demandKey(row) === demandKey(identity)).reduce((sum, row) => sum + row.minutes, 0);
    const addedMinutes = inserted.filter(row => demandKey(row) === demandKey(identity)).reduce((sum, row) => sum + row.minutes, 0);
    const confirmedMinutes = snapshot.confirmedMinutes - removedMinutes + addedMinutes;
    if (!Number.isSafeInteger(confirmedMinutes) || snapshot.confirmedMinutes < removedMinutes) throw new StaffingLedgerConflict("demand_conflict");
    if (addedMinutes && (snapshot.requiredMinutes === null || confirmedMinutes > snapshot.requiredMinutes)) throw new StaffingLedgerConflict("demand_conflict");
    return { ...identity, generation: snapshot.generation, confirmedMinutes, changed: removedMinutes > 0 || addedMinutes > 0 };
  });
  return { retainedPastRows: past, removedFutureRows: future, insertedFutureRows: inserted, resourceChanges, demandChanges };
}
