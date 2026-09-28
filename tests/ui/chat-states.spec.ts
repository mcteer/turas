import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/ui";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { prepareAttempt, claimDispatch, markDispatchUncertain } from "../../lib/server/conversations/dispatch";
import { Client } from "pg";

const syntheticCleanup: string[] = [];
test.afterEach(async () => {
  if (!syntheticCleanup.length) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const ids = syntheticCleanup.splice(0);
    // Dispatch captures an immutable context receipt. Keep those synthetic
    // conversations intact so local UI cleanup never breaks the audit chain.
    const retained = await client.query<{ conversation_id: string }>(`
      SELECT DISTINCT conversation_id FROM context_snapshot_receipts
      WHERE conversation_id = ANY($1::uuid[])
      UNION
      SELECT DISTINCT ra.conversation_id FROM context_injection_receipts cir
      JOIN response_attempts ra ON ra.id = cir.attempt_id
      WHERE ra.conversation_id = ANY($1::uuid[])`, [ids]);
    const retainedIds = new Set(retained.rows.map((row) => row.conversation_id));
    if (retainedIds.size) {
      await client.query(`UPDATE response_attempts SET response_state = 'cancelled'
        WHERE conversation_id = ANY($1::uuid[])
          AND response_state IN ('pending','running','stopping')`, [[...retainedIds]]);
    }
    const removableIds = ids.filter((id) => !retainedIds.has(id));
    if (!removableIds.length) return;
    await client.query(`DELETE FROM watchdog_jobs WHERE attempt_id IN
      (SELECT id FROM response_attempts WHERE conversation_id = ANY($1::uuid[]))`, [removableIds]);
    await client.query("DELETE FROM event_projections WHERE conversation_id = ANY($1::uuid[])", [removableIds]);
    await client.query("DELETE FROM response_attempts WHERE conversation_id = ANY($1::uuid[])", [removableIds]);
    await client.query("DELETE FROM submitted_messages WHERE conversation_id = ANY($1::uuid[])", [removableIds]);
    await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [removableIds]);
  } finally { await client.end(); }
});

test("new chat explains scope and shows only assigned customer choices", async ({ page }) => {
  await signIn(page, "partner");
  await page.goto("/s");
  await expect(page.getByRole("heading", { name: "Turi" })).toBeVisible();
  await expect(page.getByText("Synthetic customer data and public research only")).toBeVisible();
  await expect(page.getByLabel("Customer")).toContainText("Cedar");
  await expect(page.getByLabel("Customer")).not.toContainText("Harbor");
  await expect(page.getByRole("button", { name: /attach|upload/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /operations|planning|feedback/i })).toHaveCount(0);
});

test("bound chat retains visible customer and scope notice", async ({ page }) => {
  await signIn(page, "panel");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Cedar (synthetic)" })).toBeVisible();
  await expect(page.getByText("Synthetic customer data and public research only")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await page.getByRole("button", { name: "Submit a message claim for review" }).click();
  await expect(page.getByRole("heading", { name: "Submit a message claim for review" })).toBeVisible();
  await expect(page.getByText("No owned messages are available to share.")).toBeVisible();
  await page.getByRole("button", { name: "Close claim submission" }).click();
  await page.getByLabel("Message").fill("Synthetic unsent draft");
  await expect(page.getByText("Draft not sent.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Message")).toBeVisible();
});

test("customer loading failure is distinct from an empty assignment", async ({ page }) => {
  await signIn(page, "partner");
  await page.route("**/api/customers", async (route) => {
    await route.fulfill({ status: 503, body: JSON.stringify({ ok: false }),
      contentType: "application/json" });
  });
  await page.goto("/s");
  await expect(page.getByText("Customers are unavailable. Reload to try again.")).toBeVisible();
  await expect(page.getByText("No customers are assigned")).toHaveCount(0);
});

test("customer loading and empty assignment remain distinct", async ({ page }) => {
  await signIn(page, "partner");
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/customers", async (route) => {
    await pending;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } }) });
  });
  await page.goto("/s");
  await expect(page.getByText("Loading customers…")).toBeVisible();
  release?.();
  await expect(page.getByText("No customers are assigned to this account.")).toBeVisible();
});

