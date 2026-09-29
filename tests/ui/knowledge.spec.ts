import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("shared library and private contribution controls remain accessible",async ({ page },testInfo) => {
  await signIn(page,"mcteer");
  await page.goto("/knowledge");
  await expect(page.getByRole("heading",{ name: "Shared knowledge",exact: true })).toBeVisible();
  await expect(page.getByRole("heading",{ name: "Contributions" })).toBeVisible();
  await expect(page.getByRole("heading",{ name: "Publication impact" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "cleanup jobs pending" }))
    .toBeVisible();
  await page.getByRole("button",{ name: "New contribution" }).click();
  await expect(page.getByLabel("Source customer")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  mkdirSync("local-artifacts/005",{ recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/005/knowledge-${testInfo.project.name}.png`);
});

test("published detail rechecks access and hides withdrawn content",async ({ page }) => {
  await signIn(page,"mcteer");
  const id = "a11a0000-0000-4000-8000-000000000005";
  const entry = { version: "knowledge-v1",id,revision: 1,
    payload: { title: "Synthetic build guidance",productVersion: "2026.9",
      problem: "Builds take too long",prerequisites: "A supported pipeline",
      solution: "Measure stages",reasoning: "Compare timings",
      applicability: "Public builds",limitations: "Check version",
      validation: "Review timings" },
    quality: { Q: 70,band: "usable",rationale: "Synthetic review" },
    publishedAt: "2026-09-28T12:00:00Z",caveats: [] };
  let available = true;
  await page.route("**/api/knowledge",(route) => route.fulfill({ status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { entries: [entry],nextCursor: null } }) }));
  await page.route(`**/api/knowledge/${id}`,(route) => route.fulfill({
    status: available ? 200 : 404,contentType: "application/json",
    body: JSON.stringify(available ? { data: entry } : { error: { message: "Unavailable" } }),
  }));
  await page.goto("/knowledge");
  await page.getByRole("button",{ name: "Read guidance" }).click();
  await expect(page.getByRole("region",{ name: "Shared guidance detail" }))
    .toContainText("Measure stages");
  available = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert").filter({ hasText: "no longer available" }))
    .toBeVisible();
  await expect(page.getByRole("region",{ name: "Shared guidance detail" })).toHaveCount(0);
});

test("administrator publication review requires every check and a reason by keyboard",async ({ page },testInfo) => {
  await signIn(page,"mcteer");
  const id = randomUUID();
  const payload = { title: "Synthetic timing guidance",productVersion: "2026.9",
    problem: "Builds may be slow",prerequisites: "A supported pipeline",
    solution: "Measure build stages",reasoning: "Stage timing isolates bottlenecks",
    applicability: "Build pipelines",limitations: "Validate each workload",
    validation: "Compare durations" };
  const candidate = { id,customerId: randomUUID(),state: "submitted",revision: 1,
    digest: "a".repeat(64),payload,publication: null };
  let posted: Record<string,unknown> | null = null;
  await page.route("**/api/knowledge/contributions",async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: [candidate] }) }));
  await page.route(`**/api/knowledge/contributions/${id}/lineage`,async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: [{
      sourceKind: "accepted_profile",sourceRevisionId: randomUUID(),
      sourceGeneration: 1,sourceDigest: "b".repeat(64),rightsBasis: "Synthetic reuse"
    }] }) }));
  await page.route(`**/api/knowledge/contributions/${id}/decisions`,async (route) => {
    posted = route.request().postDataJSON() as Record<string,unknown>;
    await route.fulfill({ status: 200,contentType: "application/json",
      body: JSON.stringify({ data: { action: "publish" } }) });
  });
  await page.goto("/knowledge");
  await page.getByRole("button",{ name: "Synthetic timing guidance · submitted" }).click();
  const review = page.locator(".knowledge-review");
  await expect(review).toBeVisible();
  const publish = review.getByRole("button",{ name: "Attest rights and publish" });
  await publish.focus();
  await publish.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Explain the decision" }))
    .toBeVisible();
  await review.getByLabel("Decision rationale").fill("Only generic build timing remains");
  await publish.focus();
  await publish.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Complete every sanitization check" }))
    .toBeVisible();
  for (const checkbox of await review.getByRole("checkbox").all()) {
    await checkbox.focus();
    await checkbox.press("Space");
  }
  await publish.focus();
  await publish.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Published shared guidance" }))
    .toBeVisible();
  expect(posted).toMatchObject({ action: "publish",expectedRevision: 1,
    expectedDigest: "a".repeat(64),rightsAttested: true,
    sanitizationRationale: "Only generic build timing remains",
    checklist: { namesAndDomainsRemoved: true,repositoriesAndLinksRemoved: true,
      peopleAndCommercialDetailsRemoved: true,
      identifyingConfigurationAndOutcomesRemoved: true,
      countsAndCombinedInferenceReviewed: true } });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  mkdirSync("local-artifacts/005",{ recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/005/knowledge-review-${testInfo.project.name}.png`);
});
