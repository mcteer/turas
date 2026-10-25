import {configureOwnedNextDependencyRoot} from './owned-next-config';
import {qualityChildEnvironment} from "./pilot-quality-runtime";
import {createServer,request as httpRequest,type Server} from 'node:http';
import { randomUUID } from "node:crypto";
import { spawnSync,type ChildProcess } from "node:child_process";
import {spawnOwnedProcess,retireOwnedProcess,type OwnedProcessRetirement} from './pilot-owned-process';
import { mkdir,mkdtemp,rm,symlink,writeFile,readdir,readlink,readFile,realpath,lstat } from "node:fs/promises";
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import { reserveOwnedEvalPort } from "./eval-port";
import { join,resolve,dirname } from "node:path";
import { Client } from "pg";
import { closeRuntimePool } from "../lib/server/db/client";
import { requireEvaluationSourceDatabase } from "./eval-source-database";
import { ownedEvalTimeout } from "./eval-deadline";
import {probePlanReadiness} from './plan-readiness-probe';
import { copyOwnedEvalFiles } from "./eval-owned-copy";

export type PlanEvalEnvironment = {
  databaseName: string;
  appRoot: string;
  storeRoot: string;
  origin: string;
  bootstrapDemo: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  diagnosticLines: () => string[];
  diagnosticClasses: () => string[];
  privateLogTail: () => string;
};

export type PlanEvalOptions = {
  /** Build once and run the owned Next production server; existing callers stay in dev. */
  production?: boolean;
  deadlineAt?: number;
  empty?: boolean;
  sourceDatabaseUrl?: string;
  feature?: "006" | "007" | "008" | "009" | "010" | "011";
  prepare?: (paths: { appRoot: string; storeRoot: string; environmentId: string }) =>
    Promise<Record<string, string>>;
  cleanupGuard?: (paths: { appRoot: string; storeRoot: string; databaseName: string;
    databaseUrl: string; environmentId: string }) => Promise<void>;
};

const sourceFiles = ["app","agent","lib","migrations","scripts","public","evals","tests",
  "packages","infra","report-templates","report-renderer","next.config.ts","next-env.d.ts","playwright.config.ts","tsconfig.json","package.json"] as const;

const ownedChildren=new WeakMap<ChildProcess,OwnedProcessRetirement>();
function spawnPlanChild(command:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv}){
 const owned=spawnOwnedProcess({command,args,cwd:options.cwd,environment:options.env});ownedChildren.set(owned.child,owned.retirement);return owned.child;
}
async function stopChild(child: ChildProcess | null): Promise<void> {
 if(!child)return;const retirement=ownedChildren.get(child);if(!retirement)throw Error('Actual owned evaluation child required');await retireOwnedProcess(retirement);
}

/** eve's dev server can detach from the Next supervisor. Match only processes
 * whose current directory is the still-owned disposable app before signalling. */
export async function stopOwnedAppProcesses(appRoot:string):Promise<void>{
  const within=(cwd:string)=>cwd===appRoot||cwd.startsWith(appRoot+"/");
  const owned=async()=>{
    const pids:number[]=[];
    if(process.platform==="linux"){
      for(const name of await readdir("/proc"))if(/^\d+$/.test(name)){
        const pid=Number(name);if(pid===process.pid)continue;
        const cwd=await readlink(`/proc/${pid}/cwd`).catch(()=>"");if(within(cwd))pids.push(pid);
      }
    }else{
      const result=spawnSync("lsof",["-a","-d","cwd","+d",appRoot,"-Fpn"],{encoding:"utf8",timeout:10000});
      if(result.error||![0,1].includes(result.status??-1))throw Error("Owned process inventory unavailable");
      let pid=0;for(const line of result.stdout.split("\n")){if(/^p\d+$/.test(line))pid=Number(line.slice(1));else if(line.startsWith("n")&&within(line.slice(1))&&pid!==process.pid)pids.push(pid);}
    }
    return [...new Set(pids)];
  };
  const signal=(pid:number,value:NodeJS.Signals)=>{try{process.kill(pid,value);}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error;}};
  for(const pid of await owned())signal(pid,"SIGTERM");
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){if(!(await owned()).length)return;await new Promise(done=>setTimeout(done,100));}
  for(const pid of await owned())signal(pid,"SIGKILL");
  const killedDeadline=Date.now()+5000;
  while(Date.now()<killedDeadline){if(!(await owned()).length)return;await new Promise(done=>setTimeout(done,100));}
  throw Error('Owned evaluation process retirement unverified');
}

