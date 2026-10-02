import { randomUUID } from "node:crypto";
import { spawn,spawnSync,type ChildProcess } from "node:child_process";
import { mkdir,mkdtemp,rm,symlink,writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join,resolve } from "node:path";
import { Client } from "pg";
import { closeRuntimePool } from "../lib/server/db/client";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { ownedEvalTimeout } from "./eval-deadline";
import { copyOwnedEvalFiles } from "./eval-owned-copy";

export type PlanEvalEnvironment = {
  databaseName: string;
  appRoot: string;
  storeRoot: string;
  origin: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  diagnosticLines: () => string[];
  diagnosticClasses: () => string[];
  privateLogTail: () => string;
};

export type PlanEvalOptions = {
  deadlineAt?: number;
  empty?: boolean;
  sourceDatabaseUrl?: string;
  feature?: "006" | "007";
  prepare?: (paths: { appRoot: string; storeRoot: string; environmentId: string }) =>
    Promise<Record<string, string>>;
  cleanupGuard?: (paths: { appRoot: string; storeRoot: string; databaseName: string;
    databaseUrl: string; environmentId: string }) => Promise<void>;
};

const sourceFiles = ["app","agent","lib","migrations","scripts","public","evals","tests",
  "packages","next.config.ts","next-env.d.ts","tsconfig.json","package.json"] as const;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done,reject) => {
    server.once("error",reject);
    server.listen(0,"127.0.0.1",done);
  });
  const address = server.address();
  await new Promise<void>((done) => server.close(() => done()));
  if (!address || typeof address === "string") throw new Error("Disposable port unavailable");
  return address.port;
}

async function stopChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done) => {
    let complete = false;
    const finish = () => { if (complete) return;complete = true;clearTimeout(timer);done(); };
    const timer = setTimeout(() => { child.kill("SIGKILL");finish(); },5_000);
    child.once("exit",finish);
    child.kill("SIGTERM");
  });
}

