import { expect, test } from "@playwright/test";
import { signIn, signOut, type DemoAccount } from "../fixtures/ui";

for (const account of ["mcteer", "panel", "partner"] as DemoAccount[]) {
  test(`${account} can sign in and sign out`, async ({ page }) => {
    await signIn(page, account);
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await expect(page.getByText(`Signed in as ${account}`, { exact: false }).last()).toBeVisible();
    await signOut(page);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}

test("a cross-site return URL cannot redirect after sign-in", async ({ page }) => {
  await page.goto("/login?returnTo=https%3A%2F%2Fanother.example");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
});

test("sign-in uses one native credential POST and a server cookie redirect", async ({ page }) => {
  test.setTimeout(60_000);
  let credentialPosts = 0, nonFormPosts = 0, credentialUrls = 0;
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.searchParams.has("username") || url.searchParams.has("password")) credentialUrls++;
    if (url.pathname === "/api/auth/login" && request.method() === "POST") {
      credentialPosts++;
      if (!request.headers()["content-type"]?.startsWith("application/x-www-form-urlencoded")) nonFormPosts++;
    }
  });
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST", { timeout: 60_000 }),
    signIn(page, "panel"),
  ]);
  expect(response.status()).toBe(303);
  expect((await response.allHeaders()).location).toBe("/s");
  expect(credentialPosts).toBe(1);expect(nonFormPosts).toBe(0);expect(credentialUrls).toBe(0);
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  if ((page.viewportSize()?.width ?? 1440) < 768) await page.getByRole("button", { name: "Open navigation" }).click();
  await signOut(page);
});
