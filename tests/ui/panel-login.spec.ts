import { expect, test } from "@playwright/test";

test("panel credentials establish a reviewer session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("playwright-panel");
  await page.getByLabel("Password").fill("playwright-panel-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/portfolio");
  const session = await page.request.get("/api/auth/session");
  expect(await session.json()).toEqual({ authenticated: true, identity: { username: "playwright-panel", role: "reviewer" } });
});

test("panel configuration rejects legacy and mixed credentials", async ({ request }) => {
  for (const [username, password] of [
    ["playwright-legacy-reviewer", "playwright-legacy-password"],
    ["playwright-panel", "playwright-legacy-password"],
    ["playwright-panel", "incorrect-password"],
  ]) {
    const response = await request.post("/api/auth/login", { form: { username, password }, maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("/login?error=invalid");
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  const session = await request.get("/api/auth/session");
  expect(await session.json()).toEqual({ authenticated: false, identity: null });
});

test("owner credentials retain the owner role", async ({ request }) => {
  await request.post("/api/auth/login", { form: { username: "playwright-owner", password: "playwright-password" }, maxRedirects: 0 });
  const session = await request.get("/api/auth/session");
  expect(await session.json()).toEqual({ authenticated: true, identity: { username: "playwright-owner", role: "owner" } });
});
