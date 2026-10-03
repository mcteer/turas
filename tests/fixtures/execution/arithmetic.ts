/** Independent, hand-calculated expectations. This fixture imports no calculator. */
export const asOf = "2026-10-02T12:00:00.000Z";
export const period = { from: "2026-10-01", to: "2026-10-02" };
export const work = (key = "proof") => ({ key, budgetMinutes: "120" as string | null,
  estimate: { minutes: "30", asOf, explicitZero: false }, lastActualMutationAt: null as string | null });
export const actual = (minutes = "60", date = "2026-10-01", mappedKey: string | null = "proof") =>
  ({ minutes, date, billable: true, mappedKey, disposition: mappedKey ? "current" as const : "retired" as const });
export const effort = () => ({ asOf, period, baselineCurrent: true, reconciledAt: null as string | null,
  packages: [work()], actuals: [actual()] });
export const utilizationVectors = [
  { actual: "1", available: "3", expected: "33.33" },
  { actual: "2", available: "3", expected: "66.67" },
  { actual: "1", available: "32", expected: "3.13" },
  { actual: "480", available: "240", expected: "200.00" },
  { actual: "0", available: "480", expected: "0.00" },
  { actual: "180", available: "360", expected: "50.00" },
  { actual: "1440", available: "540", expected: "266.67" },
  { actual: "420", available: "420", expected: "100.00" },
];