function runGuardedScript(file: string,cwd: string,env: NodeJS.ProcessEnv,
  args:string[]=[],deadlineAt?:number): void {
  const result = spawnSync(process.execPath,["--experimental-strip-types",file,...args],{
    cwd,env,encoding: "utf8",timeout: ownedEvalTimeout(deadlineAt,120_000),killSignal:"SIGKILL",maxBuffer: 1_000_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Disposable ${file} failed; inspect the selected test environment`);
  }
}

/** Owns only a clone of the guarded, separately marked test database. */
export async function withPlanEvalEnvironment<T>(
  run: (environment: PlanEvalEnvironment) => Promise<T>,
  options: PlanEvalOptions = {},
): Promise<T> {
  const remaining = (maximumMs = 5_000) => ownedEvalTimeout(options.deadlineAt,maximumMs);
  remaining();
  const sourceUrl = new URL(requireTestDatabaseUrl(options.sourceDatabaseUrl ?
    {...process.env,TURAS_TEST_DATABASE_URL:options.sourceDatabaseUrl}:process.env));
  const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
  const testMarker = process.env.TURAS_TEST_ENVIRONMENT_ID;
  const neon = sourceUrl.hostname.endsWith(".neon.tech");
  if (!testMarker || !/^turas_test(?:_[a-z0-9_]+)?$/.test(sourceName)) {
    throw new Error("Marked disposable test source required");
  }
  const adminUrl = neon ? new URL(process.env.DATABASE_URL_UNPOOLED ?? "") : new URL(sourceUrl);
  if (!neon) adminUrl.pathname = "/postgres";
  if (adminUrl.hostname !== sourceUrl.hostname || adminUrl.port !== sourceUrl.port ||
      adminUrl.username !== sourceUrl.username || adminUrl.password !== sourceUrl.password) {
    throw new Error("Disposable clone requires the selected Preview owner or local test endpoint");
  }
  const preview = neon ? new URL(process.env.NEON_PREVIEW_DB ?? "") : null;
  const production = neon ? new URL(process.env.NEON_PROD_DB ?? "") : null;
  if (neon && (!preview || !production ||
      preview.hostname.replace("-pooler.",".") !== sourceUrl.hostname ||
      production.hostname === sourceUrl.hostname ||
      adminUrl.pathname === sourceUrl.pathname)) {
    throw new Error("Disposable clone endpoint is not the selected Preview branch");
  }

  const probe = new Client({ connectionString: sourceUrl.toString(),connectionTimeoutMillis:remaining(),
    statement_timeout:remaining(),query_timeout:remaining() });
  await probe.connect();
  try {
    const state = await probe.query<{environment_id:string;schema_version:number}>(
      "SELECT environment_id,schema_version FROM turas_environment");
    if (state.rowCount !== 1 || state.rows[0]?.environment_id !== testMarker ||
        state.rows[0].schema_version < 28) {
      throw new Error("Marked schema-028-or-newer disposable test source required");
    }
  } finally { await probe.end(); }
  remaining();

  const feature = options.feature ?? "006";
  const name = `turas_test_${feature}_eval_${randomUUID().replaceAll("-","").slice(0,12)}`;
  const cloneUrl = new URL(sourceUrl);
  cloneUrl.pathname = `/${name}`;
  await mkdir(resolve(`local-artifacts/${feature}`),{recursive:true,mode:0o700});
  const root = await mkdtemp(resolve(`local-artifacts/${feature}/eval-`));
  const appRoot = join(root,"app");
  const storeRoot = join(root,"store");
  const origin = `http://127.0.0.1:${await freePort()}`;
  const prior: Record<string, string | undefined> = Object.fromEntries(["DATABASE_URL","DATABASE_URL_UNPOOLED",
    "TURAS_TEST_DATABASE_URL","TURAS_ENVIRONMENT_ID","TURAS_APP_ORIGIN",
    "TURAS_ARTIFACT_STORE_ROOT","TURAS_TEST_SOURCE_DATABASE_URL"].map((key) =>
      [key,process.env[key]]));
  let created = false;
  const ownership = `turas-owned-${feature}-${randomUUID()}`;
  let prepared = false;
  let child: ChildProcess | null = null;
  let startupTail = "";
  try {
    const admin = new Client({connectionString:adminUrl.toString(),connectionTimeoutMillis:remaining()});
    await admin.connect();
    try {
      for (let attempt=0;attempt<60;attempt += 1) {
        remaining();
        try {
          await admin.query(options.empty ? `CREATE DATABASE ${name}` :
            `CREATE DATABASE ${name} TEMPLATE ${sourceName}`);
          created = true;
          await admin.query(`COMMENT ON DATABASE ${name} IS '${ownership}'`);
          break;
        } catch (error) {
          if ((error as {code?:string}).code !== "55006" || attempt === 59) throw error;
          if (!options.empty && attempt >= 5 && attempt % 5 === 0) {
            await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
              WHERE datname=$1 AND pid<>pg_backend_pid()`,[sourceName]);
          }
          await new Promise((done) => setTimeout(done,remaining(500)));
        }
      }
    } finally { await admin.end(); }
    remaining();
    await mkdir(appRoot,{mode:0o700});
    await mkdir(storeRoot,{mode:0o700});
    const testStore = process.env.TURAS_TEST_ARTIFACT_STORE_ROOT;
    if (testStore) {
      copyOwnedEvalFiles(testStore,storeRoot,{deadlineAt:options.deadlineAt});
    }
    await writeFile(join(storeRoot,".turas-artifact-store.json"),
      JSON.stringify({environmentId:testMarker}),{mode:0o600});
    for (const file of sourceFiles) {
      remaining();
      copyOwnedEvalFiles(resolve(file),join(appRoot,file),{
        deadlineAt:options.deadlineAt,excludeRuntime:true,
      });
    }
    await symlink(resolve("node_modules"),join(appRoot,"node_modules"));
    await symlink(resolve("packages/artifact-extractor/node_modules"),
      join(appRoot,"packages/artifact-extractor/node_modules"));
    if (options.prepare) {
      remaining();
      const extra = await options.prepare({ appRoot, storeRoot, environmentId: testMarker });
      for (const [key, value] of Object.entries(extra)) {
        if (!(key in prior)) prior[key] = process.env[key];
        process.env[key] = value;
      }
      prepared = true;
    }
    process.env.DATABASE_URL = cloneUrl.toString();
    process.env.DATABASE_URL_UNPOOLED = cloneUrl.toString();
    process.env.TURAS_TEST_DATABASE_URL = cloneUrl.toString();
    process.env.TURAS_TEST_SOURCE_DATABASE_URL = sourceUrl.toString();
    process.env.TURAS_ENVIRONMENT_ID = testMarker;
    process.env.TURAS_APP_ORIGIN = origin;
    process.env.TURAS_ARTIFACT_STORE_ROOT = storeRoot;
    runGuardedScript("scripts/db-migrate.ts",appRoot,process.env,
      options.empty ? ["--init"]:[],options.deadlineAt);
    runGuardedScript("scripts/db-roles.ts",appRoot,process.env,[],options.deadlineAt);

    async function start(): Promise<void> {
      remaining();
      if (child) throw new Error("Disposable app already running");
      startupTail = "";
      const port = new URL(origin).port;
      child = spawn(process.execPath,["scripts/dev.mjs"],{
        cwd:appRoot,env:{...process.env,NODE_ENV:"development",PORT:port,NODE_OPTIONS:""},
        stdio:["ignore","pipe","pipe"],
      });
      const capture = (chunk: Buffer) => { startupTail =
        (startupTail+chunk.toString("utf8")).slice(-200_000); };
      child.stdout?.on("data",capture);
      child.stderr?.on("data",capture);
      const readinessDeadline = Date.now()+remaining(90_000);
      while (Date.now()<readinessDeadline) {
        if (child.exitCode !== null) break;
        try {
          const [auth,eve] = await Promise.all([
            fetch(`${origin}/api/auth/session`,{signal:AbortSignal.timeout(ownedEvalTimeout(readinessDeadline,2_000))}),
            fetch(`${origin}/eve/v1/health`,{signal:AbortSignal.timeout(ownedEvalTimeout(readinessDeadline,2_000))}),
          ]);
          const ready = auth.status === 401 && eve.ok;
          await Promise.all([auth.body?.cancel(),eve.body?.cancel()]);
          if (ready) { remaining();return; }
        } catch { /* App is still starting. */ }
        if (Date.now()<readinessDeadline) await new Promise((done) => setTimeout(done,ownedEvalTimeout(readinessDeadline,500)));
      }
      await writeFile(resolve(`local-artifacts/${feature}/eval-startup-failure.log`),
        startupTail,{mode:0o600});
      throw new Error("Disposable app failed readiness");
    }
    async function stop(): Promise<void> { await stopChild(child);child = null; }
    remaining();
    return await run({databaseName:name,appRoot,storeRoot,origin,start,stop,
      restart:async () => { await stop();await start(); },
      diagnosticLines:()=>startupTail.split("\n").filter((line)=>
        line.includes("PLAN_DIAGNOSTIC")),
      diagnosticClasses:()=>["GatewayAuthenticationError","Invalid API key",
        "model_not_found","GatewayModelNotFoundError","rate_limit_exceeded",
        "timeout_error","MODEL_CALL_FAILED","provider","gateway",
        "AI_NoSuchModelError","AI_APICallError","ECONNRESET","ENOTFOUND",
        "401","402","403","404","429","500","502","503",
        "credit","billing","authentication","invalid_request","invalid_model",
        "overloaded","fetch failed","quota"]
        .filter((value)=>startupTail.toLowerCase().includes(value.toLowerCase())),
      privateLogTail:()=>startupTail});
  } finally {
    await stopChild(child);
    await closeRuntimePool();
    for (const [key,value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (created && prepared && options.cleanupGuard) {
      await options.cleanupGuard({ appRoot, storeRoot, databaseName: name,
        databaseUrl: cloneUrl.toString(), environmentId: testMarker });
    }
    try {
      if (created) {
        const admin = new Client({connectionString:adminUrl.toString(),connectionTimeoutMillis:5_000});
        await admin.connect();
        try {
          const owned = await admin.query<{ marker: string | null }>(
            "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
            [name]);
          if (owned.rowCount !== 1 || owned.rows[0]?.marker !== ownership) {
            throw new Error("Disposable database ownership changed; cleanup refused");
          }
          await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
        }
        finally { await admin.end(); }
      }
    } finally {
      // A stopped watcher may finish its last filesystem write during removal.
      // Retry only this owned temporary tree; keep ownership checks above intact.
      await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
}
