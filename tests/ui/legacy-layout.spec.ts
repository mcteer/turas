import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { chmodSync } from "node:fs";
import { signIn } from "../fixtures/ui";

test("legacy landing and customer cards retain accessible scoped workflows", async ({ page }, info) => {
  await signIn(page, "panel");
  await expect(page.getByRole("heading", { name: "Turi", exact: true })).toBeVisible();
  await expect(page.getByLabel("Customer (optional)", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message Turi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Message Turi" }).fill("Explain technical best practices.");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(page.getByLabel("Customer (optional)")).toHaveValue("");
  expect((await page.getByLabel("Customer (optional)").boundingBox())!.y).toBeGreaterThan((await page.locator(".chat-composer").boundingBox())!.y + (await page.locator(".chat-composer").boundingBox())!.height);
  await expect(page.locator(".chat-landing .chat-notice")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message Turi" }).fill("");
  expect(await page.locator(".chat-title").evaluate(node => getComputedStyle(node).fontSize)).toBe("48px");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Geist");
  const capture = process.env.TURAS_UI_CAPTURE_ROOT;
  if (capture) {
    const file = join(capture, `${info.project.name}-landing.png`);
    await page.screenshot({ path: file }); chmodSync(file, 0o600);
  }
  if (page.viewportSize()!.width < 768) await page.getByRole("button", { name: "Open navigation" }).click();
  const search = page.getByRole("textbox", { name: "Search chat titles" }).filter({ visible: true });
  const nav = page.getByRole("navigation", { name: "Workspace" }).filter({ visible: true });
  expect((await search.boundingBox())!.y).toBeLessThan((await nav.boundingBox())!.y);
  await page.getByRole("link", { name: "Customer profiles", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  await expect(page.locator(".customer-card").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open profile" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  if (capture) {
    const file = join(capture, `${info.project.name}-customers.png`);
    await page.screenshot({ path: file }); chmodSync(file, 0o600);
  }
});

test("legacy sign-in card remains labelled and usable at narrow widths", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  expect((await page.getByLabel("Username").boundingBox())!.height).toBeGreaterThan(35);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  if (process.env.TURAS_UI_CAPTURE_ROOT) {
    const file = join(process.env.TURAS_UI_CAPTURE_ROOT, `${info.project.name}-login.png`);
    await page.screenshot({ path: file }); chmodSync(file, 0o600);
  }
});
