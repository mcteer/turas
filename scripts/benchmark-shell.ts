import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { getServerConfig } from "../lib/server/config";

const config = getServerConfig();
const origin = new URL(config.TURAS_APP_ORIGIN);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Benchmark requires a local app origin");
}
const marker = `Benchmark ${randomUUID()}`;
const db = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5_000 });
let connected = false;
const owners = [
  { name: "mcteer", id: DEMO_IDS.mcteer, count: 400, password: config.TURAS_DEMO_PASSWORD },
  { name: "panel", id: DEMO_IDS.panel, count: 400, password: config.PANEL_PASSWORD },
  { name: "partner", id: DEMO_IDS.partner, count: 200, password: config.PARTNER_PASSWORD },
] as const;

type ClientSession = { name: string; ownerId: string; cookie: string };
const timings = { customers: [] as number[], conversations: [] as number[] };
let errors = 0;

async function login(name: string, password: string): Promise<string> {
  const response = await fetch(new URL("/api/auth/login", origin), {
    method: "POST", headers: { origin: origin.origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }),
  });
  if (!response.ok) throw new Error(`Benchmark login failed for ${name}: ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Login cookie missing");
  return cookie;
}

async function request(session: ClientSession, endpoint: "customers" | "conversations", record: boolean) {
  const start = performance.now();
  try {
    const response = await fetch(new URL(endpoint === "customers"
      ? "/api/customers?limit=25" : "/api/conversations?limit=25", origin), {
      headers: { cookie: session.cookie }, signal: AbortSignal.timeout(5_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const body = await response.json() as { data?: { items?: Array<Record<string, unknown>> } };
    const items = body.data?.items;
    if (!Array.isArray(items) || items.length > 25) throw new Error("Invalid page");
    if (endpoint === "conversations" && items.some((item) => item.ownerPrincipalId !== session.ownerId)) {
      throw new Error("Unauthorized conversation row");
    }
    if (endpoint === "customers" && session.name === "partner" &&
        items.some((item) => item.id !== DEMO_IDS.sharedCustomer)) {
      throw new Error("Unauthorized customer row");
    }
    if (record) timings[endpoint].push(performance.now() - start);
  } catch { errors += 1; }
}

function p95(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

try {
  await db.connect();
  connected = true;
  const environment = await db.query<{ environment_id: string }>("SELECT environment_id FROM turas_environment LIMIT 1");
  if (environment.rows.length !== 1 || environment.rows[0].environment_id !== config.TURAS_ENVIRONMENT_ID) {
    throw new Error("Environment marker mismatch");
  }
  await db.query("BEGIN");
  try {
    for (const owner of owners) {
      for (let index = 0; index < owner.count; index++) {
        await db.query(`INSERT INTO conversations
          (id,environment_id,workspace_id,customer_id,owner_principal_id,
           creation_operation_id,binding_state,title)
          VALUES ($1,$2,$3,$4,$5,$6,'unbound',$7)`,
        [randomUUID(), config.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace,
          DEMO_IDS.sharedCustomer, owner.id, randomUUID(), `${marker} ${index}`]);
      }
    }
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  const sessions: ClientSession[] = [];
  for (const [ownerIndex, count] of [7, 7, 6].entries()) {
    for (let index = 0; index < count; index++) {
      const owner = owners[ownerIndex];
      sessions.push({ name: owner.name, ownerId: owner.id,
        cookie: await login(owner.name, owner.password) });
    }
  }
  for (let second = -30; second < 120; second++) {
    const start = performance.now();
    const record = second >= 0;
    await Promise.all(sessions.flatMap((session) => [
      request(session, "customers", record), request(session, "conversations", record),
    ]));
    const remaining = 1_000 - (performance.now() - start);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  const result = { environment: config.TURAS_ENVIRONMENT_ID, seeded: 1_000,
    sessions: sessions.length, warmupSeconds: 30, measuredSeconds: 120,
    customerRequests: timings.customers.length, conversationRequests: timings.conversations.length,
    customerP95Ms: Math.round(p95(timings.customers)),
    conversationP95Ms: Math.round(p95(timings.conversations)), errors };
  console.log(JSON.stringify(result));
  if (errors || result.customerP95Ms > 2_000 || result.conversationP95Ms > 2_000 ||
      result.customerRequests !== 2_400 || result.conversationRequests !== 2_400) {
    process.exitCode = 1;
  }
} finally {
  if (connected) {
    await db.query("DELETE FROM conversations WHERE title LIKE $1", [`${marker}%`]);
    await db.end();
  }
}
