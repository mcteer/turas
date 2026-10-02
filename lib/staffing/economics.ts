import { roundHalfAway, twoDecimalPercentage } from "./arithmetic";
export { roundHalfAway } from "./arithmetic";
import { staffingEconomicsCalculationSchema, type StaffingCurrency, type StaffingEconomicsCalculation } from "../contracts/staffing-economics";
export const STAFFING_ECONOMICS_VERSION = "staffing-economics-v1";
const DERIVED_LIMIT = 1_000_000_000_000_000n;
export function currencyExponent(currency: StaffingCurrency): 0 | 2 { return currency === "JPY" ? 0 : 2; }
function bounded(value: bigint) {
  if (value > DERIVED_LIMIT || value < -DERIVED_LIMIT) throw new Error("Derived total exceeds limit");
  return value;
}
/** Financial projection only. Inputs must already be current and authorized by
 * the caller; this pure function cannot approve policy or infer missing inputs. */
export function calculateStaffingEconomics(raw: StaffingEconomicsCalculation) {
  const input = staffingEconomicsCalculationSchema.parse(raw);
  const reasons = new Set<string>();
  if (input.revenue === null) reasons.add("missing_revenue");
  if (input.nonlabor === null) reasons.add("missing_nonlabor");
  const referenceValues = new Map<string, string>();
  function cost(kind: "loadedCost" | "service") {
    const groups = new Map<string, { resourceId: string; localDate: string; rateRevisionId: string;
      minutes: bigint; rate: bigint }>();
    let complete = true;
    for (const line of input.allocations) {
      const rate = line[kind];
      if (!rate) { complete = false; if (kind === "loadedCost") reasons.add("missing_loaded_cost"); continue; }
      const identity = `${kind}:${rate.revisionId}`, signature = `${rate.currency}:${rate.minorUnitsPerHour}`;
      if (referenceValues.has(identity) && referenceValues.get(identity) !== signature) throw new Error("Inconsistent rate revision");
      referenceValues.set(identity, signature);
      if (rate.currency !== input.currency) { complete = false; reasons.add("mixed_currency"); continue; }
      const key = `${line.resourceId}:${line.localDate}:${rate.revisionId}`;
      const group = groups.get(key) ?? { resourceId: line.resourceId, localDate: line.localDate,
        rateRevisionId: rate.revisionId, minutes: 0n, rate: BigInt(rate.minorUnitsPerHour) };
      group.minutes += BigInt(line.minutes); groups.set(key, group);
    }
    const breakdown = [...groups.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId) ||
      a.localDate.localeCompare(b.localDate) || a.rateRevisionId.localeCompare(b.rateRevisionId)).map(group => ({
        resourceId: group.resourceId, localDate: group.localDate, rateRevisionId: group.rateRevisionId,
        minutes: group.minutes.toString(), minorUnitsPerHour: group.rate.toString(),
        numerator: (group.minutes * group.rate).toString(), divisor: "60", amount: bounded(roundHalfAway(group.minutes * group.rate, 60n)).toString() }));
    const total = breakdown.reduce((sum, group) => bounded(sum + BigInt(group.amount)), 0n);
    return { complete, total: complete ? total : null, breakdown };
  }
  const loaded = cost("loadedCost"), service = cost("service");
  const complete = reasons.size === 0;
  const contribution = complete && loaded.total !== null ? bounded(BigInt(input.revenue!) - loaded.total - BigInt(input.nonlabor!)) : null;
  return { formulaVersion: STAFFING_ECONOMICS_VERSION, currency: input.currency, exponent: currencyExponent(input.currency),
    status: complete ? "complete" as const : "incomplete" as const, reasons: [...reasons],
    contractedRevenue: input.revenue, nonlaborCost: input.nonlabor, deliveryCost: loaded.total?.toString() ?? null,
    contribution: contribution?.toString() ?? null,
    marginPercentage: contribution !== null && BigInt(input.revenue!) !== 0n ? twoDecimalPercentage(roundHalfAway(contribution * 10_000n, BigInt(input.revenue!))) : null,
    hypotheticalServiceRevenue: service.total?.toString() ?? null,
    costGroups: loaded.breakdown, serviceGroups: service.breakdown };
}

import { staffingEffectiveRateSchema } from "../contracts/staffing-economics";
import { staffingDateSchema, staffingIdSchema } from "../contracts/staffing";
import { z } from "zod";
const effectiveRatesSchema = z.array(z.object({ ...staffingEffectiveRateSchema.shape,
  revisionId: staffingIdSchema }).strict().refine(rate => rate.fromDate < rate.toDate, "Invalid effective rate period")).max(20_000);
export type EffectiveStaffingRate = z.infer<typeof effectiveRatesSchema>[number];
/** Validate the complete visible effective-rate set before selecting a boundary.
 * Rates in another currency remain separate; no exchange rate is inferred. */
export function indexEffectiveStaffingRates(raw: EffectiveStaffingRate[]) {
  const rates = effectiveRatesSchema.parse(raw), groups = new Map<string, EffectiveStaffingRate[]>();
  for (const rate of rates) {
    const key = `${rate.resourceId}:${rate.kind}:${rate.currency}`, group = groups.get(key) ?? [];
    group.push(rate); groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    for (let i = 1; i < group.length; i++) if (group[i].fromDate < group[i - 1].toDate) throw new Error("Overlapping effective rates");
  }
  return (resourceId: string, kind: "loaded_cost" | "service", currency: StaffingCurrency, localDate: string) => {
    staffingIdSchema.parse(resourceId); staffingDateSchema.parse(localDate);
    const group = groups.get(`${resourceId}:${kind}:${currency}`) ?? [];
    let from = 0, to = group.length;
    while (from < to) { const middle = Math.floor((from + to) / 2); if (group[middle].fromDate <= localDate) from = middle + 1; else to = middle; }
    const selected = group[from - 1];
    return selected && localDate < selected.toDate ? { ...selected } : null;
  };
}
export function selectEffectiveStaffingRate(raw: EffectiveStaffingRate[], resourceId: string,
  kind: "loaded_cost" | "service", currency: StaffingCurrency, localDate: string) {
  return indexEffectiveStaffingRates(raw)(resourceId, kind, currency, localDate);
}
