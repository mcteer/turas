import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

async function reviewScreen(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflow`).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? "")), `${name}: accessibility`).toEqual([]);
  const root = process.env.TURAS_UI_CAPTURE_ROOT;
  if (root) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const file = join(root, `${info.project.name}-${name}.png`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: file, fullPage: true });
    chmodSync(file, 0o600);
  }
}

test("workspace screens retain usable controls and accessible layouts", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, "mcteer");
  const screens = [
    ["/customers", "Customers", "customers"],
    [`/customers/${DEMO_IDS.sharedCustomer}`, "Cedar (synthetic)", "profile"],
    [`/customers/${DEMO_IDS.sharedCustomer}/plans`, "Delivery Plans", "plans"],
    [`/customers/${DEMO_IDS.sharedCustomer}/plans/new`, "New Plan", "plan-editor"],
    ["/knowledge", "Shared Knowledge", "knowledge"],
    ["/staffing", "Staffing Operations", "operations"],
    ["/staffing/resources", "Resources And Skills", "resources"],
    ["/staffing/imports", "Workforce Imports", "imports"],
    ["/staffing/finance", "Planning Finance Inputs", "finance"],
    ["/admin/access", "Access", "access"],
  ];
  for (const [path, heading, name] of screens) {
    await test.step(name, async () => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      await reviewScreen(page, info, name);
    });
  }
  const assignment = page.getByRole("region", { name: "partner access" }).getByLabel("Customer assignment");
  await assignment.selectOption(DEMO_IDS.sharedCustomer);
  await expect(page.getByRole("button", { name: "Toggle assignment" })).toBeEnabled();
});

test("workspace navigation and theme controls work with the keyboard", async ({ page }, info) => {
  await signIn(page, "mcteer");
  const mobile = page.viewportSize()!.width < 768;
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  const resources = page.getByRole("link", { name: "Resources And Skills", exact: true }).filter({ visible: true });
  await resources.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Resources And Skills", exact: true })).toBeVisible();
  if (mobile) {
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await expect(resources).toHaveAttribute("aria-current", "page");
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole("button", { name: "Toggle theme" }).filter({ visible: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(before);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(before);
  if (mobile) {
    await reviewScreen(page, info, "navigation");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  }
});
