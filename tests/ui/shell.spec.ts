import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/ui";

test("workspace shell matches the desktop reference and remains accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "panel");
  await page.goto("/s");
  const sidebar = page.locator(".desktop-sidebar");
  await expect(sidebar).toBeVisible();
  expect(Math.round((await sidebar.boundingBox())!.width)).toBe(288);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Geist");
  await expect(page.getByRole("link", { name: "New chat" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).animationDuration))).toBeLessThan(0.001);
});

test("mobile navigation traps focus, closes on Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "partner");
  await page.goto("/s");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
