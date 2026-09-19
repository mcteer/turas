import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateServicesPlan, DEFAULT_SERVICES_PLAN } from "../lib/demo/services-plan.ts";
import { DEMO_DATA } from "../lib/demo/fixtures.ts";
import { engagementMetrics } from "../lib/demo/metrics.ts";

test("annual plan accounts for full payroll and overhead, not only billable cost", () => {
  const plan = calculateServicesPlan(DEFAULT_SERVICES_PLAN);
  assert.equal(plan.availableHours, 5520);
  assert.equal(plan.billableHours, 3588);
  assert.equal(plan.revenue, 897000);
  assert.equal(plan.totalCost, 810000);
  assert.equal(plan.operatingContribution, 87000);
  assert.equal(plan.operatingMarginPercent, 9.7);
  assert.equal(plan.targetRate, 282.19);
  assert.equal(plan.breakEvenUtilizationPercent, 58.7);
});
test("lower utilization exposes loss and reduced weeks do not reduce annual salary", () => {
  assert.equal(calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, billablePercent: 50 }).operatingContribution, -120000);
  assert.equal(calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, deliveryWeeks: 30 }).payroll, 690000);
});
test("zero denominators and capacity-infeasible plans are explicit", () => {
  const zero = calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, billablePercent: 0 });
  assert.equal(zero.operatingMarginPercent, null);
  assert.equal(zero.targetRate, null);
  assert.equal(zero.operatingContribution, -810000);
  assert.equal(calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, realizedHourlyRate: 0 }).breakEvenUtilizationPercent, null);
  assert.equal(calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, billablePercent: 80 }).capacityFeasible, false);
  assert.equal(calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, realizedHourlyRate: 100 }).breakEvenFeasible, false);
  for (const invalid of [NaN, Infinity, -1]) assert.throws(() => calculateServicesPlan({ ...DEFAULT_SERVICES_PLAN, realizedHourlyRate: invalid }));
});
test("each engagement uses its own economics and additive intervention costs more", () => {
  const expected = [17000, 10500, 5880, 9700];
  DEMO_DATA.engagements.forEach((engagement, index) => assert.equal(engagementMetrics(engagement).contribution, expected[index]));
  const pilot = DEMO_DATA.engagements[0];
  assert.equal(engagementMetrics(pilot, { remainingHours: 120 }).contribution, 12000);
  assert.equal(engagementMetrics(pilot, { remainingHours: NaN }).status, "invalid");
});
