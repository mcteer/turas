import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ECONOMICS_CORPUS } from "../fixtures/staffing/arithmetic";
import { calculateStaffingEconomics, roundHalfAway, currencyExponent, selectEffectiveStaffingRate, indexEffectiveStaffingRates } from "../../lib/staffing/economics";

const resourceId = randomUUID(), rateRevisionId = randomUUID();
const line = (minutes: number, rate = "15") => ({ resourceId, localDate: "2026-10-01", minutes,
  loadedCost: { revisionId: rateRevisionId, currency: "USD" as const, minorUnitsPerHour: rate }, service: null });
describe("exact staffing scenario arithmetic", () => {
  it("agrees with independently authored contribution vectors", () => {
    for (const vector of ECONOMICS_CORPUS) {
      const result = calculateStaffingEconomics({ currency: "USD", revenue: vector.revenue, nonlabor: vector.nonlabor,
        allocations: vector.minutes.map(minutes => line(minutes, vector.hourlyRate)) });
      expect(result).toMatchObject({ status: "complete", deliveryCost: vector.expectedCost,
        contribution: vector.expectedContribution, marginPercentage: vector.expectedMargin });
    }
  });
  it("groups before rounding so splits and merged allocation minutes agree", () => {
    const calculate = (minutes: number[]) => calculateStaffingEconomics({ currency: "USD", revenue: "100", nonlabor: "0",
      allocations: minutes.map(value => line(value)) });
    expect(calculate([1, 1, 1, 1]).deliveryCost).toBe("1");
    expect(calculate([4]).deliveryCost).toBe(calculate([1, 1, 1, 1]).deliveryCost);
    const separate = calculateStaffingEconomics({ currency: "USD", revenue: "100", nonlabor: "0",
      allocations: [line(1), { ...line(1), localDate: "2026-10-02" }] });
    expect(separate.deliveryCost).toBe("0");
  });
  it("retains exact reproducible group numerators, divisors and rate identities", () => {
    const result = calculateStaffingEconomics({ currency: "USD", revenue: "100", nonlabor: "0",
      allocations: [line(1), line(3), { ...line(2), localDate: "2026-10-02" }] });
    expect(result.costGroups).toEqual([
      { resourceId, localDate: "2026-10-01", rateRevisionId, minutes: "4", minorUnitsPerHour: "15", numerator: "60", divisor: "60", amount: "1" },
      { resourceId, localDate: "2026-10-02", rateRevisionId, minutes: "2", minorUnitsPerHour: "15", numerator: "30", divisor: "60", amount: "1" },
    ]);
    expect(result.deliveryCost).toBe("2");
  });
  it("rounds signed ties away from zero and percentage ties to two decimals", () => {
    expect(roundHalfAway(30n, 60n)).toBe(1n); expect(roundHalfAway(-30n, 60n)).toBe(-1n);
    expect(roundHalfAway(29n, 60n)).toBe(0n);
    const result = calculateStaffingEconomics({ currency: "JPY", revenue: "20000", nonlabor: "0",
      allocations: [{ ...line(60, "19999"), loadedCost: { revisionId: rateRevisionId, currency: "JPY", minorUnitsPerHour: "19999" } }] });
    expect(result.marginPercentage).toBe("0.01");
    expect(currencyExponent("JPY")).toBe(0);
    for (const currency of ["USD", "EUR", "GBP", "CAD", "AUD"] as const) expect(currencyExponent(currency)).toBe(2);
  });
  it("keeps missing inputs unknown and mixed currencies incomplete", () => {
    const missing = calculateStaffingEconomics({ currency: "USD", revenue: null, nonlabor: "0", allocations: [{ ...line(60), loadedCost: null }] });
    expect(missing).toMatchObject({ status: "incomplete", deliveryCost: null, contribution: null, marginPercentage: null });
    expect(missing.reasons).toEqual(["missing_revenue", "missing_loaded_cost"]);
    const mixed = calculateStaffingEconomics({ currency: "USD", revenue: "100", nonlabor: "0",
      allocations: [{ ...line(60), loadedCost: { revisionId: rateRevisionId, currency: "EUR", minorUnitsPerHour: "10" } }] });
    expect(mixed.status).toBe("incomplete"); expect(mixed.contribution).toBeNull(); expect(mixed.reasons).toContain("mixed_currency");
  });
  it("keeps hypothetical service revenue separate from contracted contribution", () => {
    const result = calculateStaffingEconomics({ currency: "USD", revenue: "100", nonlabor: "10",
      allocations: [{ ...line(60, "30"), service: { revisionId: randomUUID(), currency: "USD", minorUnitsPerHour: "90" } }] });
    expect(result).toMatchObject({ contribution: "60", hypotheticalServiceRevenue: "90", deliveryCost: "30" });
  });
  it("selects half-open month boundaries and rejects overlapping rate periods", () => {
    const first = { resourceId, revisionId: randomUUID(), kind: "loaded_cost" as const, currency: "USD" as const,
      fromDate: "2026-09-01", toDate: "2026-10-01", minorUnitsPerHour: "15" };
    const second = { ...first, revisionId: randomUUID(), fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "20" };
    expect(selectEffectiveStaffingRate([first, second], resourceId, "loaded_cost", "USD", "2026-09-30")?.revisionId).toBe(first.revisionId);
    expect(selectEffectiveStaffingRate([first, second], resourceId, "loaded_cost", "USD", "2026-10-01")?.revisionId).toBe(second.revisionId);
    expect(selectEffectiveStaffingRate([first, second], resourceId, "loaded_cost", "USD", "2026-11-01")).toBeNull();
    expect(() => selectEffectiveStaffingRate([first, { ...second, fromDate: "2026-09-30" }], resourceId, "loaded_cost", "USD", "2026-10-01")).toThrow("Overlapping");
    expect(selectEffectiveStaffingRate([first, { ...first, revisionId: randomUUID(), currency: "EUR" }], resourceId, "loaded_cost", "EUR", "2026-09-30")?.currency).toBe("EUR");
    const select = indexEffectiveStaffingRates([second, first]);
    expect(select(resourceId, "loaded_cost", "USD", "2026-08-31")).toBeNull();
    const copy = select(resourceId, "loaded_cost", "USD", "2026-10-01")!; copy.minorUnitsPerHour = "99";
    expect(select(resourceId, "loaded_cost", "USD", "2026-10-01")?.minorUnitsPerHour).toBe("20");
    expect(select(resourceId, "loaded_cost", "USD", "2026-11-01")).toBeNull();
  });
  it("accepts exact maximum input bounds without floating-point loss", () => {
    const result = calculateStaffingEconomics({ currency: "USD", revenue: "1000000000000", nonlabor: "0", allocations: [line(960, "100000000")] });
    expect(result).toMatchObject({ deliveryCost: "1600000000", contribution: "998400000000", marginPercentage: "99.84" });
  });
  it("rejects noncanonical, unsafe and inconsistent numeric inputs", () => {
    const input = { currency: "USD" as const, revenue: "100", nonlabor: "0", allocations: [line(60)] };
    for (const revenue of ["01", "1.0", "-1", "1000000000001"]) expect(() => calculateStaffingEconomics({ ...input, revenue })).toThrow();
    expect(() => calculateStaffingEconomics({ ...input, allocations: [line(1.5)] })).toThrow();
    expect(() => calculateStaffingEconomics({ ...input, allocations: [line(60, "100000001")] })).toThrow();
    expect(() => calculateStaffingEconomics({ ...input, allocations: [line(1, "10"), line(1, "11")] })).toThrow();
  });
});
