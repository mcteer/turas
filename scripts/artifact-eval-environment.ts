import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { Client } from "pg";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { getServerConfig, parseArtifactStoreConfig } from "../lib/server/config";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady,reject) => {
    server.once("error",reject); server.listen(0,"127.0.0.1",resolveReady);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  if (!port) throw new Error("No isolated evaluation port available");
  return port;
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((done) => {
    const timer = setTimeout(() => child.kill("SIGKILL"),5_000);
    child.once("exit",() => { clearTimeout(timer); done(); });
    child.kill("SIGTERM");
  });
}

/** Clone only synthetic test state and run Eve with private workflow data. */
export async function withArtifactEvalEnvironment<T>(run: () => Promise<T>): Promise<T> {
  const testUrl = new URL(requireTestDatabaseUrl());
  const database = decodeURIComponent(testUrl.pathname.slice(1));
  const adminUrl = new URL(getServerConfig().DATABASE_URL_UNPOOLED);
  const username = decodeURIComponent(adminUrl.username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)) {
    throw new Error("Invalid local evaluation database identifier");
  }
  const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
  const probe = new Client({ connectionString: testUrl.toString() });
  await probe.connect();
  try {
    const current = await probe.query<{ environment_id: string; schema_version: number }>(
      "SELECT environment_id,schema_version FROM turas_environment");
    if (current.rows.length !== 1 || current.rows[0].environment_id !== marker ||
        current.rows[0].schema_version !== 18) throw new Error("Artifact test schema 018 required");
  } finally { await probe.end(); }
  process.env.TURAS_ARTIFACT_STORE_ROOT ??= resolve("local-artifacts/004/store");
  const preparedStore = parseArtifactStoreConfig(process.env).root;
  const root = await mkdtemp(resolve("local-artifacts/004/eval-"));
  const app = join(root,"app");
  const store = join(root,"store");
  const cloneName = `turas_eval_${randomUUID().replaceAll("-","").slice(0,12)}`;
  const cloneUrl = new URL(adminUrl);
  cloneUrl.pathname = `/${cloneName}`;
  const container = process.env.TURAS_TEST_POSTGRES_CONTAINER ?? "turas-002-postgres";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(container)) {
    throw new Error("Invalid local PostgreSQL container name");
  }
  const old = { DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    TURAS_ENVIRONMENT_ID: process.env.TURAS_ENVIRONMENT_ID,
    TURAS_APP_ORIGIN: process.env.TURAS_APP_ORIGIN,
    TURAS_ARTIFACT_STORE_ROOT: process.env.TURAS_ARTIFACT_STORE_ROOT };
  let created = false;
  let dev: ChildProcess | null = null;
  let startupOutput = "";
  try {
    await cp(preparedStore,store,{ recursive: true });
    await writeFile(join(store,".turas-artifact-store.json"),JSON.stringify({ environmentId: marker }),
      { mode: 0o600 });
    await chmod(join(store,".turas-artifact-store.json"),0o600);
    await mkdir(app,{ mode: 0o700 });
    for (const name of ["app","agent","lib","migrations","scripts","public","evals",
      "next.config.ts","next-env.d.ts","tsconfig.json","package.json"]) {
      await cp(resolve(name),join(app,name),{ recursive: true });
    }
    await cp(resolve("scripts/fixtures/artifact-eval-agent.ts"),join(app,"agent/agent.ts"));
    await symlink(resolve("node_modules"),join(app,"node_modules"));
    const dump = execFileSync("docker",["exec",container,"pg_dump","-U",username,
      "-d",database,"-Fc","--no-owner","--no-acl"],{ timeout: 60_000,maxBuffer: 100*1024*1024 });
    execFileSync("docker",["exec",container,"createdb","-U",username,cloneName],{
      timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
    created = true;
    execFileSync("docker",["exec","-i",container,"pg_restore","-U",username,
      "-d",cloneName,"--no-owner","--no-acl"],{
      input: dump,timeout: 60_000,maxBuffer: 10*1024*1024 });
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    process.env.DATABASE_URL = cloneUrl.toString();
    process.env.DATABASE_URL_UNPOOLED = cloneUrl.toString();
    process.env.TURAS_ENVIRONMENT_ID = marker;
    process.env.TURAS_APP_ORIGIN = origin;
    process.env.TURAS_ARTIFACT_STORE_ROOT = store;
    dev = spawn(process.execPath,["scripts/dev.mjs"],{
      cwd: app,env: { ...process.env,PORT: String(port) },stdio: ["ignore","pipe","pipe"] });
    const capture = (chunk: Buffer) => { startupOutput =
      (startupOutput+chunk.toString("utf8")).slice(-1_500); };
    dev.stdout?.on("data",capture); dev.stderr?.on("data",capture);
    const started = Date.now();
    let ready = false;
    while (Date.now()-started < 60_000) {
      if (dev.exitCode !== null) throw new Error(`Isolated evaluation app exited during startup: ${startupOutput}`);
      try {
        const [auth,eve] = await Promise.all([
          fetch(`${origin}/api/auth/session`,{ signal: AbortSignal.timeout(2_000) }),
          fetch(`${origin}/eve/v1/health`,{ signal: AbortSignal.timeout(2_000) }),
        ]);
        if (auth.status === 401 && eve.ok) { ready = true; break; }
      } catch { /* startup is still pending */ }
      await new Promise((wait) => setTimeout(wait,500));
    }
    if (!ready) throw new Error("Isolated evaluation app did not become ready");
    return await run();
  } finally {
    await stop(dev);
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (created) execFileSync("docker",["exec",container,"dropdb","-U",username,
      "--if-exists","--force",cloneName],{ timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
    await rm(root,{ recursive: true,force: true });
  }
}
