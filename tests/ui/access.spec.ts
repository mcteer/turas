import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/ui";

test.describe("customer and partner access", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== "webkit-desktop-light", "Access mutations use one local demo database");
  });

  test("only the administrator can open access controls", async ({ page }) => {
    await signIn(page, "mcteer");
    await page.goto("/admin/access");
    await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "partner" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "panel");
    await page.goto("/admin/access");
    await expect(page.getByText("404")).toBeVisible();
  });

  test("internal members see every demo customer and partners see their subset", async ({ page }) => {
    await signIn(page, "panel");
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: "Cedar (synthetic) · Synthetic" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Juniper (synthetic) · Synthetic" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "partner");
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: "Cedar (synthetic) · Synthetic" })).toBeVisible();
    await expect(page.getByText("Juniper (synthetic)")).toHaveCount(0);
  });

  test("administrator grants and revokes one partner customer assignment", async ({ page }) => {
    await signIn(page, "mcteer");
    await page.goto("/admin/access");
    const partner = page.getByRole("region", { name: "partner access" });
    await partner.getByLabel("Customer assignment").selectOption({ label: "Juniper (synthetic)" });
    const grantResponse = page.waitForResponse((response) => response.url().includes("/api/admin/grants/") && response.request().method() === "PUT");
    await partner.getByRole("button", { name: "Toggle assignment" }).click();
    expect((await grantResponse).status()).toBe(200);
    await expect(partner.getByText("Juniper (synthetic): active")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "partner");
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: "Juniper (synthetic) · Synthetic" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "mcteer");
    await page.goto("/admin/access");
    const restoredPartner = page.getByRole("region", { name: "partner access" });
    await restoredPartner.getByLabel("Customer assignment").selectOption({ label: "Juniper (synthetic)" });
    await restoredPartner.getByRole("button", { name: "Toggle assignment" }).click();
    await expect(restoredPartner.getByText("Juniper (synthetic): revoked")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "partner");
    await page.goto("/customers");
    await expect(page.getByText("Juniper (synthetic)")).toHaveCount(0);
  });
});
