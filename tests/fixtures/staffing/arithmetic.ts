/** Independently specified expected values, not outputs of domain functions. */
export const CAPACITY_CORPUS = [
  { name: "overlapping leave and holidays count once", contracted: [[0, 480]],
    holidays: [[0, 120]], leave: [[60, 180]], protected: [[180, 240]],
    confirmed: 120, billable: 120, tentative: 90,
    expected: { contracted: 480, available: 300, protected: 60, remaining: 120, ratio: "40.00" } },
  { name: "protected time intersects remaining availability", contracted: [[0, 480]],
    holidays: [], leave: [[60, 180]], protected: [[0, 120]],
    confirmed: 360, billable: 360, tentative: 0,
    expected: { contracted: 480, available: 360, protected: 60, remaining: -60, ratio: "100.00" } },
  { name: "zero availability has no denominator", contracted: [[0, 480]],
    holidays: [[0, 480]], leave: [], protected: [[120, 240]],
    confirmed: 60, billable: 60, tentative: 0,
    expected: { contracted: 480, available: 0, protected: 0, remaining: -60, ratio: null } },
] as const;

export const ECONOMICS_CORPUS = [
  { name: "half-unit rounds once per resource/date/rate", minutes: [1, 1], hourlyRate: "15",
    revenue: "100", nonlabor: "9", expectedCost: "1", expectedContribution: "90", expectedMargin: "90.00" },
  { name: "negative planned contribution", minutes: [90], hourlyRate: "100",
    revenue: "100", nonlabor: "10", expectedCost: "150", expectedContribution: "-60", expectedMargin: "-60.00" },
  { name: "zero revenue does not invent margin", minutes: [60], hourlyRate: "12",
    revenue: "0", nonlabor: "0", expectedCost: "12", expectedContribution: "-12", expectedMargin: null },
] as const;
