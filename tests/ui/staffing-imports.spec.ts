import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource, syntheticSkill } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { createSkill } from "../../lib/server/staffing/skills";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { sanitizedScreenshot, signIn } from "../fixtures/ui";
import { resetStaffingFixtureRates } from "../fixtures/staffing/allocations";

const evidenceSentinel = "SYNTHETIC_PRIVATE_WORKFORCE_EVIDENCE";
test.beforeEach(async () => {
  requireOwnedStaffingClone();
  if (process.env.TURAS_STAFFING_FIXTURE_READY !== "1") throw new Error("Use the owned staffing UI runner");
  await resetStaffingFixtureRates();
});
async function reviewedResource() {
  return withTransaction(async db => {
    const manager = await createProfileTestSession(db, "mcteer");
    const resource = await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic UI registry",
      resource: { ...syntheticResource(), displayName: `Synthetic UI resource ${randomUUID().slice(0, 8)}` } }, db);
    const skill = await createSkill(manager, { requestKey: randomUUID(), rationale: "Synthetic UI taxonomy", skill: syntheticSkill() }, db);
    const candidate = await createManualAssessment(manager, { requestKey: randomUUID(), rationale: "Synthetic UI observation",
      resourceId: resource.resourceId, skillId: skill.skillId, level: 2, assessmentDate: "2026-09-29",
      nextReviewDate: "2026-12-28", evidence: evidenceSentinel }, db);
    await decideCompetencies(manager, { requestKey: randomUUID(), rows: [{ competencyId: candidate.competencyId,
      candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest, sourceGeneration: 1,
      expectedAggregateVersion: candidate.aggregateVersion, action: "accept", rationale: "Synthetic exact UI acceptance" }] }, db);
    if (!resource.resourceId) throw new Error("Synthetic resource identity missing");
    return { ...resource, resourceId: resource.resourceId };
  });
}
async function accessible(page: Parameters<typeof signIn>[0]) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("operational resource responses and DOM exclude manager evidence", async ({ page }, info) => {
  test.setTimeout(90_000);
  const resource = await reviewedResource();
  await signIn(page, "panel");
  const response = page.waitForResponse(response => response.url().includes(`/api/staffing/resources/${resource.resourceId}`) && response.request().method() === "GET");
  await page.goto(`/staffing/resources/${resource.resourceId}`);
  await expect(page.getByRole("heading", { name: "Current Approved Competencies" })).toBeVisible();
  const payload = await (await response).text();
  for (const field of [evidenceSentinel, "evidence", "locators", "filename", "rationale", "minorUnitsPerHour"]) expect(payload).not.toContain(field);
  await expect(page.getByText(evidenceSentinel)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Manager Evidence And Review" })).toHaveCount(0);
  await accessible(page);
  mkdirSync("local-artifacts/007", { recursive: true });
  await sanitizedScreenshot(page, `local-artifacts/007/operational-resource-${info.project.name}.png`);
});

test("manager can propose dated evidence using keyboard and reject its exact revision", async ({ page }) => {
  test.setTimeout(120_000);
  const resource = await reviewedResource();
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${resource.resourceId}`);
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Propose A Dated Assessment" }) });
  const skill = await withTransaction(async db => (await db.query("SELECT skill_id FROM workforce_competencies WHERE resource_id=$1", [resource.resourceId])).rows[0].skill_id as string);
  await form.getByLabel("Canonical skill ID").fill(skill);
  await form.getByLabel("Level", { exact: true }).selectOption("3");
  await form.getByLabel("Assessment date", { exact: true }).fill("2026-09-29");
  await form.getByLabel("Next review date", { exact: true }).fill("2026-12-28");
  await form.getByLabel("Evidence", { exact: true }).fill("Synthetic pending corrected observation");
  await form.getByLabel("Rationale", { exact: true }).fill("Synthetic accountable correction");
  await form.getByRole("button", { name: "Save pending assessment" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Saved", { timeout: 20_000 });
  const candidate = page.locator("article").filter({ hasText: "Synthetic pending corrected observation" });
  await expect(candidate).toBeVisible(); await candidate.getByRole("checkbox").focus(); await page.keyboard.press("Space");
  await page.getByLabel("Decision rationale", { exact: true }).fill("Synthetic exact rejection preserves prior accepted level");
  await page.getByRole("button", { name: "Reject selected", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(candidate).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(evidenceSentinel, { exact: true })).toBeVisible();
  await accessible(page);
});

test("intake rejects oversized files before starting a source", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "mcteer"); await page.goto("/staffing/imports");
  const file = page.getByLabel("Single CSV or XLSX original");
  await file.setInputFiles({ name: "synthetic-too-large.csv", mimeType: "text/csv", buffer: Buffer.alloc(10_485_761) });
  await expect(page.getByRole("status")).toContainText("at most 10 MiB");
  await expect(page.getByRole("button", { name: "Start intake" })).toBeDisabled();
  await accessible(page);
});

test("unconfirmed browser saves reconcile receipts without a second mutation", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "mcteer"); await page.goto("/staffing/resources");
  let mutations = 0;
  // Transport fault only. The real authorized domain commit still executes.
  await page.route("**/api/staffing/skills", async route => {
    if (route.request().method() !== "POST") return route.continue();
    mutations++; const committed = await route.fetch(); expect(committed.status()).toBe(200); await route.abort("failed");
  });
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add A Skill", exact: true }) });
  await form.getByLabel("Canonical key").fill(`ui_${randomUUID().replaceAll("-", "")}`);
  await form.getByLabel("Name", { exact: true }).fill("Synthetic uncertain skill");
  await form.getByLabel("Definition").fill("Synthetic explicit taxonomy definition");
  await form.getByLabel("Rationale").fill("Synthetic uncertain transport test");
  await form.getByRole("button", { name: "Add skill", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "unconfirmed" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Add skill", exact: true })).toBeDisabled();
  await form.getByLabel("Name", { exact: true }).fill("Synthetic unsaved newer name");
  await page.getByRole("button", { name: "Check save receipt" }).click();
  await expect(page.getByText("Save confirmed.", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Synthetic unsaved newer name");
  expect(mutations).toBe(1); await accessible(page);
});

test("actual scanned CSV mapping and exact row approval are keyboard accessible", async ({ page }, info) => {
  test.setTimeout(240_000);
  const resource = await reviewedResource();
  const skillId = await withTransaction(async db => (await db.query("SELECT skill_id FROM workforce_competencies WHERE resource_id=$1", [resource.resourceId])).rows[0].skill_id as string);
  await signIn(page, "mcteer"); await page.goto("/staffing/imports");
  await page.getByLabel("Single CSV or XLSX original").setInputFiles({ name: "synthetic-workforce-ui.csv", mimeType: "text/csv",
    buffer: Buffer.from("resource,skill,level,assessment,review,evidence\nexact-resource,exact-skill,3,2026-09-29,2026-12-28,Synthetic imported keyboard evidence\n") });
  const start = page.getByRole("button", { name: "Start intake", exact: true }); await expect(start).toBeEnabled();
  await start.focus(); await page.keyboard.press("Enter");
  const upload = page.getByRole("button", { name: "Upload original", exact: true }); await expect(upload).toBeVisible({ timeout: 20_000 });
  await upload.focus(); await page.keyboard.press("Enter");
  const complete = page.getByRole("button", { name: "Complete intake and scan", exact: true }); await expect(complete).toBeEnabled({ timeout: 20_000 });
  await complete.focus(); await page.keyboard.press("Enter");
  await expect(complete).toHaveCount(0, { timeout: 20_000 }); await page.getByRole("link", { name: "Review Or Cancel Intake" }).click();
  await expect.poll(async () => {
    await page.getByRole("button", { name: "Reload status", exact: true }).click();
    return page.getByText("Complete extraction; explicit mapping and approval required.", { exact: true }).isVisible();
  }, { timeout: 120_000, intervals: [1000, 2000, 5000] }).toBe(true);
  await page.getByRole("checkbox", { name: /CSV · visible/ }).focus(); await page.keyboard.press("Space");
  const mapping = page.locator("form").filter({ has: page.getByRole("heading", { name: "Explicit Table Mapping" }) });
  for (const identity of [{ kind: "resources", value: "exact-resource", id: resource.resourceId }, { kind: "skills", value: "exact-skill", id: skillId }]) {
    await mapping.getByRole("button", { name: "Add exact identity" }).click();
    const block = mapping.locator("fieldset").filter({ has: page.getByLabel("Exact original value", { exact: true }) }).last();
    await block.getByLabel("Kind", { exact: true }).selectOption(identity.kind);
    await block.getByLabel("Exact original value", { exact: true }).fill(identity.value);
    await block.getByLabel("Canonical identity ID", { exact: true }).fill(identity.id);
  }
  await mapping.getByRole("button", { name: "Save exact mapping" }).focus(); await page.keyboard.press("Enter");
  const candidate = page.locator("article").filter({ has: page.getByRole("checkbox", { name: "Select this exact candidate" }) });
  await expect(candidate).toHaveCount(1, { timeout: 20_000 });
  await candidate.getByRole("checkbox").focus(); await page.keyboard.press("Space");
  await page.getByLabel("Review rationale", { exact: true }).fill("Synthetic exact import approval preserves all cell locators");
  await page.getByRole("button", { name: "Accept selected exact candidates" }).focus(); await page.keyboard.press("Enter");
  await expect(candidate).toHaveCount(0, { timeout: 20_000 });
  await accessible(page);
  await sanitizedScreenshot(page, `local-artifacts/007/import-review-${info.project.name}.png`);
  await page.goto(`/staffing/resources/${resource.resourceId}`);
  await expect(page.getByText("Synthetic imported keyboard evidence", { exact: true })).toBeVisible();
});


test("restricted accounts receive no intake controls or personnel payload", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "panel"); await page.goto("/staffing/imports");
  await expect(page.getByRole("heading", { name: "Staffing Unavailable" })).toBeVisible();
  await expect(page.getByLabel("Single CSV or XLSX original")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Workforce Imports", exact: true })).toHaveCount(0);
  const response = await page.request.get("/api/staffing/imports");
  expect(response.status()).toBe(403); expect(await response.text()).not.toContain(evidenceSentinel);
  await accessible(page);
});


test("manual source withdrawal immediately withholds evidence and preserves revision history", async ({ page }) => {
  test.setTimeout(90_000);
  const resource = await reviewedResource();
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${resource.resourceId}`);
  await expect(page.getByText(evidenceSentinel, { exact: true })).toBeVisible();
  // Hold an actual eligible history response across the subsequent withdrawal.
  // The delayed response must not restore evidence after the refreshed fence.
  let releaseHistory!: () => void, capturedHistory!: () => void;
  const held = new Promise<void>(resolve => { releaseHistory = resolve; });
  const captured = new Promise<void>(resolve => { capturedHistory = resolve; });
  let firstHistory = true;
  const historyPattern = /\/api\/staffing\/competencies\/[^/]+\/revisions(?:\?.*)?$/;
  await page.route(historyPattern, async route => {
    if (!firstHistory) { await route.continue(); return; }
    firstHistory = false;
    const actual = await route.fetch(), body = await actual.body();
    expect(body.toString()).toContain(evidenceSentinel);
    capturedHistory(); await held; await route.fulfill({ response: actual, body });
  });
  await page.getByRole("button", { name: "View revision history" }).click();
  await captured;
  await page.getByLabel("Decision rationale", { exact: true }).fill("Synthetic manual-source withdrawal");
  await page.getByRole("button", { name: "Withdraw this manual evidence source" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText(evidenceSentinel, { exact: true })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Evidence unavailable because its source or resource eligibility changed.", { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse(response => historyPattern.test(new URL(response.url()).pathname));
  releaseHistory(); await oldResponse; await page.unroute(historyPattern);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("heading", { name: "Revision History", exact: true })).toHaveCount(0);
  await expect(page.getByText(evidenceSentinel)).toHaveCount(0);
  await page.getByRole("button", { name: "View revision history" }).click();
  await expect(page.getByRole("heading", { name: "Revision History" })).toBeVisible();
  await expect(page.getByText(/Evidence withheld/)).toBeVisible();
  await expect(page.getByText(evidenceSentinel, { exact: true })).toHaveCount(0);
  await accessible(page);
});

test("manager resource revisions and exact competency corrections preserve approved history", async ({ page }) => {
  test.setTimeout(120_000);
  const resource = await reviewedResource();
  await signIn(page, "mcteer"); await page.goto(`/staffing/resources/${resource.resourceId}`);
  await page.getByRole("button", { name: "Revise resource", exact: true }).click();
  const registry = page.locator("form").filter({ has: page.getByRole("heading", { name: "Revise Resource", exact: true }) });
  await registry.getByLabel("Display name", { exact: true }).fill("Synthetic revised resource");
  await registry.getByLabel("Region code", { exact: true }).fill("us-west");
  await registry.getByLabel("Revision rationale", { exact: true }).fill("Synthetic exact registry revision");
  await registry.getByRole("button", { name: "Save resource revision" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Synthetic revised resource", exact: true })).toBeVisible({ timeout: 20_000 });
  const approved = page.locator("article").filter({ hasText: evidenceSentinel });
  await approved.getByRole("button", { name: "Correct this assessment" }).click();
  const correction = approved.locator("form");
  await correction.getByLabel("Corrected level").selectOption("3");
  await correction.getByLabel("Corrected evidence", { exact: true }).fill("Synthetic pending revision from exact accepted evidence");
  await correction.getByLabel("Correction rationale").fill("Synthetic accountable literal correction");
  await correction.getByRole("button", { name: "Save pending correction" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic pending revision from exact accepted evidence", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(evidenceSentinel, { exact: true })).toBeVisible();
  const accepted = await page.request.get(`/api/staffing/resources/${resource.resourceId}`);
  expect(accepted.ok()).toBe(true);
  const projection = await accepted.json(); expect(projection.data.skills).toEqual(expect.arrayContaining([expect.objectContaining({ level: 2 })]));
  await accessible(page);
});
