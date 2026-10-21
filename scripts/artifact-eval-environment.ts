import {configureOwnedNextDependencyRoot} from './owned-next-config';
import {stopOwnedAppProcesses} from './plan-eval-environment';
import {installBehaviorReviewCapture} from './pilot-behavior-review-capture';
import {qualityChildEnvironment} from "./pilot-quality-runtime";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, rm, symlink, writeFile, readFile } from "node:fs/promises";
import {copyOwnedEvalFiles} from './eval-owned-copy';
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { Client } from "pg";
import { requireEvaluationSourceDatabase } from "./eval-source-database";
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
  const testUrl = new URL(requireEvaluationSourceDatabase());
  const database = decodeURIComponent(testUrl.pathname.slice(1));
  const adminUrl = new URL(getServerConfig().DATABASE_URL_UNPOOLED);
  const username = decodeURIComponent(adminUrl.username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)) {
    throw new Error("Invalid local evaluation database identifier");
  }
  const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
  const manifest = JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')) as {version:number};
  if(!Number.isSafeInteger(manifest.version)||manifest.version<18)throw Error('Current artifact migration manifest required');
  const probe = new Client({ connectionString: testUrl.toString() });
  await probe.connect();
  try {
    const current = await probe.query<{ environment_id: string; schema_version: number }>(
      "SELECT environment_id,schema_version FROM turas_environment");
    if (current.rows.length !== 1 || current.rows[0].environment_id !== marker ||
        current.rows[0].schema_version !== manifest.version) throw new Error("Current artifact test schema required");
  } finally { await probe.end(); }
  process.env.TURAS_ARTIFACT_STORE_ROOT ??= resolve("local-artifacts/004/store");
  const preparedStore = parseArtifactStoreConfig(process.env).root;
  await mkdir(resolve("local-artifacts/004"),{recursive:true,mode:0o700});
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
    TURAS_TEST_DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
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
    for (const name of ["app","agent","lib","migrations","scripts","public","evals","infra","tests","packages","report-renderer","report-templates",
      "next.config.ts","next-env.d.ts","tsconfig.json","package.json"]) {
      copyOwnedEvalFiles(resolve(name),join(app,name),{excludeRuntime:true});
    }
    await cp(resolve("scripts/fixtures/artifact-eval-agent.ts"),join(app,"agent/agent.ts"));
    await symlink(resolve("node_modules"),join(app,"node_modules"));
    await symlink(resolve("packages/artifact-extractor/node_modules"),join(app,"packages/artifact-extractor/node_modules"));
    await configureOwnedNextDependencyRoot(app);
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
    process.env.TURAS_TEST_DATABASE_URL = cloneUrl.toString();
    process.env.TURAS_ENVIRONMENT_ID = marker;
    process.env.TURAS_APP_ORIGIN = origin;
    process.env.TURAS_ARTIFACT_STORE_ROOT = store;
    if(process.env.TURAS_016_BEHAVIOR_CAPTURE_ROOT)await installBehaviorReviewCapture(app,process.env.TURAS_016_BEHAVIOR_CAPTURE_ROOT);
    dev = spawn(process.execPath,["scripts/dev.mjs"],{
      cwd: app,env: { ...process.env,NODE_ENV:"development",PORT: String(port),...await qualityChildEnvironment() },stdio: ["ignore","pipe","pipe"] });
    const capture = (chunk: Buffer) => { startupOutput =
      (startupOutput+chunk.toString("utf8")).slice(-100_000); };
    dev.stdout?.on("data",capture); dev.stderr?.on("data",capture);
    const started = Date.now();
    let ready = false;
    let lastAuthStatus:number|null=null,lastEveStatus:number|null=null;
    let authTransport='none',eveTransport='none',probeCount=0;
    const probe=async(path:string)=>{
      try{
        const response=await fetch(`${origin}${path}`,{signal:AbortSignal.timeout(2_000)});
        const status=response.status;await response.body?.cancel();return {status,transport:'none'};
      }catch(error){const name=error instanceof Error?error.name:'';return {status:null,transport:['TimeoutError','AbortError','TypeError'].includes(name)?name:'other'};}
    };
    while (Date.now()-started < 60_000) {
      if (dev.exitCode !== null) throw new Error(`Isolated evaluation app exited during startup: ${startupOutput}`);
      const [auth,eve]=await Promise.all([probe('/api/auth/session'),probe('/eve/v1/health')]);
      probeCount++;lastAuthStatus=auth.status;lastEveStatus=eve.status;authTransport=auth.transport;eveTransport=eve.transport;
      if(auth.status===401&&eve.status!==null&&eve.status>=200&&eve.status<300){ready=true;break;}
      await new Promise((wait) => setTimeout(wait,500));
    }
    if (!ready) {
      await writeFile(resolve('local-artifacts/004/eval-startup-failure.log'),startupOutput,{mode:0o600});
      await writeFile(resolve('local-artifacts/004/eval-startup-failure.json'),JSON.stringify({lastAuthStatus,lastEveStatus}),{mode:0o600});
      const signatures=['EADDRINUSE','ECONNREFUSED','Module not found','Cannot find module','Failed to compile','Error:'].filter(value=>startupOutput.includes(value));
      // This fixed record survives removal of the owned app. Arbitrary startup
      // output remains private; CI publishes only whitelisted phase metadata.
      // Vitest's JSON-only reporter intercepts console output; write directly.
      process.stderr.write(JSON.stringify({kind:'artifact_eval_startup_failure',lastAuthStatus,lastEveStatus,authTransport,eveTransport,probeCount,elapsedMs:Date.now()-started,
        supervisorExited:dev.exitCode!==null,supervisorSignalled:dev.signalCode!==null,
        nextReady:/Ready in/i.test(startupOutput),compiling:/Compiling/i.test(startupOutput),eveListening:/server listening at http:\/\/127\.0\.0\.1:\d+\//.test(startupOutput),signatures})+'\n');
      throw new Error('Isolated evaluation app did not become ready: '+JSON.stringify({lastAuthStatus,lastEveStatus,exitCode:dev.exitCode,signatures}));
    }
    return await run();
  } finally {
    await stop(dev);
    await stopOwnedAppProcesses(app);
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (created) execFileSync("docker",["exec",container,"dropdb","-U",username,
      "--if-exists","--force",cloneName],{ timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
    await rm(root,{ recursive: true,force: true });
  }
}
