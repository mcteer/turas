import { expect, test } from "@playwright/test";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

test.skip(process.env.TURAS_UI_ARTIFACT_LIVE !== "1", "Requires the isolated 004 live UI environment");

test("uploads and inspects a real scanned and parsed source", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page,"panel");
  await page.goto("/s");
  await page.getByLabel("Customer (optional)").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button",{ name: "Attach documents" }).click();
  await page.getByLabel("Attach documents").setInputFiles("local-artifacts/004/fixtures/simple.txt");
  await page.getByLabel("Source rights note").fill("Synthetic local browser upload test");
  await page.getByLabel("Audience").selectOption("delivery");
  await page.getByRole("button",{ name: "Upload selected documents" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Files received" })).toBeVisible({ timeout: 20_000 });
  const source = page.locator(".composer-attachments > .attachment-list li").filter({ hasText: "simple.txt" }).first();
  await expect(source.getByRole("button",{ name: "Inspect source" })).toBeVisible({ timeout: 90_000 });
  await source.getByRole("button",{ name: "Inspect source" }).click();
  const viewer = page.getByRole("dialog",{ name: "Source viewer" });
  await expect(viewer).toContainText("Juniper API is in a synthetic readiness review.");
  await viewer.getByLabel("Include unit 1 in draft chat context").check();
  await viewer.getByRole("button",{ name: "Use selected units in chat" }).click();
  await expect(page.getByText("1 source selection ready for this chat.")).toBeVisible();
  await sanitizedScreenshot(page,"local-artifacts/004/upload-live-webkit.png");
});
