import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("search and exact citation states fit WebKit viewports",async ({ page },testInfo) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1",
    "Seed disposable synthetic profile and retrieval projections first");
  await signIn(page,"mcteer");
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  const search = page.getByRole("region",{ name: "Search evidence" });
  await expect(search).toBeVisible();
  await search.getByLabel("Question or terms").fill("synthetic deployment");
  await search.getByRole("button",{ name: "Search" }).click();
  await expect(search.getByRole("button",{ name: "Search" })).toBeEnabled({ timeout: 15_000 });
  const button = search.getByRole("button",{ name: "View citation" }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(search.getByRole("region",{ name: "Citation detail" })).toContainText(
    "Synthetic deployment product");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  mkdirSync("local-artifacts/005",{ recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/005/retrieval-${testInfo.project.name}.png`);
});
