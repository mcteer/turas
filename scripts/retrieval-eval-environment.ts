import { randomUUID } from "node:crypto";
import { execFileSync,spawn,type ChildProcess } from "node:child_process";
import { chmod,cp,mkdir,mkdtemp,rm,symlink,writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join,resolve } from "node:path";
import { Client } from "pg";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { closeRuntimePool } from "../lib/server/db/client";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done,reject) => {
    server.once("error",reject);server.listen(0,"127.0.0.1",done);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((done) => server.close(() => done()));
  if (!port) throw new Error("Isolated evaluation port unavailable");
  return port;
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done) => {
    let settled = false;
    const finish = () => { if (settled) return;settled = true;clearTimeout(timer);done(); };
    const timer = setTimeout(() => { child.kill("SIGKILL");finish(); },5_000);
    child.once("exit",finish);
    child.kill("SIGTERM");
  });
}

export type RetrievalEvalControl = { appRoot: string;storeRoot: string;
  origin: string;stop: () => Promise<void>;start: () => Promise<void>;
  restart: () => Promise<void> };

/** Run a 005 evaluation on a cloned marked database, private store and Eve state. */
export async function withRetrievalEvalEnvironment<T>(
  run: (control: RetrievalEvalControl) => Promise<T>): Promise<T> {
  const sourceUrl = new URL(requireTestDatabaseUrl());
  const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
  const databaseUser = decodeURIComponent(sourceUrl.username || "postgres");
  const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
  const neon = sourceUrl.hostname.endsWith(".neon.tech");
  const container = process.env.TURAS_TEST_POSTGRES_CONTAINER ?? "turas-005-postgres";
  if (!/^turas_test_[a-z0-9_]+$/.test(sourceName) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseUser) ||
      (!neon && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(container))) {
    throw new Error("Unsupported disposable evaluation identity");
  }
  const adminUrl = neon ? new URL(process.env.DATABASE_URL_UNPOOLED ?? "") : null;
  if (adminUrl && (adminUrl.hostname !== sourceUrl.hostname ||
      adminUrl.username !== sourceUrl.username ||
      adminUrl.password !== sourceUrl.password ||
      adminUrl.pathname === sourceUrl.pathname)) {
    throw new Error("Neon clone requires the selected Preview owner endpoint");
  }
  const probe = new Client({ connectionString: sourceUrl.toString() });
  await probe.connect();
  try {
    const current = await probe.query<{ environment_id: string;schema_version: number }>(
      "SELECT environment_id,schema_version FROM turas_environment");
    if (current.rows.length !== 1 || current.rows[0].environment_id !== marker ||
        current.rows[0].schema_version < 28) throw new Error("005 test schema required");
  } finally { await probe.end(); }
  await mkdir(resolve("local-artifacts/005"),{ recursive: true,mode: 0o700 });
  const root = await mkdtemp(resolve("local-artifacts/005/eval-"));
  const app = join(root,"app");
  const store = join(root,"store");
  const cloneName = `turas_test_005_eval_${randomUUID().replaceAll("-","").slice(0,12)}`;
  const cloneUrl = new URL(sourceUrl);
  cloneUrl.pathname = `/${cloneName}`;
  const old = { DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    TURAS_TEST_DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
    TURAS_ENVIRONMENT_ID: process.env.TURAS_ENVIRONMENT_ID,
    TURAS_APP_ORIGIN: process.env.TURAS_APP_ORIGIN,
    TURAS_ARTIFACT_STORE_ROOT: process.env.TURAS_ARTIFACT_STORE_ROOT };
  let created = false;
  let dev: ChildProcess | null = null;
  let startupOutput = "";
  try {
    await mkdir(app,{ mode: 0o700 });
    await mkdir(store,{ mode: 0o700 });
    await writeFile(join(store,".turas-artifact-store.json"),
      JSON.stringify({ environmentId: marker }),{ mode: 0o600 });
    await chmod(join(store,".turas-artifact-store.json"),0o600);
    for (const name of ["app","agent","lib","migrations","scripts","public","evals","tests",
      "next.config.ts","next-env.d.ts","tsconfig.json","package.json"]) {
      await cp(resolve(name),join(app,name),{ recursive: true });
    }
    await symlink(resolve("node_modules"),join(app,"node_modules"));
    if (adminUrl) {
      const admin = new Client({ connectionString: adminUrl.toString() });
      await admin.connect();
      try {
        for (let attempt = 0;attempt < 60;attempt += 1) {
          try {
            await admin.query(`CREATE DATABASE ${cloneName} TEMPLATE ${sourceName}`);
            created = true;
            break;
          } catch (error) {
            if ((error as { code?: string }).code !== "55006" || attempt === 59) throw error;
            if (attempt >= 5 && attempt % 5 === 0) {
              await admin.query(`SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity WHERE datname=$1 AND usename=$2
                  AND pid<>pg_backend_pid()`,[sourceName,databaseUser]);
            }
            await new Promise((wait) => setTimeout(wait,500));
          }
        }
      } finally { await admin.end(); }
    } else {
      const dump = execFileSync("docker",["exec",container,"pg_dump","-U",databaseUser,
        "-d",sourceName,"-Fc","--no-owner","--no-acl"],{
        timeout: 60_000,maxBuffer: 100*1024*1024 });
      execFileSync("docker",["exec",container,"createdb","-U",databaseUser,cloneName],{
        timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
      created = true;
      execFileSync("docker",["exec","-i",container,"pg_restore","-U",databaseUser,
        "-d",cloneName,"--no-owner","--no-acl"],{
        input: dump,timeout: 60_000,maxBuffer: 100*1024*1024 });
    }
    const clone = new Client({ connectionString: cloneUrl.toString() });
    await clone.connect();
    try {
      await clone.query(`UPDATE retrieval_jobs SET state='failed',
        last_error_code='disposable_eval_excluded' WHERE state='queued'`);
    } finally { await clone.end(); }
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    process.env.DATABASE_URL = cloneUrl.toString();
    process.env.DATABASE_URL_UNPOOLED = cloneUrl.toString();
    process.env.TURAS_TEST_DATABASE_URL = cloneUrl.toString();
    process.env.TURAS_ENVIRONMENT_ID = marker;
    process.env.TURAS_APP_ORIGIN = origin;
    process.env.TURAS_ARTIFACT_STORE_ROOT = store;
    const capture = (chunk: Buffer) => { startupOutput =
      (startupOutput+chunk.toString("utf8")).slice(-10_000); };
    async function startDev(): Promise<void> {
      startupOutput = "";
      dev = spawn(process.execPath,["scripts/dev.mjs"],{
        cwd: app,env: { ...process.env,PORT: String(port),NODE_OPTIONS: "" },
        stdio: ["ignore","pipe","pipe"] });
      dev.stdout?.on("data",capture);dev.stderr?.on("data",capture);
      const started = Date.now();
      let lastAuthStatus: number | null = null;
      let lastEveStatus: number | null = null;
      let transportFailures = 0;
      while (Date.now()-started < 90_000) {
        if (dev.exitCode !== null) {
          await writeFile(resolve("local-artifacts/005/eval-startup-failure.log"),
            startupOutput,{ mode: 0o600 });
          throw new Error("Isolated evaluation app exited during startup");
        }
        try {
          const [auth,eve] = await Promise.all([
            fetch(`${origin}/api/auth/session`,{ signal: AbortSignal.timeout(2_000) }),
            fetch(`${origin}/eve/v1/health`,{ signal: AbortSignal.timeout(2_000) }),
          ]);
          lastAuthStatus = auth.status;lastEveStatus = eve.status;
          if (auth.status === 401 && eve.ok) return;
        } catch { transportFailures += 1; }
        await new Promise((wait) => setTimeout(wait,500));
      }
      await writeFile(resolve("local-artifacts/005/eval-startup-failure.log"),
        startupOutput,{ mode: 0o600 });
      await writeFile(resolve("local-artifacts/005/eval-health-failure.json"),
        JSON.stringify({ lastAuthStatus,lastEveStatus,transportFailures }),
        { mode: 0o600 });
      throw new Error("Isolated evaluation app did not become ready");
    }
    await startDev();
    return await run({ appRoot: app,storeRoot: store,origin,
      stop: async () => { await stop(dev);dev = null; },
      start: async () => {
        if (dev) throw new Error("Isolated app already started");
        await startDev();
      },
      restart: async () => { await stop(dev);dev = null;await startDev(); } });
  } finally {
    await stop(dev);
    await closeRuntimePool();
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    try {
      if (created && adminUrl) {
        const admin = new Client({ connectionString: adminUrl.toString() });
        await admin.connect();
        try { await admin.query(`DROP DATABASE ${cloneName} WITH (FORCE)`); }
        finally { await admin.end(); }
      } else if (created) {
        execFileSync("docker",["exec",container,"dropdb","-U",databaseUser,
          "--if-exists","--force",cloneName],{
          timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
      }
    } finally { await rm(root,{ recursive: true,force: true }); }
  }
}
