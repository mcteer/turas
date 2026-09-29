import { createHash,randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { Client } from "pg";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { requireUiFixtureDatabaseUrl,sanitizedScreenshot,signIn } from "../fixtures/ui";

async function visitAfterSignIn(page: Page,path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await page.goto(path); return; }
    catch (error) {
      if (attempt || !(error instanceof Error) ||
          !error.message.includes("interrupted by another navigation") ||
          new URL(page.url()).pathname !== "/s") throw error;
    }
  }
}

test("public research preview stays explicit in an owned synthetic chat",async ({ page },testInfo) => {
  await signIn(page,"mcteer");
  const db = new Client({ connectionString: requireUiFixtureDatabaseUrl() });
  await db.connect();
  const id = randomUUID();
  try {
    const cookie = (await page.context().cookies()).find((item) =>
      item.name === "turas_session" || item.name === "__Host-turas_session");
    if (!cookie) throw new Error("Synthetic browser session unavailable");
    const tokenHash = createHash("sha256").update(cookie.value).digest("hex");
    const session = await db.query<{ id: string }>(`SELECT id FROM login_sessions
      WHERE principal_id=$1 AND token_hash=$2 AND revoked_at IS NULL`,
    [DEMO_IDS.mcteer,tokenHash]);
    const state = await db.query<{ internal_generation: string }>(`
      SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1`,
    [DEMO_IDS.sharedCustomer]);
    expect(session.rows[0]).toBeTruthy();
    await db.query(`INSERT INTO conversations
      (id,environment_id,workspace_id,customer_id,owner_principal_id,
       eve_session_id,creation_operation_id,binding_state,title,
       context_snapshot_schema,context_login_session_id,context_membership_id,
       context_audience,context_generation,context_valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic research preview',
        'customer-context-v1',$8,$9,'internal',$10,now()+interval '1 hour')`,
    [id,process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace,
      DEMO_IDS.sharedCustomer,DEMO_IDS.mcteer,`synthetic_${randomUUID().replaceAll("-","")}`,
      randomUUID(),session.rows[0].id,DEMO_IDS.mcteerMembership,
      state.rows[0]?.internal_generation ?? 0]);
    await page.route("**/api/research/refresh?**",async (route) => {
      await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
        data: [{ sourceRevisionId: randomUUID(),title: "Synthetic public identity",
          dueAt: "2026-09-28T00:00:00.000Z",state: "due",
          publicUrl: "https://example.org/about",passageDigest: "a".repeat(64),
          mode: "recon",publicFields: { publicName: "Example Organization",
            publicDomain: "example.org",identityConfirmed: true } }],
      }) });
    });
    await visitAfterSignIn(page,`/s/${id}`);
    await page.getByRole("button",{ name: "Start public research" }).click();
    const panel = page.getByRole("region",{ name: "Public research" });
    await panel.getByRole("button",{ name: "Prepare refresh" }).click();
    await expect(panel.getByLabel("Mode")).toHaveValue("recon");
    await expect(panel.getByLabel("Public name")).toHaveValue("Example Organization");
    await expect(panel.getByLabel("Public domain")).toHaveValue("example.org");
    await panel.getByLabel("Mode").selectOption("practices");
    await expect(panel.getByLabel("Optional public HTTPS URLs")).toHaveValue("");
    await panel.getByLabel("Product",{ exact: true }).fill("Vercel");
    await panel.getByLabel("Version",{ exact: true }).fill("2026");
    await panel.getByLabel("Topic",{ exact: true }).fill("build cache");
    await page.route("**/api/research/requests",async (route) => {
      const input = route.request().postDataJSON() as Record<string,unknown>;
      expect(input).toMatchObject({ mode: "practices",product: "Vercel",
        version: "2026",topic: "build cache" });
      await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
        data: { id: randomUUID(),revision: 1,digest: "a".repeat(64),mode: "practices",
          publicFields: input,queries: ['"Vercel" "2026" "build cache" official documentation'],
          discoveryProvider: "Context.dev",destination: "public research provider",
          fetchScope: "public HTTPS/443",limits: { searches: 4,fetchAttempts: 8,
            wallSeconds: 120 } },
      }) });
    });
    await panel.getByRole("button",{ name: "Preview scope" }).click();
    await expect(panel.getByRole("region",{ name: "Research scope preview" }))
      .toContainText('"Vercel" "2026" "build cache" official documentation');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
      .toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    mkdirSync("local-artifacts/005",{ recursive: true });
    await sanitizedScreenshot(page,`local-artifacts/005/research-${testInfo.project.name}.png`);
  } finally {
    await db.query("DELETE FROM conversations WHERE id=$1",[id]).catch(() => undefined);
    await db.end();
  }
});

