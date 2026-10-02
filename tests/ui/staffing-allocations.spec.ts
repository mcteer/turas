import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createReviewedAllocationProposalFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { signIn } from "../fixtures/ui";
import { withTransaction, query } from "../../lib/server/db/client";
import { readDemand } from "../../lib/server/staffing/demands";
import { reviseAllocation } from "../../lib/server/staffing/allocations";
import { reviseResource } from "../../lib/server/staffing/resources";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { randomUUID } from "node:crypto";
test.beforeEach(async () => {
  requireOwnedStaffingClone();
  if (process.env.TURAS_STAFFING_FIXTURE_READY !== "1") throw new Error("Use the owned staffing UI runner");
  await resetStaffingFixtureRates();
});
async function open(page: Page, f: Awaited<ReturnType<typeof createReviewedAllocationProposalFixture>>, account: "mcteer" | "panel") {
  const demand = await withTransaction(db => readDemand(f.actor, f.demand.demandId, db));
  await signIn(page, account);
  await page.goto(`/customers/${demand.customerId}/engagements/${demand.engagementId}/staffing`);
  await page.getByRole("button", { name: /Open demand 1/ }).click();
  await page.getByRole("button", { name: /Open allocation 1/ }).click();
  await expect(page.getByRole("heading", { name: "Allocation review", exact: true })).toBeVisible();
}
test("manager reviews daily effects and reconciles a genuinely committed confirmation whose response is lost", async ({ page }) => {
  test.setTimeout(180_000);
  const f = await createReviewedAllocationProposalFixture(); await open(page, f, "mcteer");
  await page.getByLabel("Allocation action", { exact: true }).selectOption("confirm");
  await page.getByLabel("Allocation rationale", { exact: true }).fill("Synthetic UI exact review");
  await page.getByRole("button", { name: "Prepare or save exact action" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Review confirm", exact: true })).toBeVisible();
  await expect(page.getByText(`${f.date}: 240 total confirmed resource minutes after approval`, { exact: true })).toBeVisible();
  await page.getByLabel("Decision rationale", { exact: true }).fill("Synthetic UI human confirmation");
  let applied = false;
  await page.route(`**/api/staffing/allocations/${f.allocation.allocationId}/decisions`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200); applied = true;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Approve confirm", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Check allocation receipt", exact: true })).toBeVisible();
  expect(applied).toBe(true);
  await page.getByRole("button", { name: "Check allocation receipt", exact: true }).click();
  await expect(page.getByText("confirmed · readable", { exact: true })).toBeVisible();
  const rows = await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId]);
  expect(rows.rows.map(row => row.minutes)).toEqual([240]);
  expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(1);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("competing revision preserves dirty action and disables its captured head until explicit review", async ({ page }) => {
  test.setTimeout(120_000);
  const f = await createReviewedAllocationProposalFixture(); await open(page, f, "mcteer");
  await page.getByLabel("Allocation rationale", { exact: true }).fill("Retain this unsaved action");
  await withTransaction(db => reviseAllocation(f.actor, f.allocation.allocationId, {
    requestKey: randomUUID(), rationale: "Synthetic competing revision", revisionId: f.allocation.revisionId,
    contentDigest: f.allocation.contentDigest, expectedAggregateVersion: f.allocation.aggregateVersion,
    allocation: { ...f.allocationInput, days: [{ date: f.date, minutes: 120 }] },
  }, db));
  await page.getByRole("button", { name: "Reload allocations", exact: true }).click();
  await expect(page.getByLabel("Allocation rationale", { exact: true })).toHaveValue("Retain this unsaved action");
  await expect(page.getByRole("button", { name: "Prepare or save exact action" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Use current allocation revision" })).toBeVisible();
  expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
});

test("an older eligible allocation detail cannot replace a newer withheld projection", async ({ page }) => {
  test.setTimeout(180_000);
  const f = await createReviewedAllocationProposalFixture();
  await page.clock.install(); await open(page, f, "mcteer");
  let release!: () => void, captured!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route(`**/api/staffing/allocations/${f.allocation.allocationId}`, async route => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true;
    const actual = await route.fetch(); expect(actual.status()).toBe(200);
    expect((await actual.json()).data.contentAvailability).toBe("readable");
    captured(); await released; await route.fulfill({ response: actual });
  });
  try {
    await page.clock.runFor(10_000); await ready;
    await reviseResource(f.actor, f.resource.resourceId, { requestKey: randomUUID(), rationale: "Synthetic current resource inactivation",
      revisionId: f.resource.revisionId, contentDigest: f.resource.contentDigest, expectedAggregateVersion: f.resource.aggregateVersion,
      resource: { ...f.profile, state: "inactive" } });
    await page.getByRole("button", { name: "Reload allocations", exact: true }).click();
    await expect(page.getByText("proposed · withheld", { exact: true })).toBeVisible();
    const delivered = page.waitForResponse(response => response.url().endsWith(`/api/staffing/allocations/${f.allocation.allocationId}`));
    release(); await delivered;
    await page.clock.runFor(50);
    await expect(page.getByText("proposed · withheld", { exact: true })).toBeVisible();
    await expect(page.getByText(`${f.date}: 240 proposed minutes`, { exact: true })).toHaveCount(0);
  } finally { release(); }
});

test("a delayed eligible review preview cannot return after current source withdrawal denies a newer preview", async ({ page }) => {
  test.setTimeout(180_000);
  const f = await createReviewedAllocationProposalFixture();
  await page.clock.install(); await open(page, f, "mcteer");
  await page.getByLabel("Allocation action", { exact: true }).selectOption("confirm");
  await page.getByLabel("Allocation rationale", { exact: true }).fill("Synthetic exact review before source withdrawal");
  await page.getByRole("button", { name: "Prepare or save exact action", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review confirm", exact: true })).toBeVisible();
  let release!: () => void, captured!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route(`**/api/staffing/allocations/${f.allocation.allocationId}/review-preview?previewId=*`, async route => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true; const actual = await route.fetch(); expect(actual.status()).toBe(200);
    captured(); await released; await route.fulfill({ response: actual });
  });
  try {
    await page.clock.runFor(10_000); await ready;
    await withdrawManualEvidence(f.actor, f.manualEvidenceId, { requestKey: randomUUID(), sourceGeneration: 1,
      rationale: "Synthetic current competency original withdrawal" });
    const denied = page.waitForResponse(response => response.url().includes(`/allocations/${f.allocation.allocationId}/review-preview?`) && response.status() === 409);
    await page.clock.runFor(10_000); await denied;
    await expect(page.getByRole("heading", { name: "Review confirm", exact: true })).toHaveCount(0);
    const delivered = page.waitForResponse(response => response.url().includes(`/allocations/${f.allocation.allocationId}/review-preview?`) && response.status() === 200);
    release(); await delivered;
    await page.clock.runFor(50);
    await expect(page.getByRole("heading", { name: "Review confirm", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve confirm", exact: true })).toHaveCount(0);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
  } finally { release(); }
});
