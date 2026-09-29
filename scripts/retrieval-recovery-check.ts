import { execFileSync,spawnSync } from "node:child_process";
import { createHash,randomUUID } from "node:crypto";
import { mkdir,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { Client,Pool } from "pg";
import { runner } from "node-pg-migrate";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { withRetrievalEvalEnvironment } from "./retrieval-eval-environment";
import { enqueueRetrievalJob,claimRetrievalJobs,finishRetrievalJob,
  reserveEmbeddingOperation,markEmbeddingDispatched } from "../lib/server/retrieval/jobs";

const args = process.argv.slice(2);
if (args[0] !== "--disposable" ||
    !(args.length === 1 || (args.length === 3 && args[1] === "--container" &&
      /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(args[2])))) {
  throw new Error("Use --disposable for Neon or --disposable --container <local-postgres-container>");
}
const container = args[2];
const sourceUrl = new URL(requireTestDatabaseUrl());
const neon = sourceUrl.hostname.endsWith(".neon.tech");
if (neon === Boolean(container)) throw new Error("Recovery mode must match the selected test database");
const name = decodeURIComponent(sourceUrl.pathname.slice(1));
const user = decodeURIComponent(sourceUrl.username || "postgres");
if (!/^turas_test_[a-z0-9_]+$/.test(name) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) {
  throw new Error("Unsupported disposable database identity");
}
const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
const adminUrl = neon ? new URL(process.env.DATABASE_URL_UNPOOLED ?? "") : null;
if (adminUrl && (adminUrl.hostname !== sourceUrl.hostname ||
    adminUrl.username !== sourceUrl.username ||
    adminUrl.password !== sourceUrl.password ||
    adminUrl.pathname === sourceUrl.pathname)) {
  throw new Error("Neon recovery requires the selected Preview owner endpoint");
}
const suffix = randomUUID().replaceAll("-","").slice(0,8);
const emptyName = `turas_test_005_upgrade_${suffix}`;
const restoreName = `turas_test_005_restore_${suffix}`;
const temp = await mkdtemp(join(tmpdir(),"turas-005-restore-"));
const created: string[] = [];
const urlFor = (database: string) => {
  const url = new URL(sourceUrl);
  url.pathname = `/${database}`;
  return url.toString();
};
const docker = (input: string[],options: { input?: Buffer } = {}) =>
  execFileSync("docker",input,{ input: options.input,maxBuffer: 100*1024*1024,
    stdio: ["pipe","pipe","pipe"] });
async function createDatabase(database: string,template?: string) {
  if (!adminUrl) {
    docker(["exec",container,"createdb","-U",user,database]);
    return;
  }
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    for (let attempt = 0;attempt < 20;attempt += 1) {
      try {
        await client.query(`CREATE DATABASE ${database}${template ? ` TEMPLATE ${template}` : ""}`);
        return;
      } catch (error) {
        if ((error as { code?: string }).code !== "55006" || attempt === 19) throw error;
        await new Promise((wait) => setTimeout(wait,500));
      }
    }
  } finally { await client.end(); }
}
async function dropDatabase(database: string) {
  if (!adminUrl) {
    docker(["exec",container,"dropdb","-U",user,"--if-exists",database]);
    return;
  }
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try { await client.query(`DROP DATABASE ${database} WITH (FORCE)`); }
  finally { await client.end(); }
}
function runRoles(database: string) {
  const result = spawnSync(process.execPath,["--experimental-strip-types","scripts/db-roles.ts"],{
    env: { ...process.env,DATABASE_URL_UNPOOLED: urlFor(database),
      TURAS_ENVIRONMENT_ID: marker },encoding: "utf8" });
  if (result.status !== 0) throw new Error("Disposable runtime grants failed");
}

async function check(database: string) {
  const client = new Client({ connectionString: urlFor(database) });
  await client.connect();
  try {
    const state = await client.query<{ environment_id: string;schema_version: number;
      vector_version: string;runtime_select: boolean;source_count: string }>(`
      SELECT e.environment_id,e.schema_version,
        (SELECT extversion FROM pg_extension WHERE extname='vector') AS vector_version,
        has_table_privilege('turas_runtime','retrieval_sources','SELECT') AS runtime_select,
        (SELECT count(*)::text FROM retrieval_sources) AS source_count
      FROM turas_environment e`);
    if (state.rows.length !== 1 || state.rows[0].environment_id !== marker ||
        state.rows[0].schema_version !== 28 ||
        state.rows[0].vector_version !== "0.8.6" || !state.rows[0].runtime_select) {
      throw new Error(`Restored or upgraded retrieval schema is not ready: ${JSON.stringify(state.rows)}`);
    }
    return Number(state.rows[0].source_count);
  } finally { await client.end(); }
}

