import { describe, expect, it } from "vitest";
import { resolveStaffingCalendar, resolveStaffingOverlap, resolveStaffingReservationDeadline } from "../../lib/server/staffing/temporal";
import type { StaffingCalendarInput } from "../../lib/contracts/staffing-calendar";
function window(date: string, from: string, to: string, fromOffset: string | null = null, toOffset: string | null = null) {
  return { date, from: `${date}T${from}`, to: to.includes("T") ? to : `${date}T${to}`, fromOffset, toOffset };
}
function calendar(date: string, contracted: ReturnType<typeof window>[], timezone = "America/New_York"): StaffingCalendarInput {
  return { timezone, observedAt: "2026-09-29T00:00:00Z", nextReviewAt: "2026-12-31T00:00:00Z", fromDate: date, toDate: date,
    days: [{ date, contracted, holidays: [], leave: [], protected: [] }] };
}
describe("pinned Temporal staffing calendar resolution", () => {
  it("bounds a reservation by immutable creation plus seven days and the first resource-local midnight", () => {
    expect(resolveStaffingReservationDeadline("2026-10-01", "America/New_York", "2026-09-30T00:00:00Z", "2026-09-30T12:00:00Z"))
      .toBe("2026-10-01T04:00:00.000Z");
    expect(resolveStaffingReservationDeadline("2026-10-20", "America/New_York", "2026-09-30T00:00:00Z", "2026-09-30T12:00:00Z"))
      .toBe("2026-10-07T00:00:00.000Z");
    expect(() => resolveStaffingReservationDeadline("2026-10-01", "America/New_York", "2026-09-30T00:00:00Z", "2026-10-01T04:00:00Z"))
      .toThrow(expect.objectContaining({ code: "reservation_expired" }));
  });
  it("rejects nonexistent endpoints and unresolved folds without guessing an offset", () => {
    for (const input of [calendar("2026-03-08", [window("2026-03-08", "02:15", "03:30")]),
      calendar("2026-11-01", [window("2026-11-01", "01:15", "02:30")])]) {
      expect(() => resolveStaffingCalendar(input)).toThrow(expect.objectContaining({ code: "invalid_calendar_time" }));
    }
  });
  it("resolves a repeated-clock interval only with valid explicit zone offsets and retains UTC/runtime identity", () => {
    const result = resolveStaffingCalendar(calendar("2026-11-01", [window("2026-11-01", "01:30", "01:15", "-04:00", "-05:00")]));
    expect(result.days[0].capacity.contractedMinutes).toBe(45);
    expect(result.intervals[0]).toMatchObject({ startAt: "2026-11-01T05:30:00.000Z", endAt: "2026-11-01T06:15:00.000Z",
      explicitStartOffset: "-04:00", explicitEndOffset: "-05:00" });
    expect(result.timezoneDataVersion).toMatch(/^node=24\..*;icu=.+;tz=.+;temporal=0\.5\.1$/);
    expect(() => resolveStaffingCalendar(calendar("2026-11-01", [window("2026-11-01", "01:30", "03:30", "-06:00", "-05:00")])))
      .toThrow(expect.objectContaining({ code: "invalid_calendar_time" }));
  });
  it("counts elapsed spring-transition minutes and subtracts unions rather than clock differences", () => {
    const input = calendar("2026-03-08", [window("2026-03-08", "00:00", "08:00")]);
    input.days[0].holidays = [window("2026-03-08", "03:00", "04:00")];
    input.days[0].leave = [window("2026-03-08", "03:30", "04:30")];
    const result = resolveStaffingCalendar(input);
    expect(result.days[0].capacity).toMatchObject({ contractedMinutes: 420, availableMinutes: 330 });
  });
  it("splits cross-midnight intervals into certified local dates and rejects excess incoming daily intervals", () => {
    const input = { ...calendar("2026-10-01", [window("2026-10-01", "23:00", "2026-10-02T02:00")], "UTC"),
      toDate: "2026-10-02", days: [calendar("2026-10-01", [window("2026-10-01", "23:00", "2026-10-02T02:00")]).days[0],
        calendar("2026-10-02", []).days[0]] };
    const result = resolveStaffingCalendar(input);
    expect(result.days.map(day => [day.date, day.capacity.contractedMinutes])).toEqual([["2026-10-01", 60], ["2026-10-02", 120]]);
    expect(result.intervals.map(interval => interval.serviceDate)).toEqual(["2026-10-01", "2026-10-02"]);
    input.days[1].contracted = Array.from({ length: 8 }, (_, i) => window("2026-10-02", `0${i}:00`, `0${i}:30`));
    expect(() => resolveStaffingCalendar(input)).toThrow(expect.objectContaining({ code: "invalid_calendar_time" }));
  });
  it("resolves separately zoned overlap without assuming resource-local clock time", () => {
    const resolved = resolveStaffingOverlap({ timezone: "Europe/London", minimumOverlapMinutes: 60,
      windows: [window("2026-10-01", "09:00", "11:00")] });
    expect(resolved[0]).toMatchObject({ date: "2026-10-01", startAt: "2026-10-01T08:00:00.000Z", endAt: "2026-10-01T10:00:00.000Z" });
  });
});
