import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login?returnTo=%2Fs");
  await page.getByLabel("Username").fill("playwright-panel");
  await page.getByLabel("Password").fill("playwright-panel-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/s");
});

test("new chat waits for ownership to persist before opening its protected stream", async ({ page }) => {
  let ownershipSaved = false;
  let prematureStream = false;
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 500));
    ownershipSaved = true;
    await route.fulfill({ status: 201, json: { conversation: { id: "test-conversation" } } });
  });
  await page.route("**/eve/v1/session", (route) => route.fulfill({
    status: 202, json: { sessionId: "test-protected-session" },
  }));
  await page.route("**/eve/v1/session/test-protected-session/stream*", (route) => {
    if (!ownershipSaved) {
      prematureStream = true;
      return route.fulfill({ status: 401, json: { error: "Authorization is required for this route." } });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      headers: { "x-eve-stream-version": "25" },
      body: JSON.stringify({ type: "turn.completed", data: { turnId: "test-turn", sequence: 0 }, meta: { id: "test-event", at: "2026-09-19T12:00:00.000Z" } }) + "\n",
    });
  });
  await page.getByRole("textbox", { name: "Message Turi" }).fill("Summarize the weekly review.");
  const streamResponse = page.waitForResponse((response) => response.url().includes("test-protected-session/stream"));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect((await streamResponse).status()).toBe(200);
  expect(prematureStream).toBe(false);
  await expect(page).toHaveURL(/\/s\/test-protected-session$/);
  await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toHaveCount(0);
});

test("failed ownership save shows a recovery message without requesting the protected stream", async ({ page }) => {
  let streamRequested = false;
  await page.route("**/api/conversations", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.continue());
  await page.route("**/eve/v1/session", (route) => route.fulfill({ status: 202, json: { sessionId: "test-unsaved-session" } }));
  await page.route("**/eve/v1/session/test-unsaved-session/stream*", (route) => {
    streamRequested = true;
    return route.fulfill({ status: 401, json: { error: "Authorization is required for this route." } });
  });
  await page.getByRole("textbox", { name: "Message Turi" }).fill("Summarize the weekly review.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to save this chat" })).toBeVisible();
  expect(streamRequested).toBe(false);
  await expect(page).toHaveURL(/\/s$/);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/turas-chat-save-error-${width}.png` });
  }
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to save this chat" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Turi" })).toBeEnabled();
});
