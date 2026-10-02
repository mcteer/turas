import { describe, expect, it } from "vitest";
import { CAPACITY_CORPUS } from "../fixtures/staffing/arithmetic";
import { calculateDailyCapacity, intervalUnion, subtractIntervals } from "../../lib/staffing/calendar";

describe("exact resolved-interval capacity", () => {
  it("agrees with independent union/deduction/negative/zero vectors", () => {
    for (const vector of CAPACITY_CORPUS) {
      const result = calculateDailyCapacity(vector);
      expect(result).toMatchObject({ contractedMinutes: vector.expected.contracted, availableMinutes: vector.expected.available,
        protectedMinutes: vector.expected.protected, remainingMinutes: vector.expected.remaining,
        plannedBillableRatio: vector.expected.ratio, tentativeMinutes: vector.tentative });
      expect(result.actualUtilization).toBeNull();
    }
  });
  it("merges overlap and adjacency regardless of input order", () => {
    expect(intervalUnion([[100, 120], [0, 60], [30, 90], [90, 100]])).toEqual([[0, 120]]);
    expect(subtractIntervals([[0, 120]], [[80, 200], [-20, 10], [30, 40]])).toEqual([[10, 30], [40, 80]]);
    expect(subtractIntervals([[0, 120]], [[-1, 121]])).toEqual([]);
  });
  it("uses available time as the planned ratio denominator and rounds once", () => {
    const result = calculateDailyCapacity({ contracted: [[0, 480]], holidays: [], leave: [[0, 180]], protected: [[180, 240]],
      confirmed: 100, billable: 100, tentative: 200 });
    expect(result.plannedBillableRatio).toBe("33.33"); expect(result.remainingMinutes).toBe(140);
    expect(result.tentativeMinutes).toBe(200);
    expect(calculateDailyCapacity({ contracted: [], holidays: [], leave: [], protected: [], confirmed: 0, billable: 0, tentative: 0 }))
      .toMatchObject({ plannedBillableRatio: null, ratioReason: "zero_available" });
  });
  it("retains confirmed overload and rejects fractional or invalid intervals", () => {
    expect(calculateDailyCapacity({ contracted: [[0, 60]], holidays: [], leave: [], protected: [], confirmed: 90, billable: 90, tentative: 10 }))
      .toMatchObject({ remainingMinutes: -30, needsReview: true, plannedBillableRatio: "150.00" });
    for (const intervals of [[[1, 1]], [[2, 1]], [[0, 1.5]], [[0, 961]]]) expect(() => calculateDailyCapacity({
      contracted: intervals as [number, number][], holidays: [], leave: [], protected: [], confirmed: 0, billable: 0, tentative: 0 })).toThrow();
  });
});
