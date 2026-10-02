import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { createResource, reviseResource } from "../../lib/server/staffing/resources";
import { createFinanceInput } from "../../lib/server/staffing/economics";
import { syntheticResource } from "../fixtures/staffing/seed";
import { signIn } from "../fixtures/ui";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates, staffingExact } from "../fixtures/staffing/allocations";
test.beforeEach(() => {
  requireOwnedStaffingClone(); if (process.env.TURAS_STAFFING_FIXTURE_READY !== "1") throw new Error("Use the owned staffing UI runner");
});
test("operational keyboard period reports unknown capacity without erasing a committed ledger or exposing finance", async ({ page }) => {
  test.setTimeout(120_000); await resetStaffingFixtureRates();
  const f = await withTransaction(async db => {
    const ledger = await createConfirmedAllocationLedgerFixture(db);
    const customerId = (await db.query("SELECT customer_id FROM staffing_allocations WHERE id=$1", [ledger.allocation.allocationId])).rows[0].customer_id as string;
    return { ...ledger, customerId };
  });
  // This is a seeded-ledger read test, not trusted journey/confirmation proof.
  await signIn(page, "panel"); await page.goto("/staffing");
  const customer = page.getByLabel("Customer", { exact: true });
  await expect(customer).toBeEnabled();
  const choices = await page.request.get("/api/customers?limit=50");
  expect(choices.status()).toBe(200);
  expect((await choices.json()).data.items.some((item: { id: string }) => item.id === f.customerId)).toBe(true);
  await expect.poll(() => customer.locator("option").count()).toBeGreaterThan(1);
  for (let i = 0; i < 100 && !await customer.locator(`option[value="${f.customerId}"]`).count(); i++) {
    const count = await customer.locator("option").count();
    await page.getByRole("button", { name: "More customer choices" }).click();
    await expect.poll(() => customer.locator("option").count()).toBeGreaterThan(count);
  }
  await customer.selectOption(f.customerId);
  await page.getByLabel("First service date", { exact: true }).fill(f.firstDate);
  await page.getByLabel("Last service date", { exact: true }).fill(f.firstDate);
  await page.getByRole("button", { name: "Read planned operations", exact: true }).focus(); await page.keyboard.press("Enter");
  const day = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: f.firstDate, exact: true }) });
  await expect(day.getByRole("cell", { name: "120", exact: true })).toHaveCount(2);
  await expect(day.getByRole("cell", { name: "Unknown", exact: true })).toHaveCount(5);
  await expect(page.getByText(/Needs review: calendar missing/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Planning finance", exact: true })).toHaveCount(0);
  const response = await page.request.get(`/api/staffing/operations?customerId=${f.customerId}&fromDate=${f.firstDate}&toDate=${f.firstDate}`);
  expect(response.status()).toBe(200); expect(await response.text()).not.toMatch(/minorUnits|provenance|evidence|rationale|leave/);
  await accessible(page);
});
async function resource() { return withTransaction(async db => {
  const actor = await createProfileTestSession(db, "mcteer"), profile = syntheticResource(), result = await createResource(actor,
    { requestKey: randomUUID(), rationale: "Synthetic finance UI resource", resource: profile }, db);
  return { ...result, actor, profile, resourceId: result.resourceId! };
}); }
async function accessible(page: Parameters<typeof signIn>[0]) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test("canonical finance keyboard input, exact revision and planning-only policy approval", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await resource(); await signIn(page, "mcteer"); await page.goto("/staffing/finance");
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Enter a finance input" }) });
  await form.getByLabel("Canonical resource ID").fill(fixture.resourceId); await form.getByLabel("Currency", { exact: true }).selectOption("USD");
  await form.getByLabel("First effective date").fill("2026-10-01"); await form.getByLabel("End date (exclusive)").fill("2026-11-01");
  await form.getByLabel("Rate (minor units per hour)").fill("1000");
  await form.getByLabel("Provenance reference").fill("Synthetic finance UI provenance"); await form.getByLabel("Input rationale").fill("Synthetic entered hourly cost");
  const committed = page.waitForResponse(r => r.url().endsWith("/api/staffing/finance/inputs") && r.request().method() === "POST");
  await form.getByRole("button", { name: "Save entered finance input" }).focus(); await page.keyboard.press("Enter");
  const result = (await (await committed).json()).data;
  await page.getByRole("button", { name: `Review input ${result.entityId}` }).click();
  await expect(page.getByText("Provenance: Synthetic finance UI provenance", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revise this input" }).click();
  const revision = page.locator("form").filter({ has: page.getByRole("heading", { name: "Revise finance input" }) });
  await revision.getByLabel("Rate (minor units per hour)").fill("1200"); await revision.getByLabel("Revision rationale").fill("Synthetic exact input revision");
  await revision.getByRole("button", { name: "Save finance revision" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText(/USD · 1200 minor units\/hour/)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Policy approval rationale").fill("Synthetic human planning formula and policy review");
  await page.getByRole("button", { name: "Approve this planning formula and policy" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText("staffing-economics-v1 · approved", { exact: true })).toBeVisible({ timeout: 20_000 });
  await accessible(page);
});
test("a delayed eligible finance-input response cannot replace its newer withheld selection", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await resource(), sentinel = "PRIVATE_SYNTHETIC_DELAYED_FINANCE_PROVENANCE";
  const input = await createFinanceInput(fixture.actor, { requestKey: randomUUID(), rationale: "Synthetic delayed input", provenance: sentinel,
    input: { kind: "rate", rateKind: "loaded_cost", resourceId: fixture.resourceId, currency: "USD",
      fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "7654321" } });
  await signIn(page, "mcteer"); await page.goto("/staffing/finance");
  const path = `/api/staffing/finance/inputs/${input.entityId}`;
  let captured!: () => void, release!: () => void, first = true;
  const ready = new Promise<void>(resolve => { captured = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    if (!first) { await route.continue(); return; } first = false;
    const actual = await route.fetch(), body = await actual.body();
    expect(body.toString()).toContain(sentinel); captured(); await held; await route.fulfill({ response: actual, body });
  });
  const review = page.getByRole("button", { name: `Review input ${input.entityId}`, exact: true });
  await review.click(); await ready;
  await reviseResource(fixture.actor, fixture.resourceId, { ...staffingExact(fixture), requestKey: randomUUID(),
    rationale: "Synthetic current resource eligibility withdrawal", resource: { ...fixture.profile, state: "inactive" } });
  await review.click();
  await expect(page.getByText("Financial values and provenance are withheld because current resource or baseline eligibility changed.", { exact: true })).toBeVisible();
  const delayed = page.waitForResponse(response => new URL(response.url()).pathname === path);
  release(); await delayed; await page.unroute(`**${path}`);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByText(/PRIVATE_SYNTHETIC_DELAYED_FINANCE_PROVENANCE|7654321/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revise this input", exact: true })).toHaveCount(0);
  await accessible(page);
});
test("operational accounts see no finance navigation, controls, amounts or provenance", async ({ page }) => {
  test.setTimeout(90_000); await signIn(page, "panel"); await page.goto("/staffing/finance");
  await expect(page.getByRole("heading", { name: "Staffing unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Planning finance", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Rate (minor units per hour)")).toHaveCount(0);
  await expect(page.getByLabel("Provenance reference")).toHaveCount(0);
  const response = await page.request.get("/api/staffing/finance/inputs"); expect(response.status()).toBe(403);
  const text = await response.text(); for (const key of ["minorUnits", "provenance", "currency", "inputPolicyDigest"]) expect(text).not.toContain(key);
  await accessible(page);
});
test("inactive resources withhold current finance values before deletion or cleanup", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await resource(), input = await createFinanceInput(fixture.actor, { requestKey: randomUUID(), rationale: "Synthetic visibility boundary",
    provenance: "PRIVATE_SYNTHETIC_FINANCE_UI_SENTINEL", input: { kind: "rate", rateKind: "loaded_cost", resourceId: fixture.resourceId,
      currency: "JPY", fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "99999999" } });
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${fixture.resourceId}`);
  await page.getByRole("button", { name: "Revise resource", exact: true }).click();
  const registry = page.locator("form").filter({ has: page.getByRole("heading", { name: "Revise resource", exact: true }) });
  await registry.getByLabel("State", { exact: true }).selectOption("inactive"); await registry.getByLabel("Revision rationale").fill("Synthetic resource withdrawal from current supply");
  await registry.getByRole("button", { name: "Save resource revision" }).click();
  await expect(page.getByRole("status")).toContainText("Saved", { timeout: 20_000 });
  await page.goto("/staffing/finance"); await page.getByRole("button", { name: `Review input ${input.entityId}` }).click();
  await expect(page.getByText("Financial values and provenance are withheld because current resource or baseline eligibility changed.", { exact: true })).toBeVisible();
  await expect(page.getByText(/PRIVATE_SYNTHETIC_FINANCE_UI_SENTINEL|99999999/)).toHaveCount(0);
  const response = await page.request.get(`/api/staffing/finance/inputs/${input.entityId}`); expect(response.status()).toBe(200);
  const text = await response.text(); expect(text).not.toContain("PRIVATE_SYNTHETIC_FINANCE_UI_SENTINEL"); expect(text).not.toContain("99999999");
  await accessible(page);
});
test("finance scenario keyboard snapshot exposes exact persisted cost and withholds it after personnel deactivation", async ({ page }) => {
  test.setTimeout(120_000); await resetStaffingFixtureRates();
  const f = await withTransaction(async db => {
    const ledger = await createConfirmedAllocationLedgerFixture(db);
    const customerId = (await db.query("SELECT customer_id FROM staffing_allocations WHERE id=$1", [ledger.allocation.allocationId])).rows[0].customer_id as string;
    const end = new Date(Date.parse(ledger.firstDate) + 86_400_000).toISOString().slice(0, 10);
    await createFinanceInput(ledger.actor, { requestKey: randomUUID(), rationale: "Synthetic scenario UI cost", provenance: "PRIVATE_SYNTHETIC_SCENARIO_UI_PROVENANCE",
      input: { kind: "rate", rateKind: "loaded_cost", resourceId: ledger.resource.resourceId!, currency: "USD", fromDate: ledger.firstDate, toDate: end, minorUnitsPerHour: "1500" } }, db);
    return { ...ledger, customerId };
  });
  // Seeded-ledger UI projection only; complete trusted journey is a separate gate.
  await signIn(page, "mcteer"); await page.goto("/staffing/finance");
  const customer = page.getByLabel("Scenario customer", { exact: true }); await expect(customer).toBeEnabled();
  const choices = await page.request.get("/api/customers?limit=50");
  expect(choices.status()).toBe(200);
  expect((await choices.json()).data.items.some((item: { id: string }) => item.id === f.customerId)).toBe(true);
  await expect.poll(() => customer.locator("option").count()).toBeGreaterThan(1);
  for (let i = 0; i < 100 && !await customer.locator(`option[value="${f.customerId}"]`).count(); i++) {
    const count = await customer.locator("option").count(); await page.getByRole("button", { name: "More scenario customer choices", exact: true }).click();
    await expect.poll(() => customer.locator("option").count()).toBeGreaterThan(count);
  }
  await customer.selectOption(f.customerId);
  const engagement = page.getByLabel("Scenario engagement", { exact: true });
  const engagementId = (await withTransaction(db => db.query("SELECT engagement_id FROM staffing_demands WHERE id=$1", [f.demand.demandId]))).rows[0].engagement_id as string;
  await expect(engagement.locator(`option[value="${engagementId}"]`)).toHaveCount(1); await engagement.selectOption(engagementId);
  await page.getByLabel("Scenario currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Scenario first date", { exact: true }).fill(f.firstDate);
  await page.getByLabel("Scenario last date (inclusive)", { exact: true }).fill(f.firstDate);
  await page.getByLabel("Scenario rationale", { exact: true }).fill("Synthetic keyboard immutable snapshot");
  const committed = page.waitForResponse(response => response.url().endsWith("/api/staffing/finance/scenarios") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create planning scenario", exact: true }).focus(); await page.keyboard.press("Enter");
  const response = await committed; expect(response.status()).toBe(200); const created = (await response.json()).data;
  const snapshot = page.locator("article").filter({ has: page.getByRole("heading", { name: `Scenario ${created.scenarioId}`, exact: true }) });
  await expect(snapshot.getByText("$30.00", { exact: true })).toBeVisible();
  await expect(snapshot.getByText("Incomplete: missing revenue, missing nonlabor", { exact: true })).toBeVisible();
  await snapshot.getByText("Exact grouped calculation inputs", { exact: true }).click();
  await expect(snapshot.getByText(/120 minutes × 1500 \/ 60 = 3000 minor units after rounding/)).toBeVisible();
  await expect(page.getByText("PRIVATE_SYNTHETIC_SCENARIO_UI_PROVENANCE", { exact: false })).toHaveCount(0);
  await accessible(page);
  const path = `**/api/staffing/finance/scenarios/${created.scenarioId}`;
  let releaseOld = () => {}, captured = () => {}, first = true;
  const gate = new Promise<void>(resolve => { releaseOld = resolve; });
  const capturedResponse = new Promise<void>(resolve => { captured = resolve; });
  await page.route(path, async route => {
    if (!first) { await route.continue(); return; }
    first = false;
    // Real authorized response delayed in transport; no fabricated domain result.
    const response = await route.fetch(); expect(response.status()).toBe(200);
    expect((await response.json()).data.contentAvailability).toBe("readable");
    captured(); await gate; await route.fulfill({ response });
  });
  try {
    await capturedResponse;
    await withTransaction(db => db.query("UPDATE workforce_resources SET active=false WHERE id=$1", [f.resource.resourceId]));
    await expect(snapshot.getByText("Scenario content is withheld or unavailable.", { exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(snapshot.getByText("$30.00", { exact: true })).toHaveCount(0);
    const released = page.waitForResponse(async response => response.url().endsWith(`/api/staffing/finance/scenarios/${created.scenarioId}`) &&
      (await response.json()).data.contentAvailability === "readable");
    releaseOld(); await released;
    await expect(snapshot.getByText("Scenario content is withheld or unavailable.", { exact: true })).toBeVisible();
    await expect(snapshot.getByText("$30.00", { exact: true })).toHaveCount(0);
  } finally { releaseOld(); await page.unroute(path); }
  const current = await page.request.get(`/api/staffing/finance/scenarios/${created.scenarioId}`);
  expect(current.status()).toBe(200); expect((await current.json()).data).toMatchObject({ contentAvailability: "withheld", content: null });
});
