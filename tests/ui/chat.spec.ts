import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../fixtures/ui";

test.describe("owned conversation shell", () => {
  test("internal member starts a parked customer conversation without model work", async ({ page }) => {
    await signIn(page, "panel");
    await page.goto("/s");
    await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
    await page.getByRole("button", { name: "Start chat" }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(page.getByText("Synthetic customer data and public research only")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Message")).toBeVisible();
    if (page.viewportSize()!.width < 600) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await signOut(page);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
