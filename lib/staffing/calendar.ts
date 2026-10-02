import { roundHalfAway, twoDecimalPercentage } from "./arithmetic";
export const STAFFING_CAPACITY_VERSION = "staffing-capacity-v1";
/** Resolved UTC endpoints on the integer elapsed-minute axis. Local clock
 * endpoints must be resolved and split into resource-local dates before use. */
export type StaffingInterval = readonly [number, number];
function validateInterval(interval: StaffingInterval) {
  if (interval.length !== 2 || !interval.every(Number.isSafeInteger) || interval[0] >= interval[1]) throw new Error("Invalid resolved interval");
}
export function intervalUnion(intervals: readonly StaffingInterval[]): StaffingInterval[] {
  intervals.forEach(validateInterval);
  const sorted = intervals.map(([start, end]) => [start, end] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
export function subtractIntervals(base: readonly StaffingInterval[], removed: readonly StaffingInterval[]): StaffingInterval[] {
  const working = intervalUnion(base), excluded = intervalUnion(removed), result: StaffingInterval[] = [];
  for (const [start, end] of working) {
    let cursor = start;
    for (const [from, to] of excluded) {
      if (to <= cursor) continue;
      if (from >= end) break;
      if (from > cursor) result.push([cursor, Math.min(from, end)]);
      cursor = Math.max(cursor, to);
      if (cursor >= end) break;
    }
    if (cursor < end) result.push([cursor, end]);
  }
  return result;
}
export function intersectIntervals(left: readonly StaffingInterval[], right: readonly StaffingInterval[]): StaffingInterval[] {
  return subtractIntervals(left, subtractIntervals(left, right));
}
function elapsed(intervals: readonly StaffingInterval[]) {
  return intervalUnion(intervals).reduce((minutes, [start, end]) => {
    const total = minutes + end - start;
    if (!Number.isSafeInteger(total)) throw new Error("Interval duration exceeds limit");
    return total;
  }, 0);
}
export function calculateDailyCapacity(input: { contracted: readonly StaffingInterval[]; holidays: readonly StaffingInterval[];
  leave: readonly StaffingInterval[]; protected: readonly StaffingInterval[]; confirmed: number; billable: number; tentative: number }) {
  if (input.contracted.length > 8 || input.holidays.length + input.leave.length + input.protected.length > 16 ||
      [input.confirmed, input.billable, input.tentative].some(value => !Number.isSafeInteger(value) || value < 0) || input.billable > input.confirmed) {
    throw new Error("Invalid daily capacity input");
  }
  const contracted = intervalUnion(input.contracted), contractedMinutes = elapsed(contracted);
  if (contractedMinutes > 960) throw new Error("Contracted day exceeds limit");
  const available = subtractIntervals(contracted, [...input.holidays, ...input.leave]), availableMinutes = elapsed(available);
  const protectedMinutes = elapsed(intersectIntervals(available, input.protected));
  const remainingMinutes = availableMinutes - protectedMinutes - input.confirmed;
  return { formulaVersion: STAFFING_CAPACITY_VERSION, contractedMinutes, availableMinutes, protectedMinutes,
    confirmedMinutes: input.confirmed, confirmedBillableMinutes: input.billable, tentativeMinutes: input.tentative,
    remainingMinutes, needsReview: remainingMinutes < 0,
    plannedBillableRatio: availableMinutes ? twoDecimalPercentage(roundHalfAway(BigInt(input.billable) * 10_000n, BigInt(availableMinutes))) : null,
    ratioReason: availableMinutes ? null : "zero_available" as const,
    actualUtilization: null, actualReason: "actual_unavailable" as const };
}
