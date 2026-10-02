import { expect, test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test("the populated synthetic profile exposes delivery and review decisions", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-walkthrough for the synthetic journey");
  await signIn(page, "mcteer");
  await page.goto("/customers");
  await page.getByRole("button", { name: "Juniper (synthetic) · Synthetic" }).click();
  await page.getByRole("link", { name: "Open Profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/customers/${DEMO_IDS.deniedCustomer}$`));
  const workloads = page.locator("#profile-workload");
  await expect(workloads.locator("option")).toHaveCount(3);
  const products = page.locator('section[aria-labelledby="profile-product_use"]');
  await expect(products).toContainText("state: actual");
  await expect(products).toContainText("state: evaluating");
  const maturity = page.locator(".profile-maturity-card");
  await expect(maturity.locator(".profile-maturity-dimension")).toHaveCount(6);
  await expect(maturity.locator(".profile-maturity-dimension", { hasText: "Unknown" })).toHaveCount(4);
  await expect(page.locator('section[aria-labelledby="profile-risk"]'))
    .toContainText("Checkout rollback ownership is unresolved");
  await expect(page.locator('section[aria-labelledby="profile-next_review"]'))
    .toContainText("Confirm rollback owner and record rehearsal outcome");
  await expect(page.locator('section[aria-labelledby="profile-research"]'))
    .toContainText("Synthetic public capability reference");
  await expect(page.locator('section[aria-labelledby="profile-conflicts"]'))
    .toContainText("Confirmed Conflict");
  await page.getByRole("link", { name: "Review Proposals" }).click();
  const candidate = page.locator(".profile-review-card")
    .filter({ hasText: "Checkout rollback owner has agreed to the rehearsal plan." });
  await expect(candidate).toContainText("Pending");
  await expect(candidate.getByRole("button", { name: "Accept exact proposal" })).toBeVisible();
});
