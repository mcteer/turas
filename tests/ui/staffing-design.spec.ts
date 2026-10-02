import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { signIn } from "../fixtures/ui";

test("populated capacity tables and resource forms remain usable at narrow widths", async ({ page }, info) => {
  test.setTimeout(120_000);
  requireOwnedStaffingClone();
  await resetStaffingFixtureRates();
  // Seeded ledger proves presentation and reads, not the governed approval journey.
  const fixture = await withTransaction(async db => {
    const ledger = await createConfirmedAllocationLedgerFixture(db, { displayName: "Morgan Avery (synthetic)" });
    const row = await db.query<{ customer_id: string }>("SELECT customer_id FROM staffing_allocations WHERE id=$1", [ledger.allocation.allocationId]);
    return { ...ledger, customerId: row.rows[0].customer_id };
  });
  await signIn(page, "mcteer");
  await page.goto("/staffing");
  const customer = page.getByLabel("Customer", { exact: true });
  await expect(customer).toBeEnabled();
  await expect(customer.locator(`option[value="${fixture.customerId}"]`)).toHaveCount(1);
  await customer.selectOption(fixture.customerId);
  await page.getByLabel("First service date", { exact: true }).fill(fixture.firstDate);
  await page.getByLabel("Last service date", { exact: true }).fill(fixture.firstDate);
  await page.getByRole("button", { name: "Read planned operations", exact: true }).focus();
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Morgan Avery (synthetic) daily capacity", exact: true }).last();
  await expect(table.getByRole("cell", { name: "120", exact: true })).toHaveCount(2);
  for (const cell of await table.getByRole("cell", { name: "120", exact: true }).all()) {
    expect(await cell.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return range.getClientRects().length;
    }), "Capacity values must remain on one line").toBe(1);
  }
  await expect(table.getByRole("cell", { name: "Unknown", exact: true })).toHaveCount(5);
  await table.focus();
  await expect(table).toBeFocused();
  await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(table.getByRole("columnheader", { name: "Review", exact: true })).toBeInViewport();
  await table.evaluate(element => { element.scrollLeft = 0; });
  await capture("capacity");
  await page.goto(`/staffing/resources/${fixture.resource.resourceId}`);
  await expect(page.getByRole("heading", { name: "Morgan Avery (synthetic)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revise resource", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save resource revision", exact: true })).toBeVisible();
  await capture("resource-detail");

  async function capture(name: string) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
    const root = process.env.TURAS_UI_CAPTURE_ROOT;
    if (root) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
      const file = join(root, `${info.project.name}-${name}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: file, fullPage: true });
      chmodSync(file, 0o600);
    }
  }
});
