import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client, Pool } from "pg";
import { getServerConfig, parseArtifactStoreConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";

const arguments_ = process.argv.slice(2);
const container = arguments_.length === 2 && arguments_[0] === "--container" ?
  arguments_[1] : "turas-002-postgres";
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(container)) {
  throw new Error("A local PostgreSQL container name is required");
}
const config = getServerConfig();
const source = new URL(config.DATABASE_URL_UNPOOLED);
const runtimeSource = new URL(config.DATABASE_URL);
if (!["localhost","127.0.0.1"].includes(source.hostname) ||
    !["localhost","127.0.0.1"].includes(runtimeSource.hostname) ||
    source.pathname !== runtimeSource.pathname) {
  throw new Error("Recovery check requires one local source database");
}
const username = decodeURIComponent(source.username);
const database = decodeURIComponent(source.pathname.slice(1));
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)) {
  throw new Error("Unsupported local database identifier");
}
process.env.TURAS_ARTIFACT_STORE_ROOT ??= resolve("local-artifacts/004/store");
const sourceStore = parseArtifactStoreConfig(process.env).root;
const sourceClient = new Client({ connectionString: source.toString() });
await sourceClient.connect();
try {
  const marker = await sourceClient.query<{ schema_version: number; environment_id: string }>(
    "SELECT schema_version,environment_id FROM turas_environment");
  if (marker.rows.length !== 1 || marker.rows[0].environment_id !== config.TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version !== 13) {
    throw new Error("Recovery check requires the untouched local schema 013 baseline");
  }
} finally { await sourceClient.end(); }

const work = await mkdtemp(resolve("local-artifacts/004/recovery-"));
const cloneName = `turas_recovery_${randomUUID().replaceAll("-","").slice(0,12)}`;
const cloneOwner = new URL(source);
const cloneRuntime = new URL(runtimeSource);
cloneOwner.pathname = `/${cloneName}`;
cloneRuntime.pathname = `/${cloneName}`;
const clonedStore = join(work,"store");
let created = false;
let worker: ChildProcess | null = null;
let pool: Pool | null = null;
let owner: Client | null = null;
let finalCode: string | null = null;
const environment = { ...process.env,DATABASE_URL: cloneRuntime.toString(),
  DATABASE_URL_UNPOOLED: cloneOwner.toString(),TURAS_ENVIRONMENT_ID: config.TURAS_ENVIRONMENT_ID,
  TURAS_ARTIFACT_STORE_ROOT: clonedStore };

function runScript(name: string): void {
  execFileSync(process.execPath,["--env-file-if-exists=.env.local","--import","tsx",name],{
    cwd: resolve(),env: environment,stdio: ["ignore","pipe","pipe"],timeout: 60_000,
  });
}
function startWorker(): ChildProcess {
  const child = spawn(resolve("node_modules/.bin/tsx"),["scripts/artifact-worker.ts"],{
    cwd: resolve(),env: environment,stdio: ["ignore","pipe","pipe"],
  });
  child.stdout?.resume(); child.stderr?.resume();
  return child;
}
async function stopWorker(): Promise<void> {
  const child = worker;
  worker = null;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); },5_000);
    child.once("exit",() => { clearTimeout(timer); resolveStop(); });
    child.kill("SIGTERM");
  });
}
async function until(check: () => Promise<boolean>,label: string,limitMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now()-started < limitMs) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait,500));
  }
  throw new Error(`${label} did not converge within ${limitMs} ms`);
}

