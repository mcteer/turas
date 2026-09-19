import { expect, test } from "@playwright/test";
import type { MessageStreamEvent } from "eve/client";

const documentFile = {
  name: "synthetic-engagement-brief.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\nSynthetic attachment visibility fixture"),
};
const imageFile = {
  name: "synthetic-diagram.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCioAAAAASUVORK5CYII=", "base64"),
};

test.beforeEach(async ({ page }) => {
  // UI checks must not call the model, connectors, or Hindsight.
  await page.route("**/eve/v1/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Synthetic test outage" }),
  }));
  await page.goto("/login");
  await page.getByLabel("Username").fill("playwright-owner");
  await page.getByLabel("Password").fill("playwright-password");
  await Promise.all([
    page.waitForURL("**/portfolio"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.goto("/");
});

test("files and pasted links remain visible and removable at mobile width", async ({ page }) => {
  const composer = page.getByRole("textbox", { name: "Message Turi" });
  await composer.fill("Review https://example.com/brief");
  await page.getByLabel("Upload files").setInputFiles([documentFile, imageFile]);
  const attachments = page.getByLabel("Message attachments");
  await expect(attachments.getByRole("button")).toHaveCount(3);
  await expect(attachments.getByText("PDF document")).toBeVisible();
  await expect(attachments.locator("img")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: `Remove ${documentFile.name}` }).click();
  await page.getByRole("button", { name: "Remove example.com" }).click();
  await expect(attachments.getByRole("button")).toHaveCount(1);
  await expect(composer).toHaveValue("Review ");
  await page.getByRole("button", { name: `Remove ${imageFile.name}` }).click();
  await expect(attachments).toHaveCount(0);
});

test("the link dialog validates URLs and releases page interaction after closing", async ({ page }) => {
  await page.getByRole("button", { name: "Attach files or links" }).click();
  await page.getByRole("menuitem", { name: "Add a link" }).click();
  await page.getByRole("textbox", { name: "Link URL" }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a complete link");
  await page.getByRole("textbox", { name: "Link URL" }).fill("https://vercel.com/docs");
  await page.getByRole("textbox", { name: "Link URL" }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // A modal menu/dialog overlap previously left body pointer-events disabled.
  await page.getByRole("button", { name: "Remove vercel.com" }).click();
  await expect(page.getByLabel("Message attachments")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
});

test("send includes retained files and links, preserves the next draft, and shows errors", async ({ page }) => {
  const composer = page.getByRole("textbox", { name: "Message Turi" });
  await composer.fill("Review https://example.com/brief");
  await page.getByLabel("Upload files").setInputFiles([documentFile, imageFile]);
  await page.getByRole("button", { name: `Remove ${documentFile.name}` }).click();
  let releaseRequest = () => {};
  const released = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await page.route("**/eve/v1/session", async (route) => {
    await released;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic test outage" }) });
  });
  try {
    const requestPromise = page.waitForRequest((request) => request.url().endsWith("/eve/v1/session") && request.method() === "POST");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    const request = await requestPromise;
    const payload = request.postData() ?? "";
    expect(payload).toContain(imageFile.name);
    expect(payload).toContain("data:image/png;base64,");
    expect(payload).toContain("https://example.com/brief");
    expect(payload).not.toContain(documentFile.name);
    await composer.fill("Keep this next draft");
    releaseRequest();
    await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toBeVisible();
    await expect(composer).toHaveValue("Keep this next draft");
    await expect(page.getByLabel("Sent attachments")).toBeVisible();
    await expect(page.getByLabel("Message attachments")).toHaveCount(0);
  } finally {
    releaseRequest();
  }
});

test("a file-only message has a visible attachment without an empty text bubble", async ({ page }) => {
  const turnId = "synthetic-upload-turn";
  const at = "2026-09-19T12:00:00.000Z";
  const events: MessageStreamEvent[] = [
    { type: "session.started", data: {}, meta: { at, id: "fixture-1" } },
    { type: "turn.started", data: { turnId, sequence: 0 }, meta: { at, id: "fixture-2" } },
    {
      type: "message.received",
      meta: { at, id: "fixture-3" },
      data: {
        turnId,
        sequence: 0,
        message: `[file: ${documentFile.name}]`,
        parts: [{ type: "file", filename: documentFile.name, mediaType: documentFile.mimeType, size: documentFile.buffer.length }],
      },
    },
    { type: "turn.completed", data: { turnId, sequence: 0 }, meta: { at, id: "fixture-4" } },
  ];
  await page.route("**/eve/v1/session", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ sessionId: "synthetic-upload-session" }),
  }));
  await page.route("**/eve/v1/session/synthetic-upload-session/stream*", (route) => route.fulfill({
    status: 200,
    contentType: "application/x-ndjson",
    headers: { "x-eve-stream-version": "25" },
    body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  }));
  await page.getByLabel("Upload files").setInputFiles(documentFile);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Sent attachments").getByText(documentFile.name)).toBeVisible();
  await expect(page.locator(".is-user").getByText("PDF document")).toBeVisible();
  await expect(page.locator(".is-user > div")).toHaveCount(1);
  await expect(page.locator(".is-user")).not.toContainText("[file:");
  await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toHaveCount(0);
});
