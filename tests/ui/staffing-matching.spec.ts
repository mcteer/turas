import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createDemand, reviseDemand, readDemand } from "../../lib/server/staffing/demands";
import { signIn } from "../fixtures/ui";
import { createProfileTestSession } from "../fixtures/profiles";
import { createResource } from "../../lib/server/staffing/resources";
import { syntheticResource } from "../fixtures/staffing/seed";
import { approveCalendar } from "../../lib/server/staffing/calendars";
import { hashSessionToken, sessionCookieName } from "../../lib/server/auth/sessions";
import { resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
test.beforeEach(async () => {
  requireOwnedStaffingClone(); if (process.env.TURAS_STAFFING_FIXTURE_READY !== "1") throw new Error("Use the owned staffing UI runner");
  await resetStaffingFixtureRates();
});
test("a delayed readable demand selection cannot return after a newer real session denial", async ({ page }) => {
  test.setTimeout(120_000);
  const title = "PRIVATE_SYNTHETIC_REVOKED_DEMAND_SELECTION";
  const f = await withTransaction(async db => {
    const baseline = await createSyntheticDemandBaseline(db);
    const demand = await createDemand(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic demand selection race",
      demand: { ...baseline.demand, title } }, db);
    return { baseline, demand };
  });
  await signIn(page, "mcteer");
  await page.goto(`/customers/${f.baseline.demand.customerId}/engagements/${f.baseline.demand.engagementId}/staffing`);
  const open = page.getByRole("button", { name: /Open demand 1/ });
  await expect(open).toBeEnabled();
  let release!: () => void, captured!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route(`**/api/staffing/demands/${f.demand.demandId}`, async route => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true; const actual = await route.fetch(); expect(actual.status()).toBe(200);
    expect((await actual.json()).data.demand.title).toBe(title);
    captured(); await released; await route.fulfill({ response: actual });
  });
  try {
    await open.click(); await ready;
    const cookie = (await page.context().cookies()).find(cookie => cookie.name === sessionCookieName());
    if (!cookie) throw new Error("Owned browser session identity missing");
    await withTransaction(async db => {
      expect((await db.query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 RETURNING id", [hashSessionToken(cookie.value)])).rowCount).toBe(1);
    });
    const denied = page.waitForResponse(response => response.url().endsWith(`/api/staffing/demands/${f.demand.demandId}`) && response.status() === 401);
    await open.click(); await denied;
    await expect(page.getByText("Demand unavailable. Reload current context.", { exact: true })).toBeVisible();
    const delivered = page.waitForResponse(response => response.url().endsWith(`/api/staffing/demands/${f.demand.demandId}`) && response.status() === 200);
    release(); await delivered;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await expect(page.getByText("Demand unavailable. Reload current context.", { exact: true })).toBeVisible();
  } finally { release(); }
});
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test("operational keyboard demand creation and exact qualification retain accepted work-package binding", async ({ page }) => {
  test.setTimeout(120_000); const f = await withTransaction(createSyntheticDemandBaseline);
  await signIn(page, "panel"); await page.goto(`/customers/${f.demand.customerId}/engagements/${f.demand.engagementId}/staffing`);
  await page.getByRole("button", { name: "Create demand", exact: true }).focus(); await page.keyboard.press("Enter");
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create demand", exact: true }) });
  await form.getByLabel("Work package", { exact: true }).selectOption(f.demand.workPackageKey);
  await form.getByLabel("Demand title", { exact: true }).fill("Synthetic keyboard staffing request");
  await form.getByLabel("Delivery role", { exact: true }).fill("Synthetic delivery lead");
  await form.getByLabel("First resource-local service date").fill("2026-10-01");
  await form.getByLabel("Last resource-local service date").fill("2026-10-02");
  await form.getByLabel("Required minutes on 2026-10-01").fill("120");
  await form.getByLabel("Required minutes on 2026-10-02").fill("0");
  await form.getByLabel("Require a separately zoned overlap window", { exact: true }).check();
  await form.getByLabel("Overlap timezone", { exact: true }).fill("Europe/London");
  await form.getByLabel("Minimum overlap minutes", { exact: true }).fill("60");
  await form.getByLabel("Overlap start on 2026-10-01", { exact: true }).fill("2026-10-01T09:00");
  await form.getByLabel("Overlap end on 2026-10-01", { exact: true }).fill("2026-10-01T11:00");
  await form.getByRole("button", { name: "Add required skill", exact: true }).focus(); await page.keyboard.press("Enter");
  const skill = form.getByLabel("Required skill 1", { exact: true });
  for (let i = 0; i < 20 && !await skill.locator(`option[value="${f.demand.requiredSkills[0].skillId}"]`).count(); i++) {
    const count = await skill.locator("option").count();
    const response = page.waitForResponse(response => response.url().includes("/api/staffing/skills?") && response.request().method() === "GET");
    await page.getByRole("button", { name: "More skill choices" }).click();
    await response;
    await expect.poll(() => skill.locator("option").count()).toBeGreaterThan(count);
  }
  await skill.selectOption(f.demand.requiredSkills[0].skillId);
  await form.getByLabel("Minimum level for required skill 1").selectOption("2");
  await form.getByLabel("Rationale", { exact: true }).fill("Synthetic exact UI demand");
  const savedResponse = page.waitForResponse(response => response.url().endsWith("/api/staffing/demands") && response.request().method() === "POST");
  await form.getByRole("button", { name: "Save demand draft" }).focus(); await page.keyboard.press("Enter");
  const saved = (await (await savedResponse).json()).data; expect(saved.state).toBe("draft");
  await page.locator(`button[data-demand-id="${saved.demandId}"]`).click();
  const action = page.locator('form.evidence-search-form:visible').filter({ has: page.getByLabel("Demand action", { exact: true }) });
  await action.getByLabel("Demand action", { exact: true }).selectOption("qualify");
  await action.getByLabel("Action rationale").fill("Synthetic exact UI qualification");
  await action.getByRole("button", { name: "Apply demand action" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText("qualified · readable", { exact: true })).toBeVisible();
  const persisted = await withTransaction(db => readDemand(f.actor, saved.demandId, db));
  expect(persisted).toMatchObject({ baselineId: f.demand.baselineId, state: "qualified",
    demand: { workPackageKey: f.demand.workPackageKey, days: [{ date: "2026-10-01", requiredMinutes: 120 }],
      overlap: { timezone: "Europe/London", minimumOverlapMinutes: 60, windows: [{ date: "2026-10-01", from: "2026-10-01T09:00", to: "2026-10-01T11:00", fromOffset: null, toOffset: null }] } } });
  const comparisonResponse = page.waitForResponse(response => response.url().includes(`/api/staffing/demands/${saved.demandId}/matches?`) && response.request().method() === "GET");
  await page.getByRole("button", { name: "Compare resources", exact: true }).focus(); await page.keyboard.press("Enter");
  const comparison = (await (await comparisonResponse).json()).data;
  expect(comparison.formulaVersion).toBe("staffing-matching-v1");
  await expect(page.getByText(/comparison expires/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm allocation/ })).toHaveCount(0);
  await accessible(page);
});
test("open demand edits retain unsaved input and captured revision after an actual competing revision", async ({ page }) => {
  test.setTimeout(120_000); const f = await withTransaction(createSyntheticDemandBaseline);
  const created = await withTransaction(db => createDemand(f.actor, { requestKey: randomUUID(), rationale: "Synthetic stale UI draft", demand: f.demand }, db));
  await signIn(page, "panel"); await page.goto(`/customers/${f.demand.customerId}/engagements/${f.demand.engagementId}/staffing`);
  await page.getByRole("button", { name: /Open demand 1/ }).click(); await page.getByRole("button", { name: "Revise demand", exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Revise demand", exact: true }) });
  await form.getByLabel("Demand title", { exact: true }).fill("Synthetic retained unsaved title");
  await form.getByLabel("Rationale", { exact: true }).fill("Synthetic retained change rationale");
  await withTransaction(db => reviseDemand(f.actor, created.demandId, { requestKey: randomUUID(), rationale: "Synthetic concurrent draft",
    revisionId: created.revisionId, contentDigest: created.contentDigest, expectedAggregateVersion: created.aggregateVersion,
    demand: { ...f.demand, title: "Synthetic competing current title" } }, db));
  await page.getByRole("button", { name: "Reload staffing context" }).click();
  await expect(form.getByText("This demand changed. Your inputs still use the revision opened for editing.")).toBeVisible();
  await expect(form.getByLabel("Demand title", { exact: true })).toHaveValue("Synthetic retained unsaved title");
  const failedResponse = page.waitForResponse(response => response.url().includes(`/api/staffing/demands/${created.demandId}`) && response.request().method() === "PATCH");
  await form.getByRole("button", { name: "Save demand draft" }).click(); expect((await failedResponse).status()).toBe(409);
  await expect(form.getByLabel("Rationale", { exact: true })).toHaveValue("Synthetic retained change rationale");
  expect((await withTransaction(db => readDemand(f.actor, created.demandId, db))).demand?.title).toBe("Synthetic competing current title");
  await accessible(page);
});
test("partner receives no demand editor or accepted staffing context", async ({ page }) => {
  const f = await withTransaction(createSyntheticDemandBaseline); await signIn(page, "partner");
  await page.goto(`/customers/${f.demand.customerId}/engagements/${f.demand.engagementId}/staffing`);
  await expect(page.getByText("Staffing access is not available for this account.")).toBeVisible();
  await expect(page.getByLabel("Demand title", { exact: true })).toHaveCount(0);
  const response = await page.request.get(`/api/staffing/engagements/${f.demand.engagementId}?customerId=${f.demand.customerId}`);
  expect(response.status()).toBe(403); const payload = await response.text();
  for (const field of [f.content.title, "workPackages", "baselineDigest"]) expect(payload).not.toContain(field);
});

test("manager approves explicit resource-local work and leave while operational readers receive totals", async ({ page }) => {
  test.setTimeout(120_000);
  const resource = await withTransaction(async db => createResource(await createProfileTestSession(db, "mcteer"),
    { requestKey: randomUUID(), rationale: "Synthetic calendar UI resource", resource: { ...syntheticResource(), timezone: "UTC" } }, db));
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${resource.resourceId}`);
  await page.getByLabel("Capacity from date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Capacity through date", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Read capacity", exact: true }).click();
  await expect(page.getByText(/2026-10-01 · approved capacity unknown/)).toBeVisible();
  await page.getByRole("button", { name: "Open exact calendar for approval" }).focus(); await page.keyboard.press("Enter");
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Calendar approval in UTC" }) });
  await form.getByLabel("Observation timestamp with UTC offset").fill(new Date().toISOString());
  await form.getByLabel("Next review timestamp with UTC offset").fill(new Date(Date.now() + 86_400_000).toISOString());
  await form.getByRole("button", { name: "Add contracted work interval" }).click();
  await form.getByLabel("Contracted work start", { exact: true }).fill("2026-10-01T09:00");
  await form.getByLabel("Contracted work end", { exact: true }).fill("2026-10-01T17:00");
  await form.getByRole("button", { name: "Add approved leave interval" }).click();
  await form.getByLabel("Approved leave start", { exact: true }).fill("2026-10-01T12:00");
  await form.getByLabel("Approved leave end", { exact: true }).fill("2026-10-01T13:00");
  await form.getByLabel("Approved leave category", { exact: true }).selectOption("annual_leave");
  await form.getByLabel("Calendar approval rationale").fill("Synthetic manager-only calendar rationale");
  const response = page.waitForResponse(response => response.url().endsWith(`/resources/${resource.resourceId}/calendar`) && response.request().method() === "POST");
  await form.getByRole("button", { name: "Approve exact calendar" }).focus(); await page.keyboard.press("Enter");
  expect((await response).status()).toBe(200);
  await expect(page.getByText(/available 420 minutes · confirmed 0 · remaining 420/)).toBeVisible();
  await accessible(page);
  await signIn(page, "panel"); await page.goto(`/staffing/resources/${resource.resourceId}`);
  await page.getByLabel("Capacity from date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Capacity through date", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Read capacity", exact: true }).click();
  await expect(page.getByText(/available 420 minutes/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open exact calendar for approval" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("Synthetic manager-only calendar rationale");
  const read = await page.request.get(`/api/staffing/resources/${resource.resourceId}/calendar?fromDate=2026-10-01&toDate=2026-10-01`);
  expect(read.status()).toBe(200);
  for (const privateField of ["annual_leave", "category", "manager", "rationale", "localStart"]) expect(await read.text()).not.toContain(privateField);
  await accessible(page);
});

test("calendar refresh retains dirty inputs and never rebases a captured approval", async ({ page }) => {
  test.setTimeout(120_000);
  const f = await withTransaction(async db => {
    const actor = await createProfileTestSession(db, "mcteer");
    const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic calendar conflict resource", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
    return { actor, resourceId: resource.resourceId! };
  });
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${f.resourceId}`);
  await page.getByLabel("Capacity from date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Capacity through date", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Read capacity", exact: true }).click();
  await page.getByRole("button", { name: "Open exact calendar for approval" }).click();
  await page.getByLabel("Calendar approval rationale").fill("Synthetic retained dirty calendar input");
  await approveCalendar(f.actor, f.resourceId, { requestKey: randomUUID(), rationale: "Synthetic competing zero capacity",
    calendar: { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
      fromDate: "2026-10-01", toDate: "2026-10-01", days: [{ date: "2026-10-01", contracted: [], holidays: [], leave: [], protected: [] }] } });
  await page.getByRole("button", { name: "Read capacity", exact: true }).click();
  await expect(page.getByText("The calendar head changed. Your inputs are retained; review the current revision before submitting.")).toBeVisible();
  await expect(page.getByLabel("Calendar approval rationale")).toHaveValue("Synthetic retained dirty calendar input");
  await expect(page.getByRole("button", { name: "Approve exact calendar" })).toBeDisabled();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Open exact calendar for approval" }).click();
  await expect(page.getByLabel("Calendar approval rationale")).toHaveValue("");
  await accessible(page);
});

test("calendar denial clears an open manager draft and a delayed prior eligible reply cannot restore it", async ({ page }) => {
  test.setTimeout(120_000);
  const f = await withTransaction(async db => {
    const actor = await createProfileTestSession(db, "mcteer");
    const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic calendar authority race",
      resource: { ...syntheticResource(), timezone: "UTC" } }, db);
    return { actor, resourceId: resource.resourceId! };
  });
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${f.resourceId}`);
  await page.getByLabel("Capacity from date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Capacity through date", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Read capacity", exact: true }).click();
  await page.getByRole("button", { name: "Open exact calendar for approval" }).click();
  const sentinel = "PRIVATE_SYNTHETIC_UNSAVED_CALENDAR_RATIONALE";
  await page.getByLabel("Calendar approval rationale").fill(sentinel);
  let release!: () => void, captured!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route(`**/api/staffing/resources/${f.resourceId}/calendar?*`, async route => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true; const actual = await route.fetch(); expect(actual.status()).toBe(200);
    captured(); await released; await route.fulfill({ response: actual });
  });
  try {
    await page.getByRole("button", { name: "Read capacity", exact: true }).click(); await ready;
    const cookie = (await page.context().cookies()).find(cookie => cookie.name === sessionCookieName());
    if (!cookie) throw new Error("Owned browser session identity missing");
    // Revoke the real browser login, not the separate fixture author's session.
    await withTransaction(async db => {
      const revoked = await db.query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 RETURNING id",
        [hashSessionToken(cookie.value)]);
      expect(revoked.rowCount).toBe(1);
    });
    const denied = page.waitForResponse(response => response.url().includes(`/resources/${f.resourceId}/calendar?`) && response.status() === 401);
    await page.getByRole("button", { name: "Read capacity", exact: true }).click(); await denied;
    await expect(page.getByLabel("Calendar approval rationale")).toHaveCount(0);
    const delivered = page.waitForResponse(response => response.url().includes(`/resources/${f.resourceId}/calendar?`) && response.status() === 200);
    release(); await delivered;
    await expect(page.getByLabel("Calendar approval rationale")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(sentinel);
  } finally { release(); }
});