function runGuardedScript(file: string,cwd: string,env: NodeJS.ProcessEnv,
  args:string[]=[],deadlineAt?:number): void {
  const result = spawnSync(process.execPath,["--experimental-strip-types",file,...args],{
    cwd,env,encoding: "utf8",timeout: ownedEvalTimeout(deadlineAt,120_000),killSignal:"SIGKILL",maxBuffer: 1_000_000,
  });
  if (result.error || result.status !== 0) {
    // Do not expose child output: migration diagnostics may include credentials.
    // Preserve bounded process metadata so setup failures are distinguishable
    // from behavioral assertions and timeouts without leaking private values.
    const code=(result.error as NodeJS.ErrnoException|undefined)?.code;
    const reason=code&&/^[A-Z0-9_]+$/.test(code)?code:'nonzero_exit';
    const diagnosticRoot=resolve('local-artifacts/eval-diagnostics');
    mkdirSync(diagnosticRoot,{recursive:true,mode:0o700});
    let output=(result.stdout??'')+'\n'+(result.stderr??'');
    for(const [name,value]of Object.entries(env))if(value&&/KEY|SECRET|TOKEN|PASSWORD|URL/.test(name))output=output.replaceAll(value,'[redacted]');
    output=output.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]');
    const migrationMismatches:Array<{file:string;expected:string;actual:string}>=[];
    if(file==='scripts/db-migrate.ts'){
     try{const manifest=JSON.parse(readFileSync(join(cwd,'migrations/manifest.json'),'utf8'));
      for(const entry of manifest.migrations){if(!/^\d{3}-[a-z0-9-]+\.cjs$/.test(entry.file))continue;
       const actual=createHash('sha256').update(readFileSync(join(cwd,'migrations',entry.file))).digest('hex');
       if(actual!==entry.sha256)migrationMismatches.push({file:entry.file,expected:entry.sha256,actual});
      }
     }catch{/* Preserve original failure even if the diagnostic snapshot is incomplete. */}
    }
    writeFileSync(join(diagnosticRoot,`${randomUUID()}.json`),JSON.stringify({file,reason,status:result.status,signal:result.signal,output,migrationMismatches}),{mode:0o600,flag:'wx'});
    throw new Error(`Disposable ${file} failed (${reason}; status=${result.status}; signal=${result.signal}); inspect the selected test environment`);
  }
}

