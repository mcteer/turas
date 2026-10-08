import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "../fixtures/ui";

test("archive and restore a conversation from navigation using the keyboard", async ({ page }, testInfo) => {
  await signIn(page, "panel"); await page.goto("/s");
  const title = `Archive ${testInfo.project.name}`;
  await page.evaluate(async title => {
    const response = await fetch("/api/auth/session");
    const body = await response.json();
    const created = await fetch("/api/conversations", { method: "POST", headers: {
      "content-type": "application/json", "x-csrf-token": body.data.csrfToken },
      body: JSON.stringify({ title, requestKey: crypto.randomUUID() }) });
    if (!created.ok) throw new Error("Synthetic conversation creation failed");
  }, title);
  await page.reload();
  const mobile = testInfo.project.name.includes("mobile");
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.locator(mobile ? ".mobile-panel" : ".desktop-sidebar");
  const archive = nav.getByRole("button", { name: `Archive ${title}`, exact: true });
  await expect(archive).toBeVisible(); await archive.focus(); await page.keyboard.press("Enter");
  await expect(nav.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  await nav.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(nav.getByRole("link", { name: title, exact: true })).toBeVisible();
  const restore = nav.getByRole("button", { name: `Restore ${title}`, exact: true });
  await restore.focus(); await page.keyboard.press("Enter");
  await expect(nav.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  await nav.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(nav.getByRole("link", { name: title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});
