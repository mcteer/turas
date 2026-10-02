import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { withTransaction, query } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createDemand, qualifyDemand, readDemand } from "../../lib/server/staffing/demands";
import { staffingExact, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { reviseSkill } from "../../lib/server/staffing/skills";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

test.beforeEach(() => {
  requireOwnedStaffingClone();
  if (process.env.TURAS_STAFFING_NATIVE_FIXTURE_READY !== "1") throw new Error("Use the bounded owned native staffing UI runner");
});
async function fixture() {
  await resetStaffingFixtureRates();
  return withTransaction(async db => {
    const f = await createSyntheticDemandBaseline(db);
    const created = await createDemand(f.actor, { requestKey: randomUUID(), rationale: "Synthetic native UI demand", demand: f.demand }, db);
    await qualifyDemand(f.actor, created.demandId, { ...staffingExact(created), requestKey: randomUUID(), rationale: "Synthetic native UI exact qualification" }, db);
    return { ...f, demand: await readDemand(f.actor, created.demandId, db) };
  });
}
async function open(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await signIn(page, "panel");
  await page.goto(`/customers/${f.demand.customerId}/engagements/${f.demand.engagementId}/staffing`);
  await page.getByRole("button", { name: /Open demand 1/ }).click();
  return page.getByRole("region", { name: "Turi staffing explanation" });
}
async function accessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test("operational keyboard explanation uses real native transport and removes already displayed output after skill withdrawal", async ({ page }, info) => {
  test.setTimeout(120_000);
  const f = await fixture(), advisory = await open(page, f);
  await expect(advisory.getByLabel("Explanation mode").getByRole("option", { name: "Finance planning" })).toHaveCount(0);
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/eve\/v1\/session\/wrun_[^/]+$/.test(new URL(request.url()).pathname)) posts.push(request.url()); });
  const prepared = page.waitForResponse(response => response.url().endsWith("/api/staffing/advisory") && response.request().method() === "POST");
  await advisory.getByRole("button", { name: "Ask Turi to explain" }).focus(); await page.keyboard.press("Enter");
  const result = (await (await prepared).json()).data;
  await expect(advisory.getByText("Synthetic governed staffing explanation.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(advisory.getByText(/Reported input tokens: 22/)).toBeVisible(); expect(posts).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Compare resources", exact: true })).toBeEnabled();
  await accessible(page);
  await sanitizedScreenshot(page, `local-artifacts/007/advisory-${info.project.name}.png`);
  const skillId = f.demand.demand!.requiredSkills[0].skillId;
  const skill = (await query(`SELECT s.skill_key,s.current_revision_id,s.aggregate_version,p.name,p.definition,v.content_digest
    FROM workforce_skills s JOIN workforce_skill_payloads p ON p.revision_id=s.current_revision_id
    JOIN workforce_skill_revisions v ON v.id=s.current_revision_id WHERE s.id=$1`, [skillId])).rows[0];
  await reviseSkill(f.actor, skillId, { requestKey: randomUUID(), rationale: "Synthetic UI native current skill withdrawal", revisionId: skill.current_revision_id,
    contentDigest: skill.content_digest, expectedAggregateVersion: Number(skill.aggregate_version),
    skill: { key: skill.skill_key, name: skill.name, definition: skill.definition, state: "retired" } });
  await advisory.getByRole("button", { name: "Check saved status" }).click();
  await expect(advisory.getByText("Synthetic governed staffing explanation.", { exact: false })).toHaveCount(0);
  await expect(advisory.getByText(/output is withheld/)).toBeVisible(); expect(posts).toHaveLength(1);
  const read = await page.request.get(`/api/conversations/${result.conversationId}`);
  expect(read.status()).toBe(409); expect((await read.text()).includes("Synthetic governed staffing explanation")).toBe(false);
});
test("lost preparation acknowledgement reconciles exactly without dispatch, then one explicit send and durable stop", async ({ page }) => {
  test.setTimeout(120_000);
  const f = await fixture(), advisory = await open(page, f);
  let dropped = false, nativePosts = 0;
  page.on("request", request => { if (request.method() === "POST" && /\/eve\/v1\/session\/wrun_[^/]+$/.test(new URL(request.url()).pathname)) nativePosts++; });
  await page.route("**/api/staffing/advisory", async route => {
    if (route.request().method() !== "POST" || dropped) return route.continue();
    const committed = await route.fetch(); expect(committed.status()).toBe(200); dropped = true;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic lost preparation acknowledgement" } }) });
  });
  await advisory.getByRole("button", { name: "Ask Turi to explain" }).click();
  await expect(advisory.getByRole("button", { name: "Check preparation" })).toBeVisible(); expect(nativePosts).toBe(0);
  const replay = page.waitForResponse(response => response.url().endsWith("/api/staffing/advisory") && response.request().method() === "POST");
  await advisory.getByRole("button", { name: "Check preparation" }).click();
  const reserved = (await (await replay).json()).data;
  await query("INSERT INTO staffing_native_fixture_barriers(advisory_attempt_id) VALUES($1)", [reserved.attemptId]);
  await expect(advisory.getByRole("button", { name: "Send prepared explanation" })).toBeVisible(); expect(nativePosts).toBe(0);
  await advisory.getByRole("button", { name: "Send prepared explanation" }).focus(); await page.keyboard.press("Enter");
  await expect.poll(async () => (await query(`SELECT count(*)::int AS n FROM staffing_native_fixture_calls p
    JOIN staffing_advisory_attempts a ON a.response_attempt_id=p.response_attempt_id
    WHERE a.id=$1 AND p.step_index=1 AND p.responded_at IS NOT NULL`, [reserved.attemptId])).rows[0].n, { timeout: 60_000 }).toBe(1);
  const stopping = page.waitForResponse(response => response.url().endsWith(`/api/staffing/advisory/${reserved.attemptId}/cancel`) && response.request().method() === "POST");
  await advisory.getByRole("button", { name: "Stop explanation" }).focus(); await page.keyboard.press("Enter");
  expect((await stopping).status()).toBe(200);
  await query("UPDATE staffing_native_fixture_barriers SET released=true WHERE advisory_attempt_id=$1", [reserved.attemptId]);
  await expect(advisory.getByText("cancelled", { exact: true })).toBeVisible(); expect(nativePosts).toBe(1);
  await expect(advisory.getByText("Synthetic governed staffing explanation.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare resources", exact: true })).toBeEnabled();
  expect((await query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(0);
  await accessible(page);
});