try {
  await cp(sourceStore,clonedStore,{ recursive: true,force: false });
  const marker = JSON.parse(await readFile(join(clonedStore,".turas-artifact-store.json"),"utf8")) as {
    environmentId?: string };
  if (marker.environmentId !== config.TURAS_ENVIRONMENT_ID) throw new Error("Store clone marker mismatch");
  const dump = execFileSync("docker",["exec",container,"pg_dump","-U",username,
    "-d",database,"-Fc","--no-owner","--no-acl"],{ maxBuffer: 100*1024*1024,timeout: 60_000 });
  execFileSync("docker",["exec",container,"createdb","-U",username,cloneName],{
    stdio: ["ignore","pipe","pipe"],timeout: 10_000 });
  created = true;
  execFileSync("docker",["exec","-i",container,"pg_restore","-U",username,"-d",cloneName,
    "--no-owner","--no-acl"],{ input: dump,maxBuffer: 10*1024*1024,timeout: 60_000 });
  runScript("scripts/db-migrate.ts");
  runScript("scripts/db-roles.ts");
  process.env.DATABASE_URL = environment.DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = environment.DATABASE_URL_UNPOOLED;
  process.env.TURAS_ARTIFACT_STORE_ROOT = environment.TURAS_ARTIFACT_STORE_ROOT;
  process.env.TURAS_TEST_ENVIRONMENT_ID = environment.TURAS_ENVIRONMENT_ID;
  pool = new Pool({ connectionString: cloneOwner.toString(),max: 2 });
  owner = new Client({ connectionString: cloneOwner.toString() });
  await owner.connect();
  const { createProfileTestSession } = await import("../tests/fixtures/profiles");
  const { createArtifactDatabaseFixture } = await import("../tests/fixtures/artifact-database");
  const { preparedArtifactImages } = await import("../lib/server/artifacts/prepared");
  const { claimArtifactRun } = await import("../lib/server/artifacts/jobs");
  const { retireArtifactVersion } = await import("../lib/server/artifacts/lifecycle");
  const client = await pool.connect();
  let fixture: Awaited<ReturnType<typeof createArtifactDatabaseFixture>>;
  let actor: Awaited<ReturnType<typeof createProfileTestSession>>;
  let objectKey: string;
  try {
    await client.query("BEGIN");
    actor = await createProfileTestSession(client,"panel");
    fixture = await createArtifactDatabaseFixture(client,actor,DEMO_IDS.sharedCustomer);
    await client.query(`UPDATE artifact_extraction_runs SET parser_image_digest=$2,
      scan_policy_version='004-scan-v1',parser_policy_version='004-parser-v1' WHERE id=$1`,
    [fixture.runId,preparedArtifactImages().parserDigest]);
    const key = await client.query<{ object_key: string }>(
      "SELECT object_key FROM artifact_versions WHERE id=$1",[fixture.versionId]);
    objectKey = key.rows[0].object_key;
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await mkdir(join(clonedStore,"objects"),{ mode: 0o700,recursive: true });
  await writeFile(join(clonedStore,"objects",objectKey!),"Synthetic artifact",{ mode: 0o600 });
  const { artifactContainerInvocation } = await import("../lib/server/artifacts/containers");
  const { runArtifactContainer } = await import("../lib/server/artifacts/scan");
  const parserCheck = await runArtifactContainer(artifactContainerInvocation({ kind: "parse",
    image: preparedArtifactImages().parserImage,
    originalPath: join(clonedStore,"objects",objectKey!),
    ocrAssetsPath: join(clonedStore,"assets") }),
  ["/input","synthetic.txt","text/plain",preparedArtifactImages().parserDigest,"a".repeat(64),"-"]);
  if (parserCheck.exitCode !== 0) {
    throw new Error(`Disposable parser preflight failed: ${parserCheck.stderr.toString("utf8").trim().slice(0,80)}`);
  }
  const first = await claimArtifactRun();
  if (first?.versionId !== fixture!.versionId) throw new Error("Disposable run was not claimed");
  if (first.parserImageDigest !== preparedArtifactImages().parserDigest) {
    throw new Error("Disposable parser image attestation differs from claimed run");
  }
  worker = startWorker();
  await until(async () => {
    try { return (Date.now()-(await stat(join(clonedStore,"worker-heartbeat.json"))).mtimeMs) < 5_000; }
    catch { return false; }
  },"first worker heartbeat",15_000);
  await stopWorker();
  await owner.query(`UPDATE artifact_extraction_runs SET lease_expires_at=now()-interval '1 second'
    WHERE id=$1 AND state='leased'`,[fixture!.runId]);
  worker = startWorker();
  await until(async () => {
    const state = await owner!.query<{ state: string }>(
      "SELECT state FROM artifact_versions WHERE id=$1",[fixture!.versionId]);
    const runState = await owner!.query<{ state: string; safe_error_code: string | null }>(
      "SELECT state,safe_error_code FROM artifact_extraction_runs WHERE id=$1",[fixture!.runId]);
    if (runState.rows[0]?.state === "failed") {
      throw new Error(`Disposable run failed: ${runState.rows[0].safe_error_code ?? "unknown"}`);
    }
    return ["ready","partial"].includes(state.rows[0]?.state);
  },"reclaimed publication",120_000);
  const run = await owner.query<{ state: string; attempt_number: number }>(
    "SELECT state,attempt_number FROM artifact_extraction_runs WHERE id=$1",[fixture!.runId]);
  if (run.rows[0]?.state !== "published" || run.rows[0].attempt_number < 2) {
    throw new Error("Expired lease was not reclaimed and published once");
  }
  await retireArtifactVersion(actor!,fixture!.versionId,{ action: "delete",
    expectedGeneration: 1,reason: "Synthetic recovery deletion",
    idempotencyKey: `recovery-${randomUUID()}` });
  await until(async () => {
    const state = await owner!.query<{ state: string }>(
      "SELECT state FROM artifact_versions WHERE id=$1",[fixture!.versionId]);
    return state.rows[0]?.state === "deleted";
  },"physical cleanup",60_000);
  const purged = await owner.query<{ remaining: number }>(`SELECT count(*)::int AS remaining
    FROM artifact_extraction_units WHERE version_id=$1 AND text IS NOT NULL`,[fixture!.versionId]);
  if (purged.rows[0]?.remaining !== 0) throw new Error("Extracted text remained after deletion");
  try { await stat(join(clonedStore,"objects",objectKey!));
    throw new Error("Original remained after deletion"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const finalMarker = await owner.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [config.TURAS_ENVIRONMENT_ID]);
  if (finalMarker.rows[0]?.schema_version !== 18) throw new Error("Clone upgrade did not reach 018");
  finalCode = createHash("sha256").update(`${fixture!.versionId}:${run.rows[0].attempt_number}`)
    .digest("hex").slice(0,12);
} finally {
  await stopWorker();
  const { closeRuntimePool } = await import("../lib/server/db/client");
  await closeRuntimePool().catch(() => undefined);
  await owner?.end().catch(() => undefined);
  await pool?.end().catch(() => undefined);
  if (created) execFileSync("docker",["exec",container,"dropdb","-U",username,
    "--if-exists","--force",cloneName],{ stdio: ["ignore","pipe","pipe"],timeout: 10_000 });
  await rm(work,{ recursive: true,force: true });
}
console.log(JSON.stringify({ kind: "artifact_recovery_check",result: "passed",
  sourceSchema: 13,restoredSchema: 18,reclaimedRun: true,cleanupConverged: true,
  fixtureCode: finalCode }));
