import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { Client } from "pg";
import { webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { unknownQualityInput } from "../lib/contracts/profiles";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--disposable" || args[1] !== "--container" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(args[2])) {
  throw new Error("Use --disposable --container <local-postgres-container>");
}
const container = args[2];
const sourceUrl = new URL(requireTestDatabaseUrl());
const sourceDatabase = decodeURIComponent(sourceUrl.pathname.slice(1));
const username = decodeURIComponent(sourceUrl.username);
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("Local setup database required");
const setupUrl = new URL(process.env.DATABASE_URL_UNPOOLED);
if (!(["127.0.0.1", "localhost"].includes(setupUrl.hostname))) {
  throw new Error("Local setup database required");
}
const setupUser = decodeURIComponent(setupUrl.username);
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(sourceDatabase) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(setupUser)) throw new Error("Invalid local database identifier");
const cloneName = `turas_bench_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const cloneUrl = new URL(sourceUrl);
cloneUrl.pathname = `/${cloneName}`;
let cloned = false;
let next: ChildProcess | undefined;
let browser: Browser | undefined;
const contexts: BrowserContext[] = [];
let database: Client | undefined;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!port) throw new Error("No local port available");
  return port;
}

type Customer = { id: string; name: string };
async function seed(client: Client): Promise<Customer[]> {
  const customers = Array.from({ length: 100 }, (_, index) => ({
    id: randomUUID(), name: `Synthetic benchmark customer ${String(index + 1).padStart(3, "0")}`,
  }));
  const records: Array<{ id: string; customerId: string; kind: string; canonicalKey: string | null }> = [];
  const revisions: Array<{ id: string; recordId: string; customerId: string; payload: object;
    digest: string }> = [];
  const observedAt = "2026-09-01T00:00:00Z";
  await client.query("BEGIN");
  try {
    await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
      SELECT id,$2,name,true FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text)`,
    [JSON.stringify(customers), DEMO_IDS.workspace]);
    await client.query(`INSERT INTO customer_grants
      (id,membership_id,workspace_id,customer_id,state,revision,granted_by)
      SELECT gen_random_uuid(),$2,$3,id,'active',1,$4
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text)`,
    [JSON.stringify(customers.slice(0, 20)), DEMO_IDS.partnerMembership,
      DEMO_IDS.workspace, DEMO_IDS.mcteer]);
    for (const customer of customers) {
      const payloads: Array<{ kind: string; canonicalKey: string | null; payload: object }> = [
        { kind: "customer_details", canonicalKey: "customer_details",
          payload: { kind: "customer_details", displayName: customer.name } },
        ...Array.from({ length: 5 }, (_, index) => ({ kind: "product_use",
          canonicalKey: `product-${index + 1}`,
          payload: { kind: "product_use", productKey: `product-${index + 1}`,
            displayName: `Synthetic product ${index + 1}`, state: "actual",
            usageDescription: "Synthetic benchmark deployment", observedAt } })),
        ...Array.from({ length: 5 }, (_, index) => ({ kind: "risk", canonicalKey: null,
          payload: { kind: "risk", category: `Synthetic delivery risk ${index + 1}`,
            description: "A fictional delivery risk", owner: "Synthetic owner",
            likelihood: 2, impact: 2, severity: "low",
            severityRationale: "Synthetic benchmark only", mitigation: "Review the risk",
            status: "open", observedAt } })),
        ...Array.from({ length: 5 }, (_, index) => ({ kind: "engagement_reference", canonicalKey: null,
          payload: { kind: "engagement_reference", title: `Synthetic engagement ${index + 1}`,
            timing: "current", deliveryPhase: "discovery" } })),
        ...Array.from({ length: 9 }, (_, index) => ({ kind: "claim", canonicalKey: null,
          payload: { kind: "claim", text: `Synthetic delivery note ${index + 1}`,
            sourceType: "manual" } })),
      ];
      for (const item of payloads) {
        const recordId = randomUUID();
        records.push({ id: recordId, customerId: customer.id, kind: item.kind,
          canonicalKey: item.canonicalKey });
        revisions.push({ id: randomUUID(), recordId, customerId: customer.id,
          payload: item.payload,
          digest: createHash("sha256").update(JSON.stringify(item.payload)).digest("hex") });
      }
    }
    if (records.length !== 2_500 || revisions.length !== 2_500) throw new Error("Bad benchmark fixture size");
    await client.query(`INSERT INTO profile_records
      (id,workspace_id,customer_id,kind,canonical_key,created_by,candidate_sequence)
      SELECT id,$2,customer_id,kind,canonical_key,$3,1
      FROM jsonb_to_recordset($1::jsonb)
      AS x(id uuid,customer_id uuid,kind text,canonical_key text)`,
    [JSON.stringify(records.map((row) => ({ id: row.id, customer_id: row.customerId,
      kind: row.kind, canonical_key: row.canonicalKey }))), DEMO_IDS.workspace,
      DEMO_IDS.panelMembership]);
    await client.query(`INSERT INTO profile_revisions
      (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
       payload,quality_input,author_membership_id,origin,audience,data_category,
       content_digest,submission_channel)
      SELECT id,record_id,$2,customer_id,1,'profile-payload-v1',payload,$3::jsonb,$4,
        'authorized_system','delivery','delivery_context',digest,'synthetic_bootstrap'
      FROM jsonb_to_recordset($1::jsonb)
      AS x(id uuid,record_id uuid,customer_id uuid,payload jsonb,digest text)`,
    [JSON.stringify(revisions.map((row) => ({ id: row.id, record_id: row.recordId,
      customer_id: row.customerId, payload: row.payload, digest: row.digest }))),
      DEMO_IDS.workspace, JSON.stringify(unknownQualityInput), DEMO_IDS.panelMembership]);
    await client.query(`UPDATE profile_records r SET current_accepted_revision_id=v.id,version=1
      FROM profile_revisions v WHERE v.record_id=r.id AND r.customer_id=ANY($1::uuid[])`,
    [customers.map((customer) => customer.id)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  return customers;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? NaN;
}

try {
  const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", username,
    "-d", sourceDatabase, "-Fc", "--no-owner", "--no-acl"],
  { maxBuffer: 100 * 1024 * 1024 });
  execFileSync("docker", ["exec", container, "createdb", "-U", setupUser,
    "-O", username, cloneName]);
  cloned = true;
  execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", username,
    "-d", cloneName, "--no-owner", "--no-acl"],
  { input: dump, maxBuffer: 10 * 1024 * 1024 });
  database = new Client({ connectionString: cloneUrl.toString() });
  await database.connect();
  const marker = await database.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1");
  if (marker.rows[0]?.environment_id !== process.env.TURAS_TEST_ENVIRONMENT_ID) {
    throw new Error("Cloned test environment marker mismatch");
  }
  const customers = await seed(database);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: cloneUrl.toString(),
      DATABASE_URL_UNPOOLED: cloneUrl.toString(),
      TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID,
      TURAS_APP_ORIGIN: origin },
  });
  let webOutput = "";
  const capture = (chunk: Buffer) => { webOutput = (webOutput + chunk.toString("utf8")).slice(-2_000); };
  next.stdout?.on("data", capture);
  next.stderr?.on("data", capture);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (next.exitCode !== null) throw new Error(`Isolated web server exited: ${webOutput}`);
    try {
      const ready = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1_000) });
      if (ready.ok) break;
    } catch { /* startup */ }
    if (attempt === 59) throw new Error(`Isolated web server did not start: ${webOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  browser = await webkit.launch({ headless: true });
  const identities = [
    ...Array(4).fill({ name: "panel", password: process.env.PANEL_PASSWORD, partner: false }),
    ...Array(4).fill({ name: "mcteer", password: process.env.TURAS_DEMO_PASSWORD, partner: false }),
    ...Array(2).fill({ name: "partner", password: process.env.PARTNER_PASSWORD, partner: true }),
  ] as Array<{ name: string; password: string | undefined; partner: boolean }>;
  const sessions: Array<{ page: Page; partner: boolean }> = [];
  for (const identity of identities) {
    if (!identity.password) throw new Error(`Missing ${identity.name} test credential`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.getByLabel("Username").fill(identity.name);
    await page.getByLabel("Password").fill(identity.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${origin}/s`, { timeout: 10_000 });
    sessions.push({ page, partner: identity.partner });
  }
  const timings: number[] = [];
  let errors = 0;
  let unauthorizedRows = 0;
  const sampleErrors: string[] = [];
  async function open(session: typeof sessions[number], customer: Customer, measured: boolean) {
    const start = performance.now();
    try {
      const response = session.page.waitForResponse((item) =>
        item.url().includes(`/api/customers/${customer.id}/profile`), { timeout: 10_000 });
      await session.page.goto(`${origin}/customers/${customer.id}`,
        { waitUntil: "domcontentloaded", timeout: 10_000 });
      const payload = await (await response).json() as { data?: { acceptedFacts?: unknown[] } };
      await session.page.getByRole("heading", { level: 1, name: customer.name, exact: true })
        .waitFor({ state: "visible", timeout: 10_000 });
      const cards = await session.page.locator(".profile-grid .profile-card").count();
      if (payload.data?.acceptedFacts?.length !== 25 || cards !== 25) unauthorizedRows++;
      if (measured) timings.push(performance.now() - start);
    } catch (error) {
      errors++;
      if (sampleErrors.length < 5) sampleErrors.push(String(error).slice(0, 300));
    }
  }
  for (let second = -30; second < 120; second++) {
    const start = performance.now();
    await Promise.all(sessions.map((session, slot) => {
      const available = session.partner ? customers.slice(0, 20) : customers;
      const customer = available[(second + 30 + slot * 13) % available.length];
      return open(session, customer, second >= 0);
    }));
    if (second === -30 && errors) throw new Error(`Benchmark warmup failed: ${sampleErrors.join(" | ")}`);
    if ((second + 31) % 30 === 0) console.log(JSON.stringify({ elapsedSeconds: second + 31,
      measuredOpens: timings.length, errors, unauthorizedRows, sampleErrors }));
    const remaining = 1_000 - (performance.now() - start);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  const result = { environment: marker.rows[0].environment_id,
    profiles: customers.length, recordsPerProfile: 25,
    sessions: sessions.length, panelSessions: 4, adminSessions: 4, partnerSessions: 2,
    warmupSeconds: 30, measuredSeconds: 120, measuredOpens: timings.length,
    p50Ms: Math.round(percentile(timings, .5)), p95Ms: Math.round(percentile(timings, .95)),
    errors, unauthorizedRows };
  console.log(JSON.stringify(result));
  if (timings.length !== 1_200 || result.p95Ms >= 2_000 || errors || unauthorizedRows) {
    process.exitCode = 1;
  }
} finally {
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (next && next.exitCode === null) {
    next.kill("SIGTERM");
    await Promise.race([new Promise<void>((resolve) => next!.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
    if (next.exitCode === null) next.kill("SIGKILL");
  }
  await database?.end().catch(() => undefined);
  if (cloned) execFileSync("docker", ["exec", container, "dropdb", "-U", setupUser, cloneName]);
}
