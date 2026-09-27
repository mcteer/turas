import { expect, test } from "@playwright/test";
import { signIn, type DemoAccount } from "../fixtures/ui";

for (const account of ["mcteer", "panel", "partner"] as DemoAccount[]) {
  test(`${account} can sign in and sign out`, async ({ page }) => {
    await signIn(page, account);
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await expect(page.getByText(`Signed in as ${account}`, { exact: false }).last()).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}

test("a cross-site return URL cannot redirect after sign-in", async ({ page }) => {
  await page.goto("/login?returnTo=https%3A%2F%2Fanother.example");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
});
