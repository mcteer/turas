import { spawnSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

if (Number(process.versions.node.split(".")[0]) !== 24) throw Error("Run this check with Node 24");
// The same supervised withEve disposable application used by native acceptance.
// This branch runs only inside the marked local database established below.
if (process.argv.includes("--webkit-child")) {
  const { withPlanEvalEnvironment } = await import("./plan-eval-environment.ts");
  const files = ["legacy-login-native.spec.ts", "legacy-source-library.spec.ts",
    "ordinary-operations.spec.ts", "legacy-context-journey.spec.ts"].map(file=>"tests/ui/"+file);
  await withPlanEvalEnvironment(async environment => {
    const bootstrap=spawnSync(process.execPath,["--experimental-strip-types","scripts/bootstrap-demo.ts"],
      {cwd:environment.appRoot,env:process.env,encoding:"utf8"});
    if(bootstrap.status!==0)throw Error("Owned 018 UI bootstrap failed");
    process.env.CI="true";
    process.env.TURAS_UI_BASE_URL=environment.origin;
    process.env.TURAS_UI_FIXTURE_DATABASE_URL=process.env.DATABASE_URL_UNPOOLED;
    process.env.TURAS_EXECUTION_FIXTURE_READY="1";
    // This is only the disposable development clone. Keep the real compiled
    // routes resident while all four projects run; production config is intact.
    const configPath=join(environment.appRoot,"next.config.ts"),config=readFileSync(configPath,"utf8");
    const configAnchor="const nextConfig: NextConfig = {";
    if(config.split(configAnchor).length!==2)throw Error("Owned Next config shape changed");
    writeFileSync(configPath,config.replace(configAnchor,configAnchor+"\n  onDemandEntries: { maxInactiveAge: 1_200_000, pagesBufferLength: 32 },"));
    await environment.start();
    // Pay cold Next compilation before the unchanged 30-second scenario clocks.
    // Every response is real authenticated HTTP against the marked owned clone.
    const warmupFolder="local-artifacts/018/ci-webkit";mkdirSync(warmupFolder,{recursive:true,mode:0o700});
    const warmupStarted=Date.now(),warmupDeadline=warmupStarted+180_000,warmup=[];
    const warmupUrl=process.env.DATABASE_URL_UNPOOLED;
    if(!warmupUrl||!['127.0.0.1','localhost','[::1]'].includes(new URL(warmupUrl).hostname)||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(warmupUrl).pathname))throw Error("Owned route warmup database required");
    const warmupDb=new Client({connectionString:warmupUrl,connectionTimeoutMillis:5000});
    const warmupCustomer=randomUUID();await warmupDb.connect();
    try{
      const marker=(await warmupDb.query('SELECT environment_id FROM turas_environment')).rows;
      if(marker.length!==1||marker[0].environment_id!==process.env.TURAS_ENVIRONMENT_ID)throw Error("Owned route warmup marker differs");
      const actor=(await warmupDb.query("SELECT m.workspace_id FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE p.login_name='mcteer' AND p.active AND m.active")).rows;
      if(actor.length!==1)throw Error("Owned route warmup actor ambiguous");
      await warmupDb.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic018 route compilation account',false)",[warmupCustomer,actor[0].workspace_id]);
    }finally{await warmupDb.end();}
    let warmupCookie,warmupCsrf;
    const warmupFetch=async(path,options={})=>{
      const remaining=warmupDeadline-Date.now();if(remaining<=0)throw Error("Owned route warmup deadline exceeded");
      return fetch(environment.origin+path,{...options,signal:AbortSignal.timeout(Math.min(30_000,remaining))});
    };
    try{
      const login=await warmupFetch('/api/auth/login',{method:'POST',headers:{origin:environment.origin,'content-type':'application/json'},body:JSON.stringify({username:'mcteer',password:process.env.TURAS_DEMO_PASSWORD})});
      if(!login.ok)throw Error("Owned route warmup login failed");
      warmupCookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');warmupCsrf=(await login.json()).data.csrfToken;
      if(!warmupCookie||!warmupCsrf)throw Error("Owned route warmup session missing");
      const routes=[['/login',200],['/api/auth/login',405],['/s',200],['/customers',200],['/portfolio',200],['/operating-model',200],
        ['/context-approvals',200],[`/customers/${warmupCustomer}`,200],[`/customers/${warmupCustomer}/sources`,200],
        [`/customers/${warmupCustomer}/review`,200],[`/customers/${warmupCustomer}/journey`,200],
        ['/api/auth/session',200],['/api/conversations?limit=25&archived=false',200],['/api/context-approvals?includeDenied=false&offset=0',200],
        [`/api/customers/${warmupCustomer}/sources`,200],[`/api/customers/${warmupCustomer}/review`,200],
        [`/api/customers/${warmupCustomer}/profile`,200],[`/api/customers/${warmupCustomer}/journey`,200],
        [`/api/customers/${warmupCustomer}/commands`,405],[`/api/customers/${warmupCustomer}/records/${randomUUID()}/history`,404]];
      for(const[path,expected]of routes){const started=Date.now(),response=await warmupFetch(path,{headers:{cookie:warmupCookie}});await response.arrayBuffer();warmup.push({path,status:response.status,expected,durationMs:Date.now()-started});writeFileSync(join(warmupFolder,'warmup-private.json'),JSON.stringify({durationMs:Date.now()-warmupStarted,routes:warmup},null,2),{mode:0o600});if(response.status!==expected)throw Error("Owned route warmup response differs");}
    }finally{
      if(warmupCookie&&warmupCsrf){const logout=await warmupFetch('/api/auth/logout',{method:'POST',headers:{origin:environment.origin,cookie:warmupCookie,'x-csrf-token':warmupCsrf}});await logout.arrayBuffer();if(!logout.ok)throw Error("Owned route warmup logout unconfirmed");}
    }
    // Keep draining the supervised Next/Eve log pipes while the CLI runs.
    // A synchronous wait fills those pipes and stalls the real application.
    const result=await new Promise(resolve=>{
      const child=spawn(process.execPath,["node_modules/@playwright/test/cli.js","test",...files,
        "--reporter=json","--forbid-only","--retries=0"],{cwd:environment.appRoot,env:process.env,
        stdio:["ignore","pipe","pipe"],detached:true});
      let stdout="",stderr="",error,force;
      const terminate=()=>{
        if(!child.pid)return;
        try{process.kill(-child.pid,"SIGTERM");}catch{}
        force??=setTimeout(()=>{try{process.kill(-child.pid,"SIGKILL");}catch{}},5_000);
      };
      const timer=setTimeout(()=>{error=Error("018 UI process deadline exceeded");terminate();},1_200_000);
      const capture=(chunk,kind)=>{
        if(error)return;
        if(kind==="stdout")stdout+=chunk.toString();else stderr+=chunk.toString();
        if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)>12*1024*1024){error=Error("018 UI output bound exceeded");terminate();}
      };
      child.stdout.on("data",chunk=>capture(chunk,"stdout"));child.stderr.on("data",chunk=>capture(chunk,"stderr"));
      child.on("error",failure=>{error=failure;});
      child.on("close",status=>{clearTimeout(timer);if(force)clearTimeout(force);resolve({status,error,stdout,stderr});});
    });
    const folder="local-artifacts/018/ci-webkit";mkdirSync(folder,{recursive:true,mode:0o700});
    writeFileSync(join(folder,"report-private.json"),result.stdout??"",{mode:0o600});
    writeFileSync(join(folder,"stderr-private.log"),result.stderr??"",{mode:0o600});
    writeFileSync(join(folder,"app-private.log"),environment.privateLogTail(),{mode:0o600});
    const images=join(environment.appRoot,"local-artifacts/018");
    if(existsSync(images))for(const name of readdirSync(images))
      if(/^(?:source-library|context-approvals|customer-journey)-webkit-(?:desktop|mobile)-(?:light|dark)\.png$/.test(name))
        copyFileSync(join(images,name),join(folder,name));
    if(result.error||result.status!==0){
      const failures=[];let reportParseFailed=false;
      try{
        const collect=suite=>{
          for(const spec of suite.specs??[])for(const test of spec.tests??[]){
            const failed=(test.results??[]).filter(value=>["failed","timedOut","interrupted"].includes(value.status));
            for(const value of failed){
              const text=String(value.error?.message??"");
              failures.push({file:String(spec.file??suite.file??"").split(/[\\/]/).at(-1),line:spec.line,
                project:test.projectName,status:value.status,
                category:/timeout|timed out/i.test(text)?"timeout":/expect|assert/i.test(text)?"assertion":"runtime",
                errorLine:value.error?.location?.line});
            }
          }
          for(const child of suite.suites??[])collect(child);
        };
        for(const suite of JSON.parse(result.stdout).suites??[])collect(suite);
      }catch{reportParseFailed=true;}
      console.error(JSON.stringify({kind:"legacy_webkit_failure",reportParseFailed,
        runnerFailed:Boolean(result.error),failures:failures.slice(0,20)}));
      throw Error("018 actual WebKit acceptance failed; inspect private report");
    }
    const report=JSON.parse(result.stdout);
    if(report.stats.expected!==20||report.stats.unexpected||report.stats.flaky||report.stats.skipped)
      throw Error("018 WebKit requires all20cases acrossfourprojects without skips or retries");
    console.log(JSON.stringify({gate:"018-webkit",actualEve:true,projects:4,passed:20,skipped:0}));
  },{feature:"010",deadlineAt:Date.now()+1_800_000,prepare:async({appRoot})=>{
    const {readFile,writeFile,copyFile}=await import("node:fs/promises");
    await copyFile("playwright.config.ts",join(appRoot,"playwright.config.ts"));
    const dev=join(appRoot,"scripts/dev.mjs");
    await writeFile(dev,(await readFile(dev,"utf8")).replace('["dev"]','["dev","--webpack"]'),{mode:0o600});
    return {};
  }});
  process.exit(0);
}
const acceptanceOnly=["--webkit","--native-operations","--native-staged-4","--native-staged-10","--native-task-state","--native-questions"].some(flag=>process.argv.includes(flag));
mkdirSync("local-artifacts",{recursive:true,mode:0o700});
const name = `turas-parity-owned-${process.pid}`;
const directory = mkdtempSync(join(tmpdir(),"turas-parity-owned-"));
const password = randomBytes(24).toString("hex");
const envFile = join(directory,"docker.env");
writeFileSync(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=turas_test_parity\n`,{mode:0o600});
let created = false;
let output = "";
function docker(args) { return spawnSync("docker",args,{encoding:"utf8"}); }
try {
  const context = docker(["context","inspect"]);
  if(context.status!==0 || !JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host?.startsWith("unix://") || process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://")) throw Error("A local Docker socket is required");
  const started = docker(["run","-d","--name",name,"--env-file",envFile,"-p","127.0.0.1::5432","pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f"]);
  if(started.status!==0) throw Error("Owned database startup failed");
  created = true;
  const port = docker(["port",name,"5432/tcp"]).stdout.trim().split(":").at(-1);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/turas_test_parity`;
  let db;
  for(let i=0;i<50;i++) {
    const candidate = new Client({connectionString:url});
    try { await candidate.connect(); db=candidate; break; }
    catch { await candidate.end().catch(()=>{}); await new Promise(resolve=>setTimeout(resolve,200)); }
  }
  if(!db) throw Error("Owned database unavailable");
  await db.query("CREATE ROLE turas_runtime"); await db.end();
  const environment = {...process.env,DATABASE_URL:url,DATABASE_URL_UNPOOLED:url,
    TURAS_ENVIRONMENT_ID:"test-parity-disposable",TURAS_APP_ORIGIN:"http://localhost:3916",
    TURAS_DEMO_USERNAME:"mcteer",TURAS_DEMO_PASSWORD:"synthetic-test-password",
    PANEL_USERNAME:"panel",PANEL_PASSWORD:"synthetic-test-password",
    PARTNER_USERNAME:"partner",PARTNER_PASSWORD:"synthetic-test-password",
    TURAS_MAINTENANCE_SECRET:randomBytes(32).toString("hex"),AI_GATEWAY_API_KEY:"",VERCEL_OIDC_TOKEN:"",CONTEXT_API_KEY:"",CONTEXT_DEV_API_KEY:"",TURAS_ALLOW_LIVE_MODEL_TESTS:"0",TSX_DISABLE_CACHE:"1",VERCEL_ENV:""};
  function run(args,env=environment) {
    const result = spawnSync(process.execPath,args,{env,encoding:"utf8",maxBuffer:12*1024*1024});
    output += (result.stdout??"")+(result.stderr??"");
    writeFileSync(join(directory,"checks.log"),output,{mode:0o600});
    if(result.status!==0) { writeFileSync("local-artifacts/legacy-parity-disposable-failure-private.log",output,{mode:0o600}); throw Error(`Disposable parity check failed (${args.find(value=>value.startsWith("scripts/"))??"tests"})`); }
  }
  run(["--experimental-strip-types","scripts/db-migrate.ts","--init"]);
  run(["--experimental-strip-types","scripts/db-roles.ts"]);
  run(["--experimental-strip-types","scripts/bootstrap-demo.ts"]);
  const integrationEnvironment={...environment,
    DATABASE_URL:"postgresql://unused:unused@127.0.0.1:1/application",
    DATABASE_URL_UNPOOLED:"postgresql://unused:unused@127.0.0.1:1/application",
    TURAS_TEST_DATABASE_URL:url,TURAS_TEST_ENVIRONMENT_ID:environment.TURAS_ENVIRONMENT_ID};
  if(!acceptanceOnly&&!process.argv.includes("--native-only")&&!process.argv.includes("--native-files-only"))run(["node_modules/vitest/vitest.mjs","run","tests/integration/named-customer-chat.test.ts",
    "tests/integration/general-chat.test.ts","tests/integration/ordinary-attachments.test.ts","tests/integration/ordinary-native-files.test.ts","tests/integration/legacy-research-transactions.test.ts",
    "tests/integration/parity-evaluation-budget.test.ts","tests/integration/specialist-profile-persistence.test.ts","tests/integration/legacy-knowledge-mechanics.test.ts","tests/integration/live-customer-chat.test.ts","tests/integration/ordinary-steering.test.ts","tests/integration/legacy-document-formats.test.ts","tests/integration/research-maintenance.test.ts","tests/integration/retrieval-retention.test.ts","tests/integration/retrieval-service.test.ts","tests/integration/profile-context.test.ts","tests/integration/public-customer-inventory.test.ts",
    "tests/integration/legacy-profile-products.test.ts","tests/integration/legacy-source-library.test.ts",
    "tests/integration/legacy-adoption-cohorts.test.ts","tests/integration/legacy-workspace-review.test.ts",
    "tests/integration/legacy-journey-page.test.ts","tests/integration/legacy-journey-search.test.ts",
    "tests/integration/legacy-conversation-search.test.ts","tests/integration/ordinary-operations.test.ts",
    "tests/integration/legacy-native-uploads.test.ts","tests/integration/research-public-persistence.test.ts",
    "tests/integration/research-workflow.test.ts",
    "tests/unit/legacy-source-library-route.test.ts","tests/unit/legacy-adoption-cohort-boundaries.test.ts",
    "tests/unit/legacy-task-checklist.test.ts","tests/unit/ordinary-operations.test.ts",
    "tests/integration/profile-research.test.ts","tests/unit/research-evidence.test.ts",
    "tests/unit/research-fetch.test.ts","tests/unit/research-finalization-failure.test.ts",
    "tests/unit/research-retained-claim.test.ts","tests/unit/research-public-dossier.test.ts",
    "tests/unit/legacy-specialist-contracts.test.ts","tests/unit/legacy-research-reader.test.ts",
    "tests/unit/research-refresh.test.ts","tests/unit/research-maintenance-route.test.ts",
    "tests/unit/research-public-checkpoint.test.ts"],integrationEnvironment);
  // Route contracts read DATABASE_URL directly; they do not use the integration
  // fixture's explicit test-database selector.
  const contractUrl=new URL(url);contractUrl.searchParams.set('options','-c role=turas_runtime');
  if(!acceptanceOnly&&!process.argv.includes("--native-only")&&!process.argv.includes("--native-files-only"))run(["node_modules/vitest/vitest.mjs","run","tests/contracts/general-chat.test.ts"],{...environment,DATABASE_URL:contractUrl.toString(),DATABASE_URL_UNPOOLED:contractUrl.toString()});
  if(process.argv.includes('--webkit'))run(['--import','tsx','scripts/check-legacy-parity-disposable.mjs','--webkit-child'],integrationEnvironment);
  if(process.argv.includes('--native-operations'))run(['--import','tsx','scripts/check-ordinary-operations-native.ts','--knowledge'],integrationEnvironment);
  if(process.argv.includes('--native-staged-4'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--composer','--steer','--staged-4'],integrationEnvironment);
  if(process.argv.includes('--native-staged-10'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--composer','--staged-10'],integrationEnvironment);
  if(process.argv.includes('--native-questions'))run(['--import','tsx','scripts/check-ordinary-questions-native.ts'],integrationEnvironment);
  if(process.argv.includes('--native-task-state'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--composer','--task-state'],integrationEnvironment);
  if(process.argv.includes('--execution-handoff'))run(['--import','tsx','scripts/check-execution-ui.ts','--us4','webkit-desktop-light'],integrationEnvironment);
  if(process.argv.includes('--native-memory-files'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--memory-files'],integrationEnvironment);
  if(process.argv.includes('--native-memory'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--memory'],integrationEnvironment);
  if(process.argv.includes('--native-files-steer-ui'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--composer','--steer'],integrationEnvironment);
  if(process.argv.includes('--native-files-ui'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--composer'],integrationEnvironment);
  if(process.argv.includes('--native-files-steer'))run(['--import','tsx','scripts/check-ordinary-native-files.ts','--steer'],integrationEnvironment);
  if(process.argv.includes('--native-files'))run(['--import','tsx','scripts/check-ordinary-native-files.ts'],integrationEnvironment);
  if(process.argv.includes('--documents-ui'))run(['--import','tsx','scripts/check-ordinary-chat-ui.ts','--documents-only'],integrationEnvironment);
  if(process.argv.includes('--chat-ui'))run(['--import','tsx','scripts/check-ordinary-chat-ui.ts'],integrationEnvironment);
  if(process.argv.includes('--earlier-regressions'))run(['--import','tsx','scripts/test-staffing-regressions.ts'],integrationEnvironment);
  if(process.argv.includes('--artifact-journey'))run(['--import','tsx','scripts/check-legacy-artifact-publication.ts'],integrationEnvironment);
  if(process.argv.includes('--native')||process.argv.includes('--native-only'))run(['--import','tsx','scripts/check-ordinary-chat-native.ts'],integrationEnvironment);
  mkdirSync("local-artifacts/018/ci-disposable",{recursive:true,mode:0o700});
  const gateName=process.argv.find(flag=>["--webkit","--native-operations","--native-staged-4","--native-staged-10","--native-task-state","--native-questions"].includes(flag))?.slice(2)??"domains";
  writeFileSync(join("local-artifacts/018/ci-disposable",gateName+"-private.log"),output,{mode:0o600});
  console.log(JSON.stringify({gate:acceptanceOnly?process.argv.find(flag=>["--webkit","--native-operations","--native-staged-4","--native-staged-10","--native-task-state","--native-questions"].includes(flag)):"domains",ownedDisposableDatabase:true,migrationsAndRuntimeGrants:true,passed:true,paidProviderCalls:0}));
} catch(error) {
  console.error(error.message);
  // Tests contain only locally created fixture data. Credentials and startup
  // details stay private; report the bounded test failure section only.
  const failure=output.indexOf("Failed Tests");
  if(failure>=0) console.error(output.slice(failure,failure+5000));
  for(const line of output.split("\n"))if(line.startsWith('{"kind":"native_file_fixture_failure"')||line.startsWith('{"kind":"legacy_webkit_failure"'))console.error(line);
  process.exitCode=1;
} finally {
  if(created && docker(["rm","-f","-v",name]).status!==0) {
    console.error(`Cleanup failed for owned container ${name}`); process.exitCode=1;
  }
  rmSync(directory,{recursive:true,force:true});
}
