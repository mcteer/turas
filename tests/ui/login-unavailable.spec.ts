import { expect, test } from "@playwright/test";

// Run against an intentionally invalid database configuration:
// CI=1 TURAS_TEST_AUTH_FAILURE=1 DATABASE_URL=invalid npm run test:ui -- tests/ui/login-unavailable.spec.ts
test("session storage failure returns to a usable login form without a session cookie", async ({ page }) => {
  test.skip(process.env.TURAS_TEST_AUTH_FAILURE !== "1", "Requires the isolated unavailable-database test server.");
  await page.goto("/login?returnTo=%2Foperating-model");
  await page.getByLabel("Username").fill("playwright-panel");
  await page.getByLabel("Password").fill("playwright-panel-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/error=unavailable/);
  await expect(page.locator("main").getByRole("alert")).toContainText("Sign-in is temporarily unavailable");
  await expect(page.locator('input[name="returnTo"]')).toHaveValue("/operating-model");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect((await page.context().cookies()).some(cookie => cookie.name === "turas_demo_session")).toBe(false);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/turas-login-unavailable-${width}.png` });
  }
});