test("a revoked conversation clears the protected chat view", async ({ page }) => {
  await signIn(page, "partner");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page.getByLabel("Message")).toBeVisible();
  await page.route(/\/api\/conversations\/[0-9a-f-]+$/, async (route) => {
    await route.fulfill({ status: 404, body: JSON.stringify({ ok: false }),
      contentType: "application/json" });
  });
  await expect(page.getByText("Access to this customer or chat has changed.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Message")).toHaveCount(0);
});

test("a reload shows an uncertain send without dispatching it again", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Single local synthetic fixture");
  await signIn(page, "panel");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
  await expect(page.getByLabel("Message")).toBeVisible();
  const conversationId = new URL(page.url()).pathname.split("/").at(-1)!;
  syntheticCleanup.push(conversationId);
  const detail = await page.request.get(`/api/conversations/${conversationId}`);
  const nativeId = (await detail.json() as { data: { eveSessionId: string } }).data.eveSessionId;
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const session = await getCurrentSession(new Request("http://127.0.0.1:3000", { headers: { cookie } }));
  if (!session) throw new Error("Synthetic session missing");
  const requestKey = randomUUID();
  const prepared = await prepareAttempt(session, conversationId, nativeId, requestKey, "Synthetic uncertain");
  await claimDispatch(session, conversationId, prepared.attemptId, 0);
  await markDispatchUncertain(session, conversationId, prepared.attemptId);
  await page.reload();
  await expect(page.getByText("Dispatch outcome is being reconciled. The message was not sent again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("a cancelled response stays visibly interrupted after reload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Single local synthetic fixture");
  await signIn(page, "panel");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
  const conversationId = new URL(page.url()).pathname.split("/").at(-1)!;
  syntheticCleanup.push(conversationId);
  const detail = await page.request.get(`/api/conversations/${conversationId}`);
  const nativeId = (await detail.json() as { data: { eveSessionId: string } }).data.eveSessionId;
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const session = await getCurrentSession(new Request("http://127.0.0.1:3000", { headers: { cookie } }));
  if (!session) throw new Error("Synthetic session missing");
  const prepared = await prepareAttempt(session, conversationId, nativeId, randomUUID(), "Synthetic cancelled");
  await claimDispatch(session, conversationId, prepared.attemptId, 0);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("UPDATE response_attempts SET response_state = 'cancelled' WHERE id = $1",
      [prepared.attemptId]);
  } finally { await client.end(); }
  await page.reload();
  await expect(page.getByText("Response cancelled. Partial output may be visible.")).toBeVisible();
  await expect(page.getByText("Response complete.")).toHaveCount(0);
});

test("an unconfirmed deadline remains blocked and visible after reload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Single local synthetic fixture");
  await signIn(page, "panel");
  await page.goto("/s");
  await page.getByLabel("Customer").selectOption({ label: "Cedar (synthetic)" });
  await page.getByRole("button", { name: "Start chat" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+$/);
  const conversationId = new URL(page.url()).pathname.split("/").at(-1)!;
  syntheticCleanup.push(conversationId);
  const detail = await page.request.get(`/api/conversations/${conversationId}`);
  const nativeId = (await detail.json() as { data: { eveSessionId: string } }).data.eveSessionId;
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const session = await getCurrentSession(new Request("http://127.0.0.1:3000", { headers: { cookie } }));
  if (!session) throw new Error("Synthetic session missing");
  const prepared = await prepareAttempt(session, conversationId, nativeId, randomUUID(), "Synthetic unconfirmed");
  await claimDispatch(session, conversationId, prepared.attemptId, 0);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE watchdog_jobs SET state = 'needs_attention', failure_count = 5,
      last_error_code = 'native_generation_unavailable' WHERE attempt_id = $1`,
    [prepared.attemptId]);
  } finally { await client.end(); }
  await page.reload();
  await expect(page.getByText(/operator must review this turn/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});
