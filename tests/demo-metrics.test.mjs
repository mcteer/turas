import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityMetrics, engagementMetrics, pricingFloor } from "../lib/demo/metrics.ts";

const pilot = { fee: 60000, actualHours: 240, remainingHours: 80, loadedHourlyCost: 125, nonLaborCost: 3000 };

test("synthetic intervention anchor reconciles contribution", () => {
  assert.deepEqual(engagementMetrics(pilot), {
    status: "known", metricVersion: "demo-metrics-1", feeForecast: 60000, effortAtCompletion: 320,
    allocatedDeliveryCost: 43000, contribution: 17000, contributionPercent: 28.33,
  });
  const intervention = engagementMetrics(pilot, { remainingHours: 40 });
  assert.equal(intervention.status, "known");
  assert.equal(intervention.contribution, 22000);
  assert.equal(intervention.contributionPercent, 36.67);
});

test("metrics reject invalid denominator inputs and preserve protected capacity", () => {
  assert.deepEqual(pricingFloor(1000, 100), { status: "invalid" });
  assert.equal(capacityMetrics({ weeklyAvailableHours: 40, committedHours: 28, protectedHours: 8 }).remainingSchedulableHours, 4);
});

test("pricing floors reject non-finite commercial assumptions", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(pricingFloor(value, 20), { status: "invalid" });
    assert.deepEqual(pricingFloor(1000, value), { status: "invalid" });
  }
});