test("typed conflict review requires a separate decision reason",async ({ page },testInfo) => {
  const conflictId = randomUUID();
  let posted: Record<string,unknown> | undefined;
  await signIn(page,"mcteer");
  await page.route("**/api/research/conflicts?**",async (route) => {
    await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
      data: [{ id: conflictId,state: "flagged",version: 1,
        first: { kind: "accepted_profile",revisionId: randomUUID() },
        second: { kind: "verified_research",revisionId: randomUUID() },
        periodStart: "2026-01-01",periodEnd: "2026-09-28",
        rationale: "Synthetic contradiction for review" }],
    }) });
  });
  await page.route(`**/api/research/conflicts/${conflictId}/decisions`,async (route) => {
    posted = route.request().postDataJSON() as Record<string,unknown>;
    await route.fulfill({ status: 200,contentType: "application/json",
      body: JSON.stringify({ data: { state: "confirmed" } }) });
  });
  await visitAfterSignIn(page,`/customers/${DEMO_IDS.sharedCustomer}`);
  const section = page.getByRole("region",{ name: "Typed evidence conflicts" });
  const item = section.locator(".profile-card").filter({ hasText: "Synthetic contradiction for review" });
  await expect(item.getByRole("button",{ name: "Confirm conflict" })).toBeDisabled();
  await item.getByLabel("Decision reason").fill("Both synthetic revisions cover the same period");
  await item.getByRole("button",{ name: "Confirm conflict" }).click();
  await expect(section.getByRole("status")).toContainText("Conflict review saved");
  expect(posted).toMatchObject({ action: "confirm",expectedVersion: 1,
    rationale: "Both synthetic revisions cover the same period" });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  mkdirSync("local-artifacts/005",{ recursive: true });
  await sanitizedScreenshot(page,`local-artifacts/005/conflict-${testInfo.project.name}.png`);
});

