import { expect, test } from "@playwright/test";

test("account controls stay visible while page content scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/login?returnTo=%2Foperating-model");
  await page.getByLabel("Username").fill("playwright-panel");
  await page.getByLabel("Password").fill("playwright-panel-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/operating-model");

  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(signOut).toBeInViewport();
  await expect(page.getByText("Synthetic demo", { exact: true })).toHaveCount(0);
  const before = await signOut.boundingBox();
  expect(before).not.toBeNull();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(signOut).toBeInViewport();
  const after = await signOut.boundingBox();
  expect(after?.y).toBeCloseTo(before!.y, 0);
  await page.screenshot({ path: "/tmp/turas-sidebar-desktop.png" });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(signOut).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/turas-sidebar-mobile.png" });
});
