import { describe, expect, it } from "vitest";
import { staffingCalendarInputSchema, staffingCalendarPeriodSchema } from "../../lib/contracts/staffing-calendar";
const window = (date = "2026-10-01") => ({ date, from: `${date}T09:00`, to: `${date}T17:00`, fromOffset: null, toOffset: null });
const input = () => ({ timezone: "America/Denver", observedAt: "2026-09-29T12:00:00Z", nextReviewAt: "2026-10-06T12:00:00Z",
  fromDate: "2026-10-01", toDate: "2026-10-02", days: ["2026-10-01", "2026-10-02"].map(date => ({ date,
    contracted: [window(date)], holidays: [], leave: [], protected: [] })) });
describe("explicit certified calendar contract", () => {
  it("requires an explicit bounded read period and rejects caller visibility or as-of overrides", () => {
    expect(staffingCalendarPeriodSchema.safeParse({ fromDate: "2026-10-01", toDate: "2026-12-30" }).success).toBe(true);
    for (const period of [{ fromDate: "2026-10-01", toDate: "2026-12-31" }, { fromDate: "2026-10-02", toDate: "2026-10-01" },
      { fromDate: "2026-10-01", toDate: "2026-10-01", includeLeave: true }, {}]) expect(staffingCalendarPeriodSchema.safeParse(period).success).toBe(false);
  });
  it("requires every certified local date, including explicitly empty nonworking days", () => {
    expect(staffingCalendarInputSchema.safeParse(input()).success).toBe(true);
    const value = input(); value.days[1].contracted = [];
    expect(staffingCalendarInputSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ days: value.days.slice(0, 1) }, { days: [value.days[0], value.days[0]] }, { timezone: "invalid/zone" },
      { nextReviewAt: "2026-09-28T12:00:00Z" }, { toDate: "2027-01-01" }, { toDate: "2026-99-99" }, { observedAt: "2099-01-01T00:00:00Z" }, { observedAt: "2026-09-29T12:00:00" }])
      expect(staffingCalendarInputSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it("bounds contracted and combined deduction intervals per local day", () => {
    const value = input(), day = value.days[0];
    expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...day, contracted: Array(8).fill(window()) }, value.days[1]] }).success).toBe(true);
    expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...day, contracted: Array(9).fill(window()) }, value.days[1]] }).success).toBe(false);
    expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...day, holidays: Array(8).fill(window()), protected: Array(9).fill(window()) }, value.days[1]] }).success).toBe(false);
  });
  it("limits leave details to a category and rejects arbitrary medical or operational text", () => {
    const value = input();
    expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...value.days[0], leave: [{ ...window(), category: "approved_leave" }] }, value.days[1]] }).success).toBe(true);
    for (const leave of [{ ...window(), reason: "PRIVATE_MEDICAL_SENTINEL" }, { ...window(), category: "PRIVATE_MEDICAL_SENTINEL" }])
      expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...value.days[0], leave: [leave] }, value.days[1]] }).success).toBe(false);
  });
  it("accepts syntactic cross-midnight and explicit repeated-clock intervals without claiming DST resolution", () => {
    const value = input();
    const cross = { ...window(), from: "2026-10-01T22:00", to: "2026-10-02T02:00" };
    expect(staffingCalendarInputSchema.safeParse({ ...value, days: [{ ...value.days[0], contracted: [cross] }, value.days[1]] }).success).toBe(true);
    const fold = { date: "2026-11-01", from: "2026-11-01T01:45", to: "2026-11-01T01:15", fromOffset: "-06:00", toOffset: "-07:00" };
    const folded = { ...value, fromDate: fold.date, toDate: fold.date, days: [{ date: fold.date, contracted: [fold], holidays: [], leave: [], protected: [] }] };
    expect(staffingCalendarInputSchema.safeParse(folded).success).toBe(true);
    expect(staffingCalendarInputSchema.safeParse({ ...folded, days: [{ ...folded.days[0], contracted: [{ ...fold, fromOffset: null }] }] }).success).toBe(false);
    const wrong = { ...value, days: [{ ...value.days[0], contracted: [window("2026-10-02")] }, value.days[1]] };
    expect(staffingCalendarInputSchema.safeParse(wrong).success).toBe(false);
  });
  it("handles inclusive leap and year boundaries without inventing missing coverage", () => {
    const value = input(), dates = ["2028-02-28", "2028-02-29", "2028-03-01"];
    expect(staffingCalendarInputSchema.safeParse({ ...value, fromDate: dates[0], toDate: dates[2], days: dates.map(date => ({ date,
      contracted: [], holidays: [], leave: [], protected: [] })) }).success).toBe(true);
    expect(staffingCalendarInputSchema.safeParse({ ...value, fromDate: "2027-02-29" }).success).toBe(false);
    const last = "2100-12-31";
    expect(staffingCalendarInputSchema.safeParse({ ...value, fromDate: last, toDate: last, days: [{ date: last,
      contracted: [{ date: last, from: `${last}T22:00`, to: "2101-01-01T00:00", fromOffset: null, toOffset: null }],
      holidays: [], leave: [], protected: [] }] }).success).toBe(true);
  });
});