test("keyboard cancellation retains only checked public findings",async ({ page },testInfo) => {
  await signIn(page,"mcteer");
  const db = new Client({ connectionString: requireUiFixtureDatabaseUrl() });
  await db.connect();
  const conversationId = randomUUID();
  const runId = randomUUID();
  const observationId = randomUUID();
  let cancelled = false;
  try {
    const cookie = (await page.context().cookies()).find((item) =>
      item.name === "turas_session" || item.name === "__Host-turas_session");
    if (!cookie) throw new Error("Synthetic browser session unavailable");
    const tokenHash = createHash("sha256").update(cookie.value).digest("hex");
    const session = await db.query<{ id: string }>(`SELECT id FROM login_sessions
      WHERE principal_id=$1 AND token_hash=$2 AND revoked_at IS NULL`,
    [DEMO_IDS.mcteer,tokenHash]);
    const state = await db.query<{ internal_generation: string }>(`
      SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1`,
    [DEMO_IDS.sharedCustomer]);
    if (!session.rows[0]) throw new Error("Synthetic browser binding unavailable");
    await db.query(`INSERT INTO conversations
      (id,environment_id,workspace_id,customer_id,owner_principal_id,
       eve_session_id,creation_operation_id,binding_state,title,
       context_snapshot_schema,context_login_session_id,context_membership_id,
       context_audience,context_generation,context_valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic cancelled research',
        'customer-context-v1',$8,$9,'internal',$10,now()+interval '1 hour')`,
    [conversationId,process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace,
      DEMO_IDS.sharedCustomer,DEMO_IDS.mcteer,
      `synthetic_${randomUUID().replaceAll("-","")}`,randomUUID(),
      session.rows[0].id,DEMO_IDS.mcteerMembership,
      state.rows[0]?.internal_generation ?? 0]);
    await page.route("**/api/research/requests",async (route) => route.fulfill({
      status: 200,contentType: "application/json",body: JSON.stringify({ data: {
        id: randomUUID(),revision: 1,digest: "a".repeat(64),mode: "practices",
        publicFields: { product: "Vercel",version: "2026",topic: "build cache" },
        queries: ['"Vercel" "2026" "build cache" official documentation'],
        discoveryProvider: "Context.dev",destination: "public research provider",
        fetchScope: "public HTTPS/443",limits: { searches: 4,fetchAttempts: 8,
          wallSeconds: 120 } } }) }));
    await page.route("**/api/research/requests/*/start",async (route) => route.fulfill({
      status: 200,contentType: "application/json",body: JSON.stringify({ data: {
        runId,requestKey: randomUUID(),message: "Synthetic admitted research turn" } }) }));
    await page.route(`**/api/research/runs/${runId}`,async (route) => route.fulfill({
      status: 200,contentType: "application/json",body: JSON.stringify({ data: {
        id: runId,state: cancelled ? "cancelled" : "running",mode: "practices",
        searchesUsed: 1,fetchesUsed: 1,safeReasonCode: cancelled ?
          "cancelled_by_owner" : null,retainedCitationIds: [observationId] } }) }));
    await page.route(`**/api/research/runs/${runId}/cancel`,async (route) => {
      cancelled = true;
      await route.fulfill({ status: 200,contentType: "application/json",
        body: JSON.stringify({ data: { runId,state: "cancelled" } }) });
    });
    await page.route(`**/api/research/runs/${runId}/findings`,async (route) => route.fulfill({
      status: 200,contentType: "application/json",body: JSON.stringify({ data: [{
        observationId,canonicalUrl: "https://vercel.com/docs/builds",
        title: "Synthetic checked public finding",
        verbatimPassage: "Vercel build cache guidance from a completed checked fetch.",
        origin: "independent_discovery",caveats: [],
        quality: { Q: 75,band: "usable" } }] }) }));
    await page.route(`**/api/conversations/${conversationId}/attempts/*`,async (route) =>
      route.fulfill({ status: 200,contentType: "application/json",
        body: JSON.stringify({ data: { dispatchState: "dispatched",
          responseState: cancelled ? "cancelled" : "running",watchdogState: null } }) }));
    await visitAfterSignIn(page,`/s/${conversationId}`);
    await page.getByRole("button",{ name: "Start public research" }).click();
    const panel = page.getByRole("region",{ name: "Public research" });
    await panel.getByLabel("Product",{ exact: true }).fill("Vercel");
    await panel.getByLabel("Version",{ exact: true }).fill("2026");
    await panel.getByLabel("Topic",{ exact: true }).fill("build cache");
    await panel.getByRole("button",{ name: "Preview scope" }).click();
    await panel.getByRole("button",{ name: "Confirm and start" }).click();
    const cancel = panel.getByRole("button",{ name: "Cancel research" });
    await expect(cancel).toBeVisible();
    await expect(cancel).toBeEnabled();
    await cancel.focus();
    await cancel.press("Enter");
    await expect.poll(() => cancelled).toBe(true);
    await expect(panel.getByRole("status").filter({ hasText: "Research: cancelled" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText("Synthetic checked public finding");
    await expect(panel).toContainText("Research did not complete fully");
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => ["critical","serious"].includes(item.impact ?? "")))
      .toEqual([]);
    mkdirSync("local-artifacts/005",{ recursive: true });
    await sanitizedScreenshot(page,`local-artifacts/005/research-cancel-${testInfo.project.name}.png`);
  } finally {
    await db.query("DELETE FROM conversations WHERE id=$1",[conversationId]).catch(() => undefined);
    await db.end();
  }
});
