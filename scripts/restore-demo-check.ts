import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { Client } from "pg";
import { getServerConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--disposable" || args[1] !== "--container" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(args[2])) {
  throw new Error("Use --disposable --container <local-postgres-container>");
}
const container = args[2];
const config = getServerConfig();
if (!config.DATABASE_URL_UNPOOLED) throw new Error("Migration database URL required");
const source = new URL(config.DATABASE_URL_UNPOOLED);
if (source.hostname !== "127.0.0.1" && source.hostname !== "localhost") {
  throw new Error("Restore check requires a local database");
}
const database = decodeURIComponent(source.pathname.slice(1));
const username = decodeURIComponent(source.username);
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username)) {
  throw new Error("Unsupported local database identifier");
}
const cloneName = `turas_restore_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const work = await mkdtemp(join(tmpdir(), "turas-restore-"));
const isolated = join(work, "isolated-app");
let cloned = false;
let isolatedEve: ChildProcess | undefined;
const sourceClient = new Client({ connectionString: config.DATABASE_URL_UNPOOLED });

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  if (!port) throw new Error("No isolated eve port available");
  return port;
}

async function startIsolatedEve(restoredUrl: URL): Promise<number> {
  const port = await freePort();
  isolatedEve = spawn(resolve("node_modules/.bin/eve"),
    ["dev", "--no-ui", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: isolated, env: { ...process.env, DATABASE_URL: restoredUrl.toString(),
        DATABASE_URL_UNPOOLED: restoredUrl.toString() }, stdio: ["ignore", "pipe", "pipe"],
    });
  await new Promise<void>((resolveReady, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Restored eve startup timed out")), 30_000);
    const observe = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-4_000);
      if (output.includes(`server listening at http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        resolveReady();
      }
    };
    isolatedEve!.stdout?.on("data", observe);
    isolatedEve!.stderr?.on("data", observe);
    isolatedEve!.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Restored eve exited before readiness"));
    });
  });
  return port;
}
try {
  await sourceClient.connect();
  const marker = await sourceClient.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1");
  if (marker.rows.length !== 1 || marker.rows[0].environment_id !== config.TURAS_ENVIRONMENT_ID) {
    throw new Error("Source environment marker mismatch");
  }
  const original = await sourceClient.query<{ id: string; eve_session_id: string;
    response_state: string; output_tokens: number; event_count: string }>(`
    SELECT a.id, c.eve_session_id, a.response_state, a.output_tokens,
      (SELECT count(*) FROM event_projections e WHERE e.conversation_id = c.id)::text AS event_count
    FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
    WHERE c.environment_id = $1 AND c.owner_principal_id = $2
      AND a.response_state = 'completed'
      AND c.eve_session_id IS NOT NULL
    ORDER BY a.created_at DESC LIMIT 1`, [config.TURAS_ENVIRONMENT_ID, DEMO_IDS.panel]);
  if (!original.rows[0]) throw new Error("No acknowledged completed synthetic turn to check");
  const originalProfile = await sourceClient.query<{ id: string; content_digest: string;
    record_id: string; version: string; source_count: string }>(`
    SELECT v.id,v.content_digest,r.id AS record_id,r.version,
      (SELECT count(*) FROM evidence_source_revisions WHERE customer_id=r.customer_id)::text AS source_count
    FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
    WHERE r.customer_id=$1 ORDER BY r.created_at,r.id LIMIT 1`, [DEMO_IDS.deniedCustomer]);
  if (!originalProfile.rows[0]) throw new Error("No accepted synthetic profile head to restore");
  const workflowSource = join(".eve", ".workflow-data");
  await stat(join(workflowSource, "runs", `${original.rows[0].eve_session_id}.json`));
  const appOrigin = new URL(config.TURAS_APP_ORIGIN);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(appOrigin.hostname)) {
    throw new Error("Restore check requires a local app origin");
  }
  const login = await fetch(new URL("/api/auth/login", appOrigin), {
    method: "POST", headers: { origin: appOrigin.origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "panel", password: config.PANEL_PASSWORD }),
  });
  if (!login.ok) throw new Error("Source app login required for restore check");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Source app did not issue a session");
  await mkdir(join(isolated, ".eve"), { recursive: true });
  await cp(workflowSource, join(isolated, ".eve", ".workflow-data"), { recursive: true });
  for (const name of ["agent", "lib", "migrations", "package.json", "tsconfig.json"]) {
    await cp(name, join(isolated, name), { recursive: true });
  }
  await symlink(resolve("node_modules"), join(isolated, "node_modules"));
  const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", username,
    "-d", database, "-Fc", "--no-owner", "--no-acl"], { maxBuffer: 100 * 1024 * 1024 });
  execFileSync("docker", ["exec", container, "createdb", "-U", username, cloneName]);
  cloned = true;
  execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", username,
    "-d", cloneName, "--no-owner", "--no-acl"], { input: dump, maxBuffer: 10 * 1024 * 1024 });
  const restoredUrl = new URL(config.DATABASE_URL_UNPOOLED);
  restoredUrl.pathname = `/${cloneName}`;
  const restored = new Client({ connectionString: restoredUrl.toString() });
  await restored.connect();
  try {
    const cloneMarker = await restored.query<{ environment_id: string }>(
      "SELECT environment_id FROM turas_environment LIMIT 1");
    const replayed = await restored.query<{ id: string; response_state: string;
      output_tokens: number; event_count: string }>(`
      SELECT a.id, a.response_state, a.output_tokens,
        (SELECT count(*) FROM event_projections e WHERE e.conversation_id = a.conversation_id)::text AS event_count
      FROM response_attempts a WHERE a.id = $1`, [original.rows[0].id]);
    if (cloneMarker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID ||
        replayed.rows[0]?.response_state !== "completed" ||
        replayed.rows[0].output_tokens !== original.rows[0].output_tokens ||
        replayed.rows[0].event_count !== original.rows[0].event_count) {
      throw new Error("Restored acknowledged turn differs from source");
    }
    const restoredProfile = await restored.query<{ id: string; content_digest: string;
      record_id: string; version: string; source_count: string }>(`
      SELECT v.id,v.content_digest,r.id AS record_id,r.version,
        (SELECT count(*) FROM evidence_source_revisions WHERE customer_id=r.customer_id)::text AS source_count
      FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
      WHERE r.id=$1`, [originalProfile.rows[0].record_id]);
    if (JSON.stringify(restoredProfile.rows[0]) !== JSON.stringify(originalProfile.rows[0])) {
      throw new Error("Restored accepted profile/source state differs from source");
    }
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/db-migrate.ts"], {
      cwd: resolve(), env: { ...process.env,
        DATABASE_URL_UNPOOLED: restoredUrl.toString(), DATABASE_URL: restoredUrl.toString() },
      timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
    });
    const reapplied = await restored.query<{ id: string; content_digest: string }>(
      "SELECT id,content_digest FROM profile_revisions WHERE id=$1", [originalProfile.rows[0].id]);
    if (reapplied.rows[0]?.content_digest !== originalProfile.rows[0].content_digest) {
      throw new Error("Migration reapplication changed restored profile history");
    }
    await restored.query("BEGIN");
    try {
      await restored.query("SAVEPOINT immutable_profile_check");
      let immutable = false;
      try {
        await restored.query("UPDATE profile_revisions SET payload=payload WHERE id=$1",
          [originalProfile.rows[0].id]);
      } catch { immutable = true; }
      await restored.query("ROLLBACK TO SAVEPOINT immutable_profile_check");
      if (!immutable) throw new Error("Restored profile revisions are mutable");
    } finally { await restored.query("ROLLBACK"); }
    await stat(join(isolated, ".eve", ".workflow-data", "runs", `${original.rows[0].eve_session_id}.json`));
    const port = await startIsolatedEve(restoredUrl);
    const native = await fetch(`http://127.0.0.1:${port}/eve/v1/session/${original.rows[0].eve_session_id}/stream?startIndex=0`,
      { headers: { cookie }, signal: AbortSignal.timeout(5_000) });
    if (native.status !== 409) {
      throw new Error(`Restored older-session native replay was not fenced (${native.status})`);
    }
    await native.body?.cancel();
    console.log(JSON.stringify({ restored: true, acknowledgedAttempt: original.rows[0].id,
      projectedEvents: Number(original.rows[0].event_count), workflowRunPresent: true,
      nativeReplaySessionBound: true, profileHeadPreserved: true,
      migrationsReapplied: true,
      profileSourceCount: Number(originalProfile.rows[0].source_count),
      profileRevisionImmutable: true }));
  } finally { await restored.end(); }
} finally {
  if (isolatedEve && isolatedEve.exitCode === null) {
    isolatedEve.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolveExit) => isolatedEve!.once("exit", () => resolveExit())),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
    ]);
    if (isolatedEve.exitCode === null) isolatedEve.kill("SIGKILL");
  }
  await sourceClient.end().catch(() => undefined);
  if (cloned) execFileSync("docker", ["exec", container, "dropdb", "-U", username, cloneName]);
  await rm(work, { recursive: true, force: true });
}
