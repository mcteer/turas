import {artifactStartupSentinel,probeArtifactStartupTransport} from './artifact-startup-probe';
import {configureOwnedNextDependencyRoot} from './owned-next-config';
import {stopOwnedAppProcesses} from './plan-eval-environment';
import {installBehaviorReviewCapture} from './pilot-behavior-review-capture';
import {qualityChildEnvironment} from "./pilot-quality-runtime";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, rm, symlink, writeFile, readFile } from "node:fs/promises";
import {copyOwnedEvalFiles} from './eval-owned-copy';
import { reserveOwnedEvalPort } from "./eval-port";
import { resolve, join } from "node:path";
import { Client } from "pg";
import { requireEvaluationSourceDatabase } from "./eval-source-database";
import { getServerConfig, parseArtifactStoreConfig } from "../lib/server/config";

/** Exact execution markers only: a compiler's quoted source is not execution. */
export function artifactAuthStartupPhases(output:string) {
  const lines=new Set(output.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').split(/\r?\n/));
  return {authModuleObserved:lines.has('ARTIFACT_AUTH_MODULE'),authHandlerObserved:lines.has('ARTIFACT_AUTH_HANDLER'),
    authSessionObserved:lines.has('ARTIFACT_AUTH_SESSION'),authFailureObserved:lines.has('ARTIFACT_AUTH_FAILURE')};
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((done) => {
    const timer = setTimeout(() => child.kill("SIGKILL"),5_000);
    child.once("exit",() => { clearTimeout(timer); done(); });
    child.kill("SIGTERM");
  });
}

export async function stageArtifactEvalAgent(app:string):Promise<void>{
  await cp(resolve('scripts/fixtures/artifact-eval-agent.ts'),join(app,'agent/agent.ts'));
  await cp(resolve('scripts/fixtures/artifact-eval-output-limit.ts'),join(app,'agent/artifact-eval-output-limit.ts'));
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
  let portLease: Awaited<ReturnType<typeof reserveOwnedEvalPort>> | null = null;
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
    await stageArtifactEvalAgent(app);
    await symlink(resolve("node_modules"),join(app,"node_modules"));
    await symlink(resolve("packages/artifact-extractor/node_modules"),join(app,"packages/artifact-extractor/node_modules"));
    await configureOwnedNextDependencyRoot(app);
    // Observe only the disposable route. No request, session or error data leaves it.
    const authRoute = join(app,"app/api/auth/session/route.ts");
    let authSource = await readFile(authRoute,"utf8");
    for (const [before,after] of [
      ['export const dynamic = "force-dynamic";', `process.stderr.write("ARTIFACT_AUTH_MODULE\\n");\nexport const dynamic = "force-dynamic";`],
      ['export async function GET(request: Request): Promise<Response> {', `export async function GET(request: Request): Promise<Response> {\n  process.stderr.write("ARTIFACT_AUTH_HANDLER\\n");`],
      ['const session = await getCurrentSession(request);', `const session = await getCurrentSession(request);\n    process.stderr.write("ARTIFACT_AUTH_SESSION\\n");`],
      ['  } catch (error) {', `  } catch (error) {\n    process.stderr.write("ARTIFACT_AUTH_FAILURE\\n");`],
    ]) {
      if (authSource.split(before).length !== 2) throw Error('Owned artifact auth diagnostic shape changed');
      authSource = authSource.replace(before,after);
    }
    await writeFile(authRoute,authSource);

    const dump = execFileSync("docker",["exec",container,"pg_dump","-U",username,
      "-d",database,"-Fc","--no-owner","--no-acl"],{ timeout: 60_000,maxBuffer: 100*1024*1024 });
    execFileSync("docker",["exec",container,"createdb","-U",username,cloneName],{
      timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
    created = true;
    execFileSync("docker",["exec","-i",container,"pg_restore","-U",username,
      "-d",cloneName,"--no-owner","--no-acl"],{
      input: dump,timeout: 60_000,maxBuffer: 10*1024*1024 });
    portLease = await reserveOwnedEvalPort();
    const port = portLease.port;
    const origin = `http://127.0.0.1:${port}`;
    process.env.DATABASE_URL = cloneUrl.toString();
    process.env.DATABASE_URL_UNPOOLED = cloneUrl.toString();
    process.env.TURAS_TEST_DATABASE_URL = cloneUrl.toString();
    process.env.TURAS_ENVIRONMENT_ID = marker;
    process.env.TURAS_APP_ORIGIN = origin;
    process.env.TURAS_ARTIFACT_STORE_ROOT = store;
    if(process.env.TURAS_016_BEHAVIOR_CAPTURE_ROOT)await installBehaviorReviewCapture(app,process.env.TURAS_016_BEHAVIOR_CAPTURE_ROOT);
    await writeFile(join(app,'public',artifactStartupSentinel),'owned-evaluation-startup-probe-v1\n',{mode:0o600,flag:'wx'});
    const devEnvironment: NodeJS.ProcessEnv = { ...process.env,NODE_ENV:"development",PORT: String(port),...await qualityChildEnvironment() };
    await portLease.release();
    dev = spawn(process.execPath,["scripts/dev.mjs"],{
      cwd: app,env: devEnvironment,stdio: ["ignore","pipe","pipe"] });
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
      const readinessElapsedMs = Date.now()-started;
      await writeFile(resolve('local-artifacts/004/eval-startup-failure.log'),startupOutput,{mode:0o600});
      await writeFile(resolve('local-artifacts/004/eval-startup-failure.json'),JSON.stringify({lastAuthStatus,lastEveStatus}),{mode:0o600});
      // These observations run only after failure, cannot satisfy readiness, and
      // have separate finite clocks inside the original owned-app deadline.
      const plainOutput = startupOutput.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
      const publicAddress = /Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})/.exec(plainOutput);
      const internalAddress = /server listening at http:\/\/127\.0\.0\.1:(\d{1,5})\//.exec(plainOutput);
      const internalHealth = async()=>{
        if (!internalAddress || Number(internalAddress[1])<1 || Number(internalAddress[1])>65535) return {status:null,transport:'unavailable'};
        try { const response = await fetch(`http://127.0.0.1:${internalAddress[1]}/eve/v1/health`,{signal:AbortSignal.timeout(1_000)});
          await response.body?.cancel();return {status:response.status,transport:'none'};
        } catch(error) { return {status:null,transport:error instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(error.name)?error.name:'other'}; }
      };
      const databaseHealth = async()=>{
        const db = new Client({connectionString:cloneUrl.toString(),connectionTimeoutMillis:1_000,query_timeout:1_000,statement_timeout:1_000});
        db.on('error',()=>undefined);
        let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
        const failed={reachable:false,admissionOpen:false};
        const work=(async()=>{
          try {await db.connect();if(closed)return failed;
            const result=await db.query("SELECT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=$1 AND mode='open') AS admission_open",[marker]);
            return {reachable:true,admissionOpen:result.rows[0]?.admission_open===true};
          } catch {return failed;}
        })();
        try {return await Promise.race([work,new Promise<typeof failed>(done=>{timer=setTimeout(()=>{closed=true;db.connection.stream.destroy();done(failed);},2_200);})]);}
        finally {closed=true;clearTimeout(timer);db.connection.stream.destroy();void db.end().catch(()=>undefined);}
      };
      const [internal,db,transport] = await Promise.all([internalHealth(),databaseHealth(),probeArtifactStartupTransport(port).catch(()=>({transportDiagnosticUnavailable:true}))]);
      const signatures=['EADDRINUSE','ECONNREFUSED','Module not found','Cannot find module','Failed to compile','Error:','ENOSPC','EMFILE','ENOMEM','Turbopack panic'].filter(value=>plainOutput.includes(value));
      // This fixed record survives removal of the owned app. Arbitrary startup
      // output remains private; CI publishes only whitelisted phase metadata.
      // Vitest's JSON-only reporter intercepts console output; write directly.
      process.stderr.write(JSON.stringify({kind:'artifact_eval_startup_failure',lastAuthStatus,lastEveStatus,authTransport,eveTransport,probeCount,elapsedMs:readinessElapsedMs,
        supervisorExited:dev.exitCode!==null,supervisorSignalled:dev.signalCode!==null,
        nextReady:/Ready in/i.test(plainOutput),compiling:/Compiling/i.test(plainOutput),eveListening:internalAddress!==null,
        nextAddressObserved:publicAddress!==null,nextPortMatches:publicAddress!==null&&Number(publicAddress[1])===port,
        ...artifactAuthStartupPhases(startupOutput),
        ...transport,
        internalEveStatus:internal.status,internalEveTransport:internal.transport,databaseReachable:db.reachable,databaseAdmissionOpen:db.admissionOpen,signatures})+'\n');
      throw new Error('Isolated evaluation app did not become ready: '+JSON.stringify({lastAuthStatus,lastEveStatus,exitCode:dev.exitCode,signatures}));
    }
    return await run();
  } finally {
   try {
    await stop(dev);
    await stopOwnedAppProcesses(app);
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (created) execFileSync("docker",["exec",container,"dropdb","-U",username,
      "--if-exists","--force",cloneName],{ timeout: 10_000,stdio: ["ignore","pipe","pipe"] });
    await rm(root,{ recursive: true,force: true });
   } finally { await portLease?.release(); }
  }
}
