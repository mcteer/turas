import { expect, test } from "@playwright/test";

test("local shell directs an unauthenticated visitor to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
