import { randomUUID } from "node:crypto";
import { test, expect as baseExpect } from "@playwright/test";
import { query } from "../../lib/server/db/client";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { requireOwnedSupportClone } from "../../scripts/support-eval-environment";
import { signIn } from "../fixtures/ui";

const expect = baseExpect.configure({ timeout: 30000 });
test("native advice reload never redispatches and explicit suggestion save stays proposed", async ({ page }, info) => {
  test.setTimeout(210000);
  requireOwnedSupportClone();
  if (process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY !== "1") throw new Error("Owned native support fixture required");
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic browser native advice',true)", [customerId, DEMO_IDS.workspace]);
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Ask Turi for Support Guidance", exact: true }).click();
  await expect(page.getByText("Advice State: completed", { exact: true })).toBeVisible({ timeout: 150000 });
  await expect(page.getByRole("button", { name: "Save Suggestion 1 as Proposal", exact: true })).toBeVisible();
  const calls = async () => Number((await query("SELECT count(*)::int AS count FROM support_native_fixture_calls")).rows[0].count);
  expect(await calls()).toBe(2);
  await page.reload();
  await expect(page.getByText("Advice State: completed", { exact: true })).toBeVisible();
  expect(await calls()).toBe(2);
  await page.getByRole("button", { name: "Save Suggestion 1 as Proposal", exact: true }).click();
  await page.getByRole("button", { name: "Refresh Guidance", exact: true }).click();
  await expect(page.getByText("Accepted Disposition: Not Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("No accepted assessment. Missing operating evidence remains unknown.", { exact: true })).toBeVisible();
  expect(await calls()).toBe(2);
  const records = (await query("SELECT accepted_revision_id FROM support_records WHERE customer_id=$1 AND kind='action'", [customerId])).rows;
  expect(records).toHaveLength(1);
  expect(records[0].accepted_revision_id).toBeNull();
  await page.screenshot({ path: info.outputPath("native-proposed-guidance.png"), fullPage: true });
});

test("native stop withholds late output and reload does not admit another paid step", async ({ page }, info) => {
  test.setTimeout(210000);
  requireOwnedSupportClone();
  if (process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY !== "1") throw new Error("Owned native support fixture required");
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic native stop',true)", [customerId, DEMO_IDS.workspace]);
  await query("INSERT INTO support_native_fixture_barriers(customer_id) VALUES($1)", [customerId]);
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Ask Turi for Support Guidance", exact: true }).click();
  const calls = async () => Number((await query("SELECT count(*)::int AS count FROM support_native_fixture_calls")).rows[0].count);
  await expect.poll(calls, { timeout: 60000 }).toBe(1);
  const stopAcknowledgement = page.waitForResponse(response => response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/cancel"));
  await page.getByRole("button", { name: "Stop Support Guidance", exact: true }).click();
  expect((await stopAcknowledgement).ok()).toBe(true);
  // A click dispatches the asynchronous request; it does not establish that
  // cancellation has committed. Release late output only after the durable stop.
  await expect.poll(async () => (await query(`SELECT a.state FROM support_advice_attempts a
    JOIN support_advice_bindings b ON b.id=a.binding_id WHERE b.customer_id=$1`, [customerId])).rows[0]?.state,
    { timeout: 60000 }).toBe("cancelled");
  await query("UPDATE support_native_fixture_barriers SET released=true WHERE customer_id=$1", [customerId]);
  await expect(page.getByText("Advice State: cancelled", { exact: true })).toBeVisible({ timeout: 60000 });
  expect(await page.getByRole("button", { name: "Save Suggestion 1 as Proposal", exact: true }).count()).toBe(0);
  await page.reload();
  await expect(page.getByText("Advice State: cancelled", { exact: true })).toBeVisible();
  expect(await calls()).toBe(1);
  expect(await page.getByRole("heading", { name: "Proposed Guidance", exact: true }).count()).toBe(0);
  await page.screenshot({ path: info.outputPath("stopped-support-guidance.png"), fullPage: true });
});