/** Owns only a clone of the guarded, separately marked test database. */
export async function withPlanEvalEnvironment<T>(
  run: (environment: PlanEvalEnvironment) => Promise<T>,
  options: PlanEvalOptions = {},
): Promise<T> {
  const remaining = (maximumMs = 5_000) => ownedEvalTimeout(options.deadlineAt,maximumMs);
  remaining();
  const sourceUrl = new URL(requireEvaluationSourceDatabase(options.sourceDatabaseUrl ?
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
  const portLease = await reserveOwnedEvalPort();
  const origin = `http://127.0.0.1:${portLease.port}`;
  let evePortLease:Awaited<ReturnType<typeof reserveOwnedEvalPort>>|undefined;
  let eveProxyLease:Awaited<ReturnType<typeof reserveOwnedEvalPort>>|undefined;
  const prior: Record<string, string | undefined> = Object.fromEntries(["DATABASE_URL","DATABASE_URL_UNPOOLED",
    "TURAS_TEST_DATABASE_URL","TURAS_ENVIRONMENT_ID","TURAS_APP_ORIGIN",
    "TURAS_ARTIFACT_STORE_ROOT","TURAS_TEST_SOURCE_DATABASE_URL"].map((key) =>
      [key,process.env[key]]));
  let created = false;
  const ownership = `turas-owned-${feature}-${randomUUID()}`;
  let prepared = false;
  let child: ChildProcess | null = null;
  let productionEve:ChildProcess|null=null,productionProxy:Server|null=null;
  const closeProductionProxy=async()=>{const current=productionProxy;productionProxy=null;if(current){current.closeAllConnections();await new Promise<void>(done=>current.close(()=>done()));}};
  let startupTail = "";
  let bodyFailed=false,bodyFailure:unknown;
    async function stopRuntime(): Promise<void> {
      const children=await Promise.allSettled([stopChild(child),stopChild(productionEve)]);
      if(children[0].status==='fulfilled')child=null;if(children[1].status==='fulfilled')productionEve=null;
      const remaining=await Promise.allSettled([closeProductionProxy(),stopOwnedAppProcesses(appRoot)]);
      const failures=[...children,...remaining].filter((result):result is PromiseRejectedResult=>result.status==='rejected');
      if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Owned evaluation runtime retirement unverified');
    }
  try {
    if(options.production){evePortLease=await reserveOwnedEvalPort();eveProxyLease=await reserveOwnedEvalPort();}
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
    }else if(process.env.TURAS_ARTIFACT_STORE_ROOT){
      // Nested owned regression clones inherit public runtime assets, never
      // originals or app payloads from a configured application store.
      const sourceStore=process.env.TURAS_ARTIFACT_STORE_ROOT;
      const sourcePath=await realpath(sourceStore).catch(()=>null),ownedRoot=await realpath(resolve('local-artifacts'));
      if(sourcePath?.startsWith(ownedRoot+'/')&&!(await lstat(sourceStore)).isSymbolicLink()){
        const marker=JSON.parse(await readFile(join(sourceStore,'.turas-artifact-store.json'),'utf8'));
        if(marker.environmentId===process.env.TURAS_ENVIRONMENT_ID&&String(marker.environmentId).startsWith('test-')){
          for(const component of ['runtime-images.json','signatures','assets'])if(await lstat(join(sourceStore,component)).catch(()=>null))
            copyOwnedEvalFiles(join(sourceStore,component),join(storeRoot,component),{deadlineAt:options.deadlineAt});
        }
      }
    }
    await writeFile(join(storeRoot,".turas-artifact-store.json"),
      JSON.stringify({environmentId:testMarker}),{mode:0o600});
    for (const file of [...sourceFiles,...(feature === "009" ? ["report-renderer","report-templates"] : [])]) {
      remaining();
      copyOwnedEvalFiles(resolve(file),join(appRoot,file),{
        deadlineAt:options.deadlineAt,excludeRuntime:true,
      });
    }
    await symlink(resolve("node_modules"),join(appRoot,"node_modules"));
    await symlink(resolve("packages/artifact-extractor/node_modules"),
      join(appRoot,"packages/artifact-extractor/node_modules"));
    await configureOwnedNextDependencyRoot(appRoot);
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

    let productionBuilt=false;
    async function start(): Promise<void> {
      remaining();
      if (child) throw new Error("Disposable app already running");
      startupTail = "";
      const port = new URL(origin).port;
      const productionEnv=options.production?{
        EVE_NEXT_PRODUCTION_PORT:String(evePortLease!.port),
        EVE_NEXT_PRODUCTION_ORIGIN:`http://127.0.0.1:${eveProxyLease!.port}`,
        // The unnamed public agent remains at /eve/v1; only the private
        // service prefix is stripped by our owned self-hosting proxy.
        EVE_PUBLIC_ROUTE_PREFIX:"",
      }:{};
      const capture = (chunk: Buffer) => { startupTail =
        (startupTail+chunk.toString("utf8")).slice(-200_000); };
      if(options.production&&!productionBuilt){
        const buildDeadline=Date.now()+remaining(600_000);
        const building=spawnPlanChild(process.execPath,["scripts/build-check.mjs"],{
          cwd:appRoot,env:{...process.env,...productionEnv,...await qualityChildEnvironment(),NODE_ENV:"production",PORT:port,NODE_OPTIONS:""},
        });
        child=building;building.stdout?.on("data",capture);building.stderr?.on("data",capture);
        let timedOut=false;
        const code=await new Promise<number|null>((done,reject)=>{
          const timer=setTimeout(()=>{timedOut=true;void stopChild(building).catch(reject);},ownedEvalTimeout(buildDeadline,600_000));
          building.once("error",error=>{clearTimeout(timer);reject(error);});
          building.once("exit",code=>{clearTimeout(timer);done(code);});
        });
        await stopChild(building);child=null;remaining();
        if(timedOut||code!==0){
          await writeFile(resolve(`local-artifacts/${feature}/eval-production-build-failure.log`),startupTail,{mode:0o600});
          throw Error(timedOut?"Disposable production build deadline exceeded":"Disposable production build failed");
        }
        productionBuilt=true;
      }
      if(options.production){
        await evePortLease!.release();
        productionEve=spawnPlanChild(process.execPath,[join(appRoot,".output/server/index.mjs")],{
          cwd:appRoot,env:{...process.env,...productionEnv,...await qualityChildEnvironment(),NODE_ENV:"production",NODE_OPTIONS:"",
            HOST:"127.0.0.1",NITRO_HOST:"127.0.0.1",PORT:String(evePortLease!.port),NITRO_PORT:String(evePortLease!.port)},
        });
        productionEve.stdout?.on("data",capture);productionEve.stderr?.on("data",capture);
        // Documented non-Vercel composition: stream the actual service response
        // after stripping only its exact private mount. No response is mocked.
        productionProxy=createServer((incoming,outgoing)=>{
          const prefix="/_eve_internal/eve";
          if(!incoming.url?.startsWith(prefix+"/")){outgoing.destroy();return;}
          const upstream=httpRequest({hostname:"127.0.0.1",port:evePortLease!.port,
            method:incoming.method,path:incoming.url.slice(prefix.length),headers:incoming.headers},response=>{
            if(!response.statusCode){outgoing.destroy();return;}
            outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
          });
          upstream.on("error",()=>outgoing.destroy());incoming.on("aborted",()=>upstream.destroy());
          outgoing.on("close",()=>upstream.destroy());incoming.pipe(upstream);
        });
        await eveProxyLease!.release();
        await new Promise<void>((done,reject)=>{productionProxy!.once("error",reject);productionProxy!.listen(eveProxyLease!.port,"127.0.0.1",done);});
      }
      await portLease.release();
      child = spawnPlanChild(process.execPath,options.production?
        ["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",port]:["scripts/dev.mjs"],{
        cwd:appRoot,env:{...process.env,...productionEnv,...await qualityChildEnvironment(),NODE_ENV:options.production?"production":"development",PORT:port,NODE_OPTIONS:""},
      });
      child.stdout?.on("data",capture);
      child.stderr?.on("data",capture);
      const readinessStarted=Date.now();
      let lastAuthStatus:number|null=null,lastEveStatus:number|null=null;
      let authTransport='none',eveTransport='none',probeCount=0;
      const readinessDeadline = Date.now()+remaining(90_000);
      while (Date.now()<readinessDeadline) {
        if (child.exitCode !== null || productionEve&&productionEve.exitCode!==null) break;
        try {
          const [auth,eve] = await Promise.all([
            probePlanReadiness(origin,'/api/auth/session',readinessDeadline),
            probePlanReadiness(origin,'/eve/v1/health',readinessDeadline),
          ]);
          lastAuthStatus=auth.status;lastEveStatus=eve.status;
          probeCount++;authTransport=auth.transport;eveTransport=eve.transport;
          const ready = auth.status === 401 && eve.status!==null && eve.status>=200 && eve.status<300;
          if (ready) { remaining();return; }
        } catch { /* App is still starting. */ }
        if (Date.now()<readinessDeadline) await new Promise((done) => setTimeout(done,ownedEvalTimeout(readinessDeadline,500)));
      }
      await writeFile(resolve(`local-artifacts/${feature}/eval-startup-failure.log`),
        startupTail,{mode:0o600});
      const workerExitKinds=[...new Set([...startupTail.matchAll(/"kind":"turas_worker_exit","worker":"(maintenance|artifacts|reports)"/g)].map(match=>match[1]))];
      const categories=[...new Set([
        /ERR_MODULE_NOT_FOUND|Cannot find module/.test(startupTail)?'module_not_found':null,
        /fatal: not a git repository/.test(startupTail)?'git_identity':null,
        /Invalid environment|Invalid server configuration|ZodError/.test(startupTail)?'configuration':null,
        /Failed to compile|Module not found|Build error/.test(startupTail)?'compile':null,
        workerExitKinds.length?'worker_exit':null,
      ].filter(Boolean))];
      const diagnostic={kind:'owned_app_readiness_failure',mode:options.production?'production':'development',elapsedMs:Date.now()-readinessStarted,
        nextExitCode:child.exitCode,nextExitSignal:child.signalCode,eveExitCode:productionEve?.exitCode??null,eveExitSignal:productionEve?.signalCode??null,lastAuthStatus,lastEveStatus,authTransport,eveTransport,probeCount,
        nextReadyTextObserved:/Ready in/i.test(startupTail),compilingTextObserved:/Compiling/i.test(startupTail),eveListeningTextObserved:/server listening at http:\/\/127\.0\.0\.1:\d{1,5}\//.test(startupTail),workerExitKinds,categories};
      await writeFile(resolve(`local-artifacts/${feature}/eval-startup-failure.json`),JSON.stringify(diagnostic),{mode:0o600});
      console.error(JSON.stringify(diagnostic));
      throw new Error("Disposable app failed readiness");
    }

    remaining();
    return await run({databaseName:name,appRoot,storeRoot,origin,bootstrapDemo:()=>runGuardedScript("scripts/bootstrap-demo.ts",appRoot,process.env,[],options.deadlineAt),start,stop:stopRuntime,
      restart:async () => { await stopRuntime();await start(); },
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
  } catch(error){bodyFailed=true;bodyFailure=error;throw error;} finally {
   try{
    const retirement=await Promise.allSettled([portLease.release(),evePortLease?.release(),eveProxyLease?.release(),stopRuntime(),closeRuntimePool()]);
    const failures=retirement.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
    if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Owned evaluation cleanup unverified; target retained');
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
   }catch(error){if(bodyFailed)throw new AggregateError([bodyFailure,error],'Owned evaluation and cleanup failed');throw error;}
   finally{for(const [key,value]of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  }
}