try {
  const sourceCount = await check(name);
  await createDatabase(emptyName);
  created.push(emptyName);
  const empty = new Client({ connectionString: urlFor(emptyName) });
  await empty.connect();
  try {
    const base = { dbClient: empty,dir: resolve("migrations"),
      migrationsTable: "turas_migrations",ignorePattern: "manifest\\.json",
      direction: "up" as const,singleTransaction: true,
      advisoryLockMode: "wait" as const };
    await runner({ ...base,count: 1 });
    await empty.query("INSERT INTO turas_environment(environment_id,schema_version) VALUES($1,1)",
      [marker]);
    await runner({ ...base,count: 17 });
    await empty.query("UPDATE turas_environment SET schema_version=18 WHERE environment_id=$1",
      [marker]);
  } finally { await empty.end(); }
  const upgrade = spawnSync(process.execPath,["--experimental-strip-types","scripts/db-migrate.ts"],{
    env: { ...process.env,DATABASE_URL_UNPOOLED: urlFor(emptyName),
      TURAS_ENVIRONMENT_ID: marker },encoding: "utf8" });
  if (upgrade.status !== 0) throw new Error("Disposable 018→027 upgrade failed");
  runRoles(emptyName);
  const upgradedSources = await check(emptyName);

  const syntheticContent = Buffer.from("Synthetic 005 matched private-store restore fixture");
  const fixture = join(temp,"synthetic-private-store.bin");
  await writeFile(fixture,syntheticContent,{ mode: 0o600 });
  const storeDigest = createHash("sha256").update(await readFile(fixture)).digest("hex");
  if (neon) {
    await createDatabase(restoreName,name);
    created.push(restoreName);
  } else {
    await createDatabase(restoreName);
    created.push(restoreName);
    const dump = docker(["exec",container,"pg_dump","-U",user,"-d",name,
      "-Fc","--no-owner","--no-acl"]);
    docker(["exec","-i",container,"pg_restore","-U",user,"-d",restoreName,
      "--no-owner","--no-acl"],{ input: dump });
  }
  runRoles(restoreName);
  const restoredSources = await check(restoreName);
  if (restoredSources !== sourceCount ||
      createHash("sha256").update(await readFile(fixture)).digest("hex") !== storeDigest) {
    throw new Error("Matched disposable restore differs from snapshot");
  }
  // Closing and reopening is the process restart boundary for the restored DB.
  if (await check(restoreName) !== sourceCount) throw new Error("Restored restart check failed");
  const nativeRestart = await withRetrievalEvalEnvironment(async (control) => {
    let phase = "login";
    try {
    const origin = control.origin;
    const signedIn = await fetch(`${origin}/api/auth/login`,{ method: "POST",
      headers: { origin,"content-type": "application/json" },
      body: JSON.stringify({ username: process.env.TURAS_DEMO_USERNAME,
        password: process.env.TURAS_DEMO_PASSWORD }) });
    if (!signedIn.ok) throw new Error("Disposable recovery login failed");
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf = (await signedIn.json() as { data?: { csrfToken?: string } })
      .data?.csrfToken ?? "";
    if (!cookie || !csrf) throw new Error("Disposable recovery session missing");
    const headers = { cookie,origin,"content-type": "application/json",
      "x-csrf-token": csrf };
    const operationId = randomUUID();
    phase = "conversation";
    const created = await fetch(`${origin}/api/conversations`,{ method: "POST",headers,
      body: JSON.stringify({ customerId: DEMO_IDS.sharedCustomer,
        requestKey: operationId,title: "Synthetic recovery session" }) });
    if (created.status !== 201) throw new Error("Disposable recovery conversation failed");
    const conversationId = (await created.json() as { data: { id: string } }).data.id;
    let nativeId = "";
    phase = "native binding";
    for (let attempt = 0;attempt < 5;attempt += 1) {
      const bound = await fetch(`${origin}/eve/v1/session`,{ method: "POST",
        headers: { ...headers,"x-turas-conversation-id": conversationId },
        body: JSON.stringify({ operationId }),signal: AbortSignal.timeout(10_000) });
      if (bound.ok) {
        nativeId = (await bound.json() as { sessionId: string }).sessionId;
        break;
      }
      if (bound.status !== 409) throw new Error("Disposable native binding failed");
      await new Promise((wait) => setTimeout(wait,1_000));
    }
    if (!nativeId) throw new Error("Disposable native binding unavailable");
    phase = "stop isolated app";
    await control.stop();
    const probeDir = join(control.storeRoot,"objects");
    phase = "pair snapshot";
    await mkdir(probeDir,{ recursive: true,mode: 0o700 });
    const probePath = join(probeDir,`recovery-${suffix}.bin`);
    await writeFile(probePath,syntheticContent,{ mode: 0o600 });
    const probeDigest = createHash("sha256").update(syntheticContent).digest("hex");
    const disposablePool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED,
      max: 1 });
    const disposable = await disposablePool.connect();
    try {
      await disposable.query(`CREATE TABLE recovery_pair_probe
        (conversation_id uuid PRIMARY KEY,object_digest text NOT NULL)`);
      await disposable.query(`INSERT INTO recovery_pair_probe(conversation_id,object_digest)
        VALUES($1,$2)`,[conversationId,probeDigest]);
      await disposable.query(`UPDATE retrieval_jobs SET state='failed',lease_token=NULL,
        lease_started_at=NULL,lease_until=NULL,
        last_error_code='disposable_recovery_excluded'
        WHERE environment_id=$1 AND state IN ('queued','leased')`,[marker]);
      const sourceId = randomUUID();
      phase = "lease source";
      await disposable.query(`INSERT INTO retrieval_sources
        (id,environment_id,workspace_id,customer_id,scope,source_kind,
         source_revision_id,audience,projection_contract,contract_digest,
         source_generation,content_digest)
        VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal',
          'recovery-v1',$6,1,$7)`,[sourceId,marker,DEMO_IDS.workspace,
        DEMO_IDS.sharedCustomer,randomUUID(),"a".repeat(64),"b".repeat(64)]);
      phase = "lease enqueue";
      const jobId = await enqueueRetrievalJob(disposable,sourceId,"index",marker);
      phase = "lease claim";
      const [claim] = await claimRetrievalJobs(1,disposable,marker);
      if (!jobId || claim?.id !== jobId) throw new Error("Recovery lease claim unavailable");
      await disposable.query(`UPDATE retrieval_jobs SET
        lease_started_at=now()-interval '31 seconds',
        lease_until=now()-interval '1 second'
        WHERE id=$1`,[jobId]);
      if (await finishRetrievalJob(disposable,claim,"completed")) {
        throw new Error("Expired recovery lease committed");
      }
      phase = "ambiguous paid replay";
      const paid = await reserveEmbeddingOperation(disposable,{
        jobId,operationKey: `recovery-${suffix}`,inputCharacters: 16,
        modelId: "openai/text-embedding-3-small" });
      if (!await markEmbeddingDispatched(disposable,paid.id) ||
          (await claimRetrievalJobs(1,disposable,marker)).length) {
        throw new Error("Ambiguous recovery paid work was redispatched");
      }
      const job = await disposable.query<{ state: string }>(
        `SELECT state FROM retrieval_jobs WHERE id=$1`,[jobId]);
      if (job.rows[0]?.state !== "unconfirmed") {
        throw new Error("Ambiguous recovery job was not quarantined");
      }
    } finally { disposable.release();await disposablePool.end(); }
    phase = "restart";
    await control.start();
    phase = "pair verification";
    const restored = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
    await restored.connect();
    try {
      const row = await restored.query<{ eve_session_id: string;object_digest: string }>(`
        SELECT conversation.eve_session_id,probe.object_digest
        FROM recovery_pair_probe probe JOIN conversations conversation
          ON conversation.id=probe.conversation_id
        WHERE probe.conversation_id=$1`,[conversationId]);
      if (row.rows[0]?.eve_session_id !== nativeId ||
          row.rows[0]?.object_digest !== probeDigest ||
          createHash("sha256").update(await readFile(probePath)).digest("hex") !== probeDigest) {
        throw new Error("Disposable database/store/native pair changed across restart");
      }
    } finally { await restored.end(); }
    phase = "history";
    const history = await fetch(`${origin}/api/conversations/${conversationId}`,{
      headers: { cookie },cache: "no-store" });
    if (!history.ok) throw new Error("Restored conversation unavailable");
    phase = "native stream";
    const stream = await fetch(`${origin}/eve/v1/session/${nativeId}/stream?startIndex=-1&includeTailIndex=1`,{
      headers: { cookie },signal: AbortSignal.timeout(15_000) });
    if (!stream.ok) throw new Error("Restored native stream unavailable");
    await stream.body?.cancel();
    phase = "rollback switch";
    const disabled = spawnSync(process.execPath,["--import","tsx",
      "scripts/check-retrieval.ts"],{
      cwd: resolve(),env: { ...process.env,TURAS_005_DISABLED: "1" },
      encoding: "utf8",timeout: 10_000 });
    if (disabled.status !== 0 ||
        !disabled.stdout?.includes('"intakeEnabled":false')) {
      throw new Error("Disposable rollback switch did not close intake");
    }
    return true;
    } catch (error) {
      const kind = error instanceof Error ? error.name : "unknown";
      const code = typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && /^[a-z0-9_]{2,40}$/i.test(error.code) ?
        error.code : "unknown";
      throw new Error(`Disposable native restart failed at ${phase} (${kind}/${code})`);
    }
  });
  console.log(JSON.stringify({ disposable: true,emptyUpgrade: "018-to-028",
    emptySources: upgradedSources,restoredSources,matchedSyntheticStore: true,
    restoredReconnect: true,nativeRestart,selectedApplicationResourcesTouched: false }));
} finally {
  for (const database of created.reverse()) {
    try { await dropDatabase(database); }
    catch { /* Leave a disposable clone for manual cleanup if a session holds it. */ }
  }
  await rm(temp,{ recursive: true,force: true });
}
