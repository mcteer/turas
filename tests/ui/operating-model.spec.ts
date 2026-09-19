import { expect, test } from "@playwright/test";

test("login heading stays on one line inside its card at mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    const fits = await page.getByRole("heading", { name: "Turas Command Center" }).evaluate((heading) => {
      const range = document.createRange();
      range.selectNodeContents(heading);
      const text = range.getBoundingClientRect();
      const container = heading.getBoundingClientRect();
      return text.left >= container.left && text.right <= container.right && text.height <= parseFloat(getComputedStyle(heading).lineHeight) && document.documentElement.scrollWidth <= innerWidth;
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: `/tmp/turas-login-${width}.png` });
  }
});

test("operating plan requires sign-in", async ({ page }) => {
  await page.goto("/operating-model");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});

test("plan makes losses, impossible capacity and missing inputs visible", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("playwright-owner");
  await page.getByLabel("Password").fill("playwright-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/portfolio");
  await page.getByRole("link", { name: "Services operating plan" }).click();
  await expect(page.getByRole("definition").filter({ hasText: /^\$897,000$/ })).toBeVisible();
  await page.getByLabel("Billable utilization (%)", { exact: true }).fill("50");
  await expect(page.getByRole("definition").filter({ hasText: /^-\$120,000$/ })).toBeVisible();
  await page.getByLabel("Billable utilization (%)", { exact: true }).fill("80");
  await expect(page.locator("main").getByRole("alert")).toContainText("Infeasible capacity");
  await page.getByLabel("Realized hourly rate ($)").fill("");
  await expect(page.locator("main").getByRole("alert")).toContainText("Empty inputs");
  await expect(page.getByRole("definition").filter({ hasText: /^\$897,000$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset assumptions" }).click();
  await expect(page.getByRole("definition").filter({ hasText: /^\$897,000$/ })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/turas-operating-plan-${width}.png`, fullPage: true });
  }
  // Regression: a non-pilot engagement previously reused the pilot's costs.
  await page.goto("/engagements/eng-linear-release");
  const scenario = page.locator("section").filter({ has: page.getByRole("heading", { name: "What-if preview" }) });
  await expect(scenario).toContainText("$10,500.00");
  await page.getByLabel("Remaining effort (hours)").fill("0");
  await expect(scenario).toContainText("$15,900.00");
  await page.getByLabel("Remaining effort (hours)").fill("");
  await expect(page.locator("main").getByRole("alert")).toContainText("Inputs are invalid");
});
