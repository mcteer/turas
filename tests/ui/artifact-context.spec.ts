import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";
import { mkdirSync } from "node:fs";

const versionId = "50000000-0000-4000-8000-000000000004";
const runId = "50000000-0000-4000-8000-000000000005";
const unitId = "50000000-0000-4000-8000-000000000006";

test("exact source selection prepares a file-only chat draft", async ({ page }, info) => {
  await signIn(page,"panel");
  await page.route(/\/api\/artifacts\?customerId=/, async (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ data: { items: [{ versionId,
      displayName: "Synthetic source.txt",state: "ready" }] } }) }));
  await page.route(/\/api\/conversations\/[^/]+\/attachments$/, async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200,
      contentType: "application/json",body: JSON.stringify({ data: { versionId } }) });
    else await route.continue();
  });
  await page.route(`**/api/artifacts/${versionId}`, async (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ data: { id: versionId,
      displayName: "Synthetic source.txt",state: "ready",publishedRunId: runId,
      lifecycleGeneration: 1,canPropose: true,canManageLifecycle: false,submitted: false,
      coverage: { total: 1,visited: 1,omitted: [] } } }) }));
  await page.route(`**/api/artifacts/${versionId}/units?*`, async (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ data: { items: [{ id: unitId,
      ordinal: 1,text: "Synthetic unverified passage",locator: { kind: "txt",lineStart: 1,lineEnd: 1 },
      origin: "native",ocrConfidence: null,hidden: false,formula: null }],nextCursor: null } }) }));
  await page.goto("/s");
  await page.getByLabel("Customer (optional)").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Attach documents" }).click();
  await page.getByRole("button", { name: "Attach to this chat" }).click();
  await page.getByRole("button", { name: "Inspect source" }).click();
  await page.getByLabel("Include unit 1 in draft chat context").check();
  await page.getByRole("button", { name: "Use selected units in chat" }).click();
  await expect(page.getByText("1 source selection ready for this chat.")).toBeVisible();
  await expect(page.getByLabel("Message Turi")).toHaveValue("");
  await expect(page.getByText("Synthetic unverified passage", { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  mkdirSync("local-artifacts/004", { recursive: true });
  await sanitizedScreenshot(page, `local-artifacts/004/context-selection-${info.project.name}.png`);
});
