import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { sanitizedScreenshot, signIn, signOut } from "../fixtures/ui";

test("profile and review states are usable across configured WebKit viewports", async ({ page }, testInfo) => {
  await signIn(page, "mcteer");
  mkdirSync("local-artifacts/003", { recursive: true });
  for (const [path, name] of [
    [`/customers/${DEMO_IDS.sharedCustomer}`, "profile"],
    [`/customers/${DEMO_IDS.deniedCustomer}`, "populated-profile"],
    [`/customers/${DEMO_IDS.sharedCustomer}/review`, "review"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")))
      .toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      .toBe(true);
    await sanitizedScreenshot(page, `local-artifacts/003/${name}-${testInfo.project.name}.png`);
    if (name === "populated-profile" && process.env.TURAS_PROFILE_FIXTURE_READY === "1") {
      await page.getByRole("button", { name: "View source" }).first().click();
      await expect(page.getByRole("heading", { name: "Source detail" })).toBeVisible();
      const sourceAxe = await new AxeBuilder({ page }).analyze();
      expect(sourceAxe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")))
        .toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        .toBe(true);
      await sanitizedScreenshot(page, `local-artifacts/003/source-${testInfo.project.name}.png`);
      await page.getByRole("button", { name: "Close source" }).click();
      await page.getByRole("button", { name: "View history" }).first().click();
      await expect(page.getByRole("heading", { name: "Record history" })).toBeVisible();
      const historyAxe = await new AxeBuilder({ page }).analyze();
      expect(historyAxe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")))
        .toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        .toBe(true);
      await sanitizedScreenshot(page, `local-artifacts/003/history-${testInfo.project.name}.png`);
      await page.getByRole("button", { name: "Close history" }).click();
    }
  }
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await signOut(page);
  await signIn(page, "partner");
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
  await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
  const partnerAxe = await new AxeBuilder({ page }).analyze();
  expect(partnerAxe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await sanitizedScreenshot(page, `local-artifacts/003/partner-profile-${testInfo.project.name}.png`);
});
