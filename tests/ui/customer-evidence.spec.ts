import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login?returnTo=%2Fcustomers");
  await page.getByLabel("Username").fill("playwright-panel");
  await page.getByLabel("Password").fill("playwright-panel-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/customers");
}

test("customer evidence requires authentication, including direct account URLs", async ({ page }) => {
  for (const path of ["/customers", "/customers/public-notion"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  }
});

test("public evidence shows dated scoped sources and passes real context to chat", async ({ page }) => {
  await signIn(page);
  await page.getByRole("searchbox").fill("Notion");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: /^Notion Measurement|^Notion Operational/ }).click();
  await expect(page.getByRole("heading", { name: "Notion", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("Formal maturity: unknown");
  await expect(page.locator("main")).toContainText("Internal engagement: unavailable");
  await expect(page.locator("main")).toContainText("2026-03-12");
  await expect(page.locator("main")).toContainText("2024-11-25");
  await expect(page.locator("main")).not.toContainText("12 of 40");
  await expect(page.locator('main a[href="https://vercel.com/customers/notion-workers-vercel-sandbox"]')).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/turas-customer-notion-${width}.png`, fullPage: true });
  }
  let sessionsCreated = 0;
  await page.route("**/eve/v1/session", route => { sessionsCreated++; return route.abort(); });
  await page.getByRole("link", { name: "Discuss this evidence with Turi" }).click();
  await expect(page.getByRole("textbox", { name: "Message Turi" })).toHaveValue(/public-notion/);
  expect(sessionsCreated).toBe(0);
});

test("directory-only, empty, invalid and anonymous results cannot imply a maturity grade", async ({ page }) => {
  await signIn(page);
  await page.goto("/customers/public-figma");
  await expect(page.locator("main")).toContainText("Maturity signals and workload scope are unknown");
  await page.goto("/customers/public-unnamed-sportswear-retailer");
  await expect(page.locator("main")).toContainText("Customer identity is undisclosed");
  await page.goto("/customers?query=no-such-customer-987");
  await expect(page.getByRole("heading", { name: "No matching public evidence" })).toBeVisible();
  await page.goto("/customers?signal=Transform");
  await expect(page.locator("main").getByRole("alert")).toContainText("Invalid search filters");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const search = await page.getByRole("searchbox").boundingBox();
    expect(search?.width).toBeGreaterThanOrEqual(240);
    await page.getByRole("searchbox").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/turas-customer-inventory-${width}.png`, fullPage: false });
  }
});

test("fictional intervention shows its staffing constraint and prefills its own context", async ({ page }) => {
  await signIn(page);
  await page.goto("/engagements/eng-notion-pilot");
  await expect(page.getByRole("heading", { name: "Alderwick Labs (fictional company)" })).toBeVisible();
  await expect(page.locator("main")).toContainText("4 hours schedulable");
  await expect(page.locator("main")).toContainText("Proposed start: 2026-09-22");
  await page.screenshot({ path: "/tmp/turas-fictional-engagement.png", fullPage: true });
  await page.getByRole("link", { name: "Ask Turi about this engagement" }).click();
  await expect(page.getByRole("textbox", { name: "Message Turi" })).toHaveValue(/fictional Alderwick.*eng-notion-pilot/);
  await page.goto("/memo");
  await expect(page.locator("main")).toContainText("$897,000");
  await expect(page.locator("main")).toContainText("$87,000");
  await page.screenshot({ path: "/tmp/turas-evidence-memo.png", fullPage: true });
});
