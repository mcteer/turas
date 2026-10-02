import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../fixtures/ui";

test.describe("owned conversation shell", () => {
  test("internal member starts a parked customer conversation without model work", async ({ page }) => {
    await signIn(page, "panel");
    await page.goto("/s");
    await page.getByLabel("Customer (optional)").selectOption({ label: "Cedar (synthetic)" });
    await page.getByRole("button", { name: "Attach documents" }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]+\?attachments=1$/);
    await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
    await expect(page.getByLabel("Message Turi")).toBeVisible();
    await page.getByRole("button", { name: "Customer context", exact: true }).click();
    await expect(page.getByText("Synthetic customer data and public research only")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Message Turi")).toBeVisible();
    if (page.viewportSize()!.width < 600) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await signOut(page);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});


test("general question creates a customer-free chat and attempts its first delivery once", async ({ page }) => {
  await signIn(page, "panel");
  let sends = 0;
  let sentText = "";
  await page.route("**/eve/v1/session/*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    sends++;
    sentText = route.request().postDataJSON().message;
    // This UI check covers draft transfer, not provider completion.
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable provider" }) });
  });
  // The intercepted send leaves no persisted response receipt. Wait for a
  // missing status followed by an authorized conversation read so the test
  // cannot pass before the status poll incorrectly hides the chat.
  let missingStatus = false;
  const accessRecheck = page.waitForResponse(response => {
    const path = new URL(response.url()).pathname;
    if (path.includes("/attempts/") && response.status() === 404) missingStatus = true;
    return missingStatus && /^\/api\/conversations\/[0-9a-f-]+$/.test(path) && response.status() === 200;
  });
  await page.getByRole("textbox", { name: "Message Turi" }).fill("Explain cache invalidation.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
  await accessRecheck;
  await expect(page.getByRole("heading", { name: "General Technical Chat" })).toBeVisible();
  await expect.poll(() => sends).toBe(1);
  expect(sentText).toBe("Explain cache invalidation.");
  await expect(page.getByRole("button", { name: "Customer context", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "General Technical Chat" })).toBeVisible();
  expect(sends).toBe(1);
  const conversationId = new URL(page.url()).pathname.split("/").at(-1);
  await page.route(`**/api/conversations/${conversationId}`, route => route.fulfill({
    status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }),
  }));
  await expect(page.getByRole("heading", { name: "Chat Unavailable" })).toBeVisible();
  expect(sends).toBe(1);
});
