import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

const versionId = "70000000-0000-4000-8000-000000000004";
const candidateId = "70000000-0000-4000-8000-000000000005";

test("reviewer sees exact submitted excerpt and preserves rationale on stale review", async ({ page }, info) => {
  await signIn(page,"mcteer");
  const customer = DEMO_IDS.sharedCustomer;
  await page.route(`**/api/customers/${customer}/review`, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: {
      pending: [{ id: candidateId,recordId: "70000000-0000-4000-8000-000000000006",
        kind: "claim",payload: { kind: "claim",text: "Synthetic delivery observation" },
        acceptedPayload: null,recordVersion: 0,currentAcceptedRevisionId: null,
        contentDigest: "a".repeat(64),authorKind: "internal",
        authorMembershipId: DEMO_IDS.panelMembership,submissionChannel: "artifact_share",
        artifactSource: { versionId,selectionId: "70000000-0000-4000-8000-000000000007",
          excerpt: "Synthetic selected delivery passage",excerptDigest: "b".repeat(64),
          citation: { kind: "txt",lineStart: 2,lineEnd: 2 } },
        requestedAudience: "delivery",dataCategory: "delivery_context",qualityInput: {},
        quality: { Q: 25,band: "low",freshness: "unknown" },sourceReferences: [],
        createdAt: "2026-09-28T12:00:00.000Z",scopeLabel: "Customer",
        confirmedConflict: false,recentHistory: [] }],openRetractions: [],nextCursor: null } }) }));
  await page.route(`**/api/artifacts/${versionId}`, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: { id: versionId,
      displayName: "Synthetic review.txt",state: "ready",publishedRunId: candidateId,
      lifecycleGeneration: 1,canPropose: false,canManageLifecycle: false,submitted: true,
      coverage: { total: 1,visited: 1,omitted: [] } } }) }));
  await page.route(`**/api/artifacts/${versionId}/units?*`, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: {
      items: [{ id: "70000000-0000-4000-8000-000000000008",ordinal: 1,
        text: "Synthetic selected delivery passage",locator: { kind: "txt",lineStart: 2,lineEnd: 2 },
        origin: "native",ocrConfidence: null,hidden: false,formula: null }],nextCursor: null } }) }));
  await page.route(`**/api/customers/${customer}/commands`, async (route) => route.fulfill({
    status: 409,contentType: "application/json",body: JSON.stringify({
      error: { message: "Source changed" } }) }));
  await page.goto(`/customers/${customer}/review`);
  const candidate = page.locator(".profile-review-card").filter({ hasText: "Synthetic delivery observation" });
  await expect(candidate.getByRole("region",{ name: "Submitted Source Excerpt" }))
    .toContainText("Synthetic selected delivery passage");
  await candidate.getByRole("button",{ name: "Inspect original source" }).click();
  await expect(page.getByRole("dialog",{ name: "Source viewer" }))
    .toContainText("Synthetic selected delivery passage");
  await candidate.getByLabel("Internal review rationale").fill("Synthetic exact-source check");
  await candidate.getByRole("button",{ name: "Accept exact proposal" }).click();
  await expect(candidate.getByRole("status")).toContainText("Profile changed");
  await expect(candidate.getByLabel("Internal review rationale"))
    .toHaveValue("Synthetic exact-source check");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  mkdirSync("local-artifacts/004", { recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/004/review-${info.project.name}.png`);
});
