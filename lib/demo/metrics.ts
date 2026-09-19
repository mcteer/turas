import type { Engagement, TeamMember } from "./types";

export const METRIC_VERSION = "demo-metrics-1";
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function engagementMetrics(engagement: Engagement, overrides: Partial<Pick<Engagement, "remainingHours" | "fee">> = {}) {
  const fee = overrides.fee ?? engagement.fee;
  const remainingHours = overrides.remainingHours ?? engagement.remainingHours;
  if (fee <= 0 || remainingHours < 0) return { status: "invalid" as const, reason: "Fee must be positive and remaining effort cannot be negative." };
  const effortAtCompletion = engagement.actualHours + remainingHours;
  const allocatedDeliveryCost = effortAtCompletion * engagement.loadedHourlyCost + engagement.nonLaborCost;
  const contribution = fee - allocatedDeliveryCost;
  return {
    status: "known" as const,
    metricVersion: METRIC_VERSION,
    feeForecast: round(fee),
    effortAtCompletion: round(effortAtCompletion),
    allocatedDeliveryCost: round(allocatedDeliveryCost),
    contribution: round(contribution),
    contributionPercent: round((contribution / fee) * 100),
  };
}

export function capacityMetrics(member: TeamMember) {
  const remaining = member.weeklyAvailableHours - member.committedHours - member.protectedHours;
  return {
    metricVersion: METRIC_VERSION,
    remainingSchedulableHours: round(remaining),
    utilizationPercent: round((member.committedHours / member.weeklyAvailableHours) * 100),
    isConstrained: remaining < 8,
  };
}

export function pricingFloor(cost: number, targetMarginPercent: number) {
  if (cost < 0 || targetMarginPercent < 0 || targetMarginPercent >= 100) return { status: "invalid" as const };
  return { status: "known" as const, amount: round(cost / (1 - targetMarginPercent / 100)) };
}
