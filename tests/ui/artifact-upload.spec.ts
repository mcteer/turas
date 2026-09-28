import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

test("attachment composer keeps customer binding and draft layout usable", async ({ page }, info) => {
  await signIn(page, "panel");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page.getByLabel("Attach documents")).toBeVisible();
  await expect(page.getByText("Documents for Cedar (synthetic) stay private")).toBeVisible();
  await page.getByLabel("Attach documents").setInputFiles("local-artifacts/004/fixtures/simple.txt");
  await expect(page.getByText(/simple\.txt ·/)).toBeVisible();
  await page.getByLabel("Source rights note").fill("Synthetic delivery fixture");
  await page.getByLabel("Audience").selectOption("delivery");
  await expect(page.getByRole("button", { name: "Upload selected documents" })).toBeEnabled();
  await page.getByLabel("Message").fill("Keep this draft independent of the file.");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByLabel("Message")).toHaveValue("Keep this draft independent of the file.");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  mkdirSync("local-artifacts/004", { recursive: true });
  await sanitizedScreenshot(page, `local-artifacts/004/upload-composer-${info.project.name}.png`);
});
