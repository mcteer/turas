import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

const versionId = "60000000-0000-4000-8000-000000000004";
const runId = "60000000-0000-4000-8000-000000000005";

test("source management keeps replacement and withdrawal distinct", async ({ page }, info) => {
  await signIn(page,"panel");
  let state = "ready";
  let actionBody: { action: string; reason: string; expectedGeneration: number } | null = null;
  await page.route(/\/api\/artifacts\?customerId=/, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: { items: [{
      versionId,displayName: "Synthetic source.txt",state }] } }) }));
  await page.route(/\/api\/conversations\/[^/]+\/attachments$/, async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200,
      contentType: "application/json",body: JSON.stringify({ data: { versionId } }) });
    else await route.continue();
  });
  await page.route(`**/api/artifacts/${versionId}`, async (route) => route.fulfill({ status: 200,
    contentType: "application/json",body: JSON.stringify({ data: { id: versionId,
      displayName: "Synthetic source.txt",state,publishedRunId: runId,
      lifecycleGeneration: state === "ready" ? 1 : 2,canPropose: false,
      canManageLifecycle: true,submitted: false,
      coverage: { total: 1,visited: 1,omitted: [] } } }) }));
  await page.route(`**/api/artifacts/${versionId}/units?*`, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: {
      items: [{ id: "60000000-0000-4000-8000-000000000006",ordinal: 1,
        text: "Synthetic lifecycle passage",locator: { kind: "txt",lineStart: 1,lineEnd: 1 },
        origin: "native",ocrConfidence: null,hidden: false,formula: null }],nextCursor: null } }) }));
  await page.route(`**/api/artifacts/${versionId}/impact`, async (route) => route.fulfill({
    status: 200,contentType: "application/json",body: JSON.stringify({ data: {
      affectedClaims: 2,dependentConversations: 1 } }) }));
  await page.route(`**/api/artifacts/${versionId}/actions`, async (route) => {
    actionBody = route.request().postDataJSON();
    state = "withdrawn";
    await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
      data: { versionId,state,lifecycleGeneration: 2 } }) });
  });
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await page.getByRole("button", { name: "Attach to this chat" }).click();
  await page.getByRole("button", { name: "Inspect source" }).click();
  const manager = page.getByRole("region",{ name: "Source lifecycle" });
  await expect(manager).toContainText("2 linked claim(s) and 1 dependent conversation(s)");
  await expect(manager.getByRole("button",{ name: "Upload new version" })).toBeVisible();
  await expect(manager.getByRole("button",{ name: "Delete source and content" })).toBeVisible();
  await manager.getByRole("button",{ name: "Withdraw source" }).click();
  await expect(manager).toContainText("Confirm withdraw for generation 1");
  await manager.getByLabel("Reason").fill("Synthetic source superseded by owner");
  await manager.getByRole("button",{ name: "Confirm withdraw" }).click();
  await expect(manager.getByRole("status")).toContainText("Source withdrawn");
  expect(actionBody).toMatchObject({ action: "withdraw",expectedGeneration: 1,
    reason: "Synthetic source superseded by owner" });
  await expect(manager.getByRole("button",{ name: "Delete source and content" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  mkdirSync("local-artifacts/004", { recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/004/lifecycle-${info.project.name}.png`);
});
