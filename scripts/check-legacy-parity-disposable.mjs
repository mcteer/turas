import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

if (Number(process.versions.node.split(".")[0]) !== 24) throw Error("Run this check with Node 24");
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
    TURAS_MAINTENANCE_SECRET:randomBytes(32).toString("hex"),AI_GATEWAY_API_KEY:"",VERCEL_OIDC_TOKEN:"",CONTEXT_API_KEY:"",CONTEXT_DEV_API_KEY:"",VERCEL_ENV:""};
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
  if(!process.argv.includes("--native-only")&&!process.argv.includes("--native-files-only"))run(["node_modules/vitest/vitest.mjs","run","tests/integration/named-customer-chat.test.ts",
    "tests/integration/general-chat.test.ts","tests/integration/ordinary-attachments.test.ts","tests/integration/ordinary-native-files.test.ts","tests/integration/legacy-research-transactions.test.ts",
    "tests/integration/parity-evaluation-budget.test.ts","tests/integration/specialist-profile-persistence.test.ts","tests/integration/legacy-knowledge-mechanics.test.ts","tests/integration/live-customer-chat.test.ts","tests/integration/ordinary-steering.test.ts","tests/integration/legacy-document-formats.test.ts","tests/integration/research-maintenance.test.ts","tests/integration/retrieval-retention.test.ts","tests/integration/public-customer-inventory.test.ts"],integrationEnvironment);
  // Route contracts read DATABASE_URL directly; they do not use the integration
  // fixture's explicit test-database selector.
  const contractUrl=new URL(url);contractUrl.searchParams.set('options','-c role=turas_runtime');
  if(!process.argv.includes("--native-only")&&!process.argv.includes("--native-files-only"))run(["node_modules/vitest/vitest.mjs","run","tests/contracts/general-chat.test.ts"],{...environment,DATABASE_URL:contractUrl.toString(),DATABASE_URL_UNPOOLED:contractUrl.toString()});
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
  console.log("Disposable migrations, runtime grants and chat, source-persistence, transaction and budget checks passed");
} catch(error) {
  console.error(error.message);
  // Tests contain only locally created fixture data. Credentials and startup
  // details stay private; report the bounded test failure section only.
  const failure=output.indexOf("Failed Tests");
  if(failure>=0) console.error(output.slice(failure,failure+5000));
  process.exitCode=1;
} finally {
  if(created && docker(["rm","-f","-v",name]).status!==0) {
    console.error(`Cleanup failed for owned container ${name}`); process.exitCode=1;
  }
  rmSync(directory,{recursive:true,force:true});
}
