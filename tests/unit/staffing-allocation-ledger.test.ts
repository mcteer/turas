import { describe, expect, it } from "vitest";
import { allocationLedgerUnion, planAllocationLedgerChange, type AllocationLedgerRow } from "../../lib/staffing/allocation-ledger";
const row = (resourceId = "a", date = "2026-10-01", minutes = 120): AllocationLedgerRow => ({ resourceId, resourceTimezone: "UTC", demandId: "d", date, minutes, billable: true });
function input(oldRows: AllocationLedgerRow[], newRows: AllocationLedgerRow[], action: "confirm" | "amend" | "release" | "cancel" = oldRows.length ? "amend" : "confirm") {
  const union = allocationLedgerUnion(oldRows, newRows);
  return { action, oldRows, newRows, currentDatesByTimezone: new Map([["UTC", "2026-09-30"]]),
    resourceDays: union.resourceDays.map(day => ({ ...day, generation: 2, schedulableMinutes: 480,
      confirmedMinutes: 60 + oldRows.filter(row => row.resourceId === day.resourceId && row.date === day.date).reduce((sum, row) => sum + row.minutes, 0) })),
    demandDays: union.demandDays.map(day => ({ ...day, generation: 4, requiredMinutes: 360,
      confirmedMinutes: 60 + oldRows.filter(row => row.date === day.date).reduce((sum, row) => sum + row.minutes, 0) })) };
}
describe("stable allocation ledger precommit arithmetic", () => {
  it("uses a sorted union of old/new resources and dates, including dates removed by an amendment", () => {
    expect(allocationLedgerUnion([row("b", "2026-10-02")], [row("a")])).toEqual({ resourceDays: [
      { resourceId: "a", date: "2026-10-01" }, { resourceId: "b", date: "2026-10-02" }],
      demandDays: [{ demandId: "d", date: "2026-10-01" }, { demandId: "d", date: "2026-10-02" }] });
  });
  it("transfers future time once without losing another assignment or changing stable demand consumption", () => {
    const result = planAllocationLedgerChange(input([row("a")], [row("b")]));
    expect(result.resourceChanges.map(day => [day.resourceId, day.confirmedMinutes])).toEqual([["a", 60], ["b", 180]]);
    expect(result.demandChanges).toEqual([expect.objectContaining({ confirmedMinutes: 180, changed: true, generation: 4 })]);
  });
  it("counts commitments from earlier revisions of the same demand when validating a new confirmation", () => {
    const request = input([], [row("b", "2026-10-01", 240)]);
    request.demandDays[0].confirmedMinutes = 180;
    expect(() => planAllocationLedgerChange(request)).toThrow(expect.objectContaining({ code: "demand_conflict" }));
  });
  it("rejects overcapacity and missing capacity without an overload override", () => {
    const request = input([], [row("b", "2026-10-01", 300)]);
    request.resourceDays[0].confirmedMinutes = 240;
    expect(() => planAllocationLedgerChange(request)).toThrow(expect.objectContaining({ code: "capacity_conflict" }));
    request.resourceDays[0].schedulableMinutes = null as unknown as number;
    expect(() => planAllocationLedgerChange(request)).toThrow(expect.objectContaining({ code: "capacity_conflict" }));
  });
  it("permits identity-only release after feasibility is lost while preserving past rows", () => {
    const old = [row("a", "2026-09-29"), row("a", "2026-10-01")], request = input(old, [], "release");
    request.resourceDays.forEach(day => { day.schedulableMinutes = null as unknown as number; });
    request.demandDays.forEach(day => { day.requiredMinutes = null as unknown as number; });
    const result = planAllocationLedgerChange(request);
    expect(result.retainedPastRows).toEqual([old[0]]); expect(result.removedFutureRows).toEqual([old[1]]);
    expect(result.resourceChanges.map(day => [day.date, day.confirmedMinutes, day.changed])).toEqual([["2026-09-29", 180, false], ["2026-10-01", 60, true]]);
  });
  it("cannot retroactively add, remove, transfer, rebill or resize a past commitment", () => {
    const old = row("a", "2026-09-29");
    for (const replacement of [[{ ...old, minutes: 121 }], [{ ...old, billable: false }], [{ ...old, resourceId: "b" }]]) {
      expect(() => planAllocationLedgerChange(input([old], replacement))).toThrow(expect.objectContaining({ code: "past_immutable" }));
    }
    expect(() => planAllocationLedgerChange(input([], [old]))).toThrow(expect.objectContaining({ code: "past_immutable" }));
  });
  it("retains unchanged past rows and applies only the amended future minutes", () => {
    const old = [row("a", "2026-09-29"), row("a")], result = planAllocationLedgerChange(input(old, [old[0], { ...old[1], minutes: 60 }]));
    expect(result.retainedPastRows).toEqual([old[0]]); expect(result.insertedFutureRows).toEqual([{ ...old[1], minutes: 60 }]);
    expect(result.demandChanges.map(day => day.confirmedMinutes)).toEqual([180, 120]);
  });
  it("retains historical resources automatically when a new revision transfers only future dates", () => {
    const past = row("a", "2026-09-29"), old = [past, row("b")];
    const result = planAllocationLedgerChange(input(old, [row("a", "2026-10-01", 60)]));
    expect(result.retainedPastRows).toEqual([past]);
    expect(result.resourceChanges.map(day => [day.resourceId, day.date, day.confirmedMinutes, day.changed])).toEqual([
      ["a", "2026-09-29", 180, false], ["a", "2026-10-01", 120, true], ["b", "2026-10-01", 60, true] ]);
  });
  it("does not apply a new revision's 91-date limit to retained history from earlier revisions", () => {
    const history = Array.from({ length: 100 }, (_, day) => row("a", new Date(Date.parse("2026-06-01") + day * 86_400_000).toISOString().slice(0, 10)));
    const result = planAllocationLedgerChange(input(history, [row("b")]));
    expect(result.retainedPastRows).toEqual(history);
    expect(result.removedFutureRows).toEqual([]);
    expect(result.insertedFutureRows).toEqual([row("b")]);
  });
  it("protects historical midnight using the stored revision timezone after profile changes", () => {
    const old = { ...row("a", "2026-09-30"), resourceTimezone: "Asia/Tokyo" };
    const request = input([old], [{ ...old, resourceTimezone: "America/Los_Angeles" }]);
    request.currentDatesByTimezone = new Map([["Asia/Tokyo", "2026-10-01"], ["America/Los_Angeles", "2026-09-30"]]);
    expect(() => planAllocationLedgerChange(request)).toThrow(expect.objectContaining({ code: "past_immutable" }));
    const release = { ...request, action: "release" as const, newRows: [] };
    expect(planAllocationLedgerChange(release).retainedPastRows).toEqual([old]);
  });
  it("refuses missing generation rows and inconsistent old ledger totals", () => {
    const request = input([row()], [], "cancel"); request.resourceDays = [];
    expect(() => planAllocationLedgerChange(request)).toThrow(expect.objectContaining({ code: "source_changed" }));
    const inconsistent = input([row()], [], "cancel"); inconsistent.demandDays[0].confirmedMinutes = 60;
    expect(() => planAllocationLedgerChange(inconsistent)).toThrow(expect.objectContaining({ code: "demand_conflict" }));
  });
});
