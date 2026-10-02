import { expect, test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test.describe("customer profile", () => {
  test("shows an explicit sparse profile and preserves chat navigation", async ({ page }) => {
    await signIn(page, "panel");
    await page.waitForLoadState("load");
    await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile`, async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { data: { acceptedFacts: unknown[]; openConflicts?: unknown[] } };
      body.data.acceptedFacts = [];
      if (body.data.openConflicts) body.data.openConflicts = [];
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
    await expect(page.getByText("No Accepted Facts Yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Chat" })).toHaveAttribute(
      "href", `/s?customerId=${DEMO_IDS.sharedCustomer}`);
    await expect(page.locator("body")).not.toContainText("INTERNAL_OPERATIONS_SENTINEL_DO_NOT_PROJECT");
    await page.unrouteAll({ behavior: "wait" });
  });

  test("denies direct navigation to an unassigned partner customer", async ({ page }) => {
    await signIn(page, "partner");
    await page.waitForLoadState("load");
    await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
    await expect(page.getByRole("heading", { name: "Profile Unavailable" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Juniper (synthetic)");
  });

  test("distinguishes a failed profile read from an empty profile and recovers on retry", async ({ page }) => {
    await signIn(page, "panel");
    const endpoint = `/api/customers/${DEMO_IDS.sharedCustomer}/profile`;
    await page.route(`**${endpoint}`, (route) => route.fulfill({ status: 503,
      contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) }));
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
    await expect(page.getByRole("heading", { name: "Could Not Load This Profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No Accepted Facts Yet" })).toHaveCount(0);
    await page.unroute(`**${endpoint}`);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
  });

  test("shows loading until the protected profile response arrives", async ({ page }) => {
    await signIn(page, "panel");
    const endpoint = `/api/customers/${DEMO_IDS.sharedCustomer}/profile`;
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**${endpoint}`, async (route) => { await pending; await route.continue(); });
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
    await expect(page.getByText("Loading customer profile…")).toBeVisible();
    release?.();
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
  });

  test("keeps an uncertain proposal as a draft without claiming it was saved", async ({ page }) => {
    await signIn(page, "panel");
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
    const text = `Synthetic uncertain claim ${Date.now()}`;
    const form = page.locator(".profile-form");
    await form.getByLabel("Claim", { exact: true }).fill(text);
    await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/commands`, (route) => route.abort());
    await form.getByRole("button", { name: "Save as Pending" }).click();
    await expect(form.getByRole("status")).toContainText("result is uncertain");
    await expect(form.getByRole("button", { name: "Retry exact proposal" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your Submissions" })).not.toContainText(text);
  });

  test("clears a partner profile when its customer assignment is revoked", async ({ page, browser }) => {
    await signIn(page, "partner");
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    let revoked = false;
    try {
      await signIn(adminPage, "mcteer");
      await adminPage.goto("/admin/access");
      const partner = adminPage.getByRole("region", { name: "partner access" });
      await partner.getByLabel("Customer assignment").selectOption({ label: "Cedar (synthetic)" });
      await expect(partner.getByText("Cedar (synthetic): active")).toBeVisible();
      await partner.getByRole("button", { name: "Toggle assignment" }).click();
      await expect(partner.getByText("Cedar (synthetic): revoked")).toBeVisible();
      revoked = true;
      await expect(page.getByRole("heading", { name: "Profile Unavailable" })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("body")).not.toContainText("Cedar (synthetic)");
      await partner.getByRole("button", { name: "Toggle assignment" }).click();
      await expect(partner.getByText("Cedar (synthetic): active")).toBeVisible();
      revoked = false;
    } finally {
      if (revoked) {
        const partner = adminPage.getByRole("region", { name: "partner access" });
        await partner.getByRole("button", { name: "Toggle assignment" }).click();
        await expect(partner.getByText("Cedar (synthetic): active")).toBeVisible();
      }
      await adminContext.close();
    }
  });
});
