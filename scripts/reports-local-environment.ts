import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {closeRuntimePool} from '../lib/server/db/client';
import {mkdir,writeFile} from 'node:fs/promises';

const image='pgvector/pgvector@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f';
/** An owned local Postgres source removes network latency from deterministic gates.
 * No CLI database/container overrides, bind mounts, app DB writes, or live services. */
export async function withReportsLocalEnvironment<T>(run:()=>Promise<T>):Promise<T>{
 const id=randomUUID().replaceAll('-',''),name=`turas-009-check-${id.slice(0,12)}`,database=`turas_test_009_local_${id.slice(0,12)}`,
  marker=`test-report-${id.slice(0,12)}`,password=randomBytes(32).toString('hex');
 const keys=['DATABASE_URL','DATABASE_URL_UNPOOLED','TURAS_TEST_DATABASE_URL','TURAS_TEST_ENVIRONMENT_ID','TURAS_ENVIRONMENT_ID','TURAS_TEST_SOURCE_DATABASE_URL','AI_GATEWAY_API_KEY','TURAS_ALLOW_LIVE_MODEL_TESTS','TURAS_REPORT_DELIVERY_ENABLED'];
 const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));let created=false;
 try{
  await closeRuntimePool();
  execFileSync('docker',['run','--detach','--name',name,'--label',`turas.009.owner=${id}`,'--cpus','2','--memory','2g','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD','--env',`POSTGRES_DB=${database}`,image],
   {env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe'],timeout:120000});created=true;
  const port=execFileSync('docker',['port',name,'5432/tcp'],{encoding:'utf8'}).trim();if(!/^127\.0\.0\.1:\d+$/.test(port))throw new Error('Owned database binding invalid');
  const url=`postgresql://postgres:${password}@${port}/${database}`;
  let ready=false;const deadline=Date.now()+60000;
  while(Date.now()<deadline){const db=new Client({connectionString:url,connectionTimeoutMillis:1000});try{await db.connect();await db.query('SELECT 1');ready=true;break;}catch{await new Promise(done=>setTimeout(done,250));}finally{await db.end().catch(()=>{});}}
  if(!ready)throw new Error('Owned local database unavailable');
  Object.assign(process.env,{DATABASE_URL:url,DATABASE_URL_UNPOOLED:url,TURAS_TEST_DATABASE_URL:url,TURAS_TEST_ENVIRONMENT_ID:marker,TURAS_ENVIRONMENT_ID:marker,
   AI_GATEWAY_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0',TURAS_REPORT_DELIVERY_ENABLED:'false'});
  const db=new Client({connectionString:url});await db.connect();try{await db.query('CREATE ROLE turas_runtime NOLOGIN');}finally{await db.end();}
  for(const [file,args]of [['scripts/db-migrate.ts',['--init']],['scripts/db-roles.ts',[]],['scripts/bootstrap-demo.ts',[]]] as const){
   const result=spawnSync(process.execPath,['--experimental-strip-types',file,...args],{env:process.env,encoding:'utf8',timeout:120000});
   if(result.status!==0){await mkdir('local-artifacts/009',{recursive:true,mode:0o700});await writeFile('local-artifacts/009/local-environment-failure.log',result.stdout+result.stderr,{mode:0o600});throw new Error(`Owned local setup failed at ${file}`);}
  }
  // Unscoped runtime access points at an absent owned-local application DB, never
  // the test source or the maintainer's configured application database.
  const unselected=new URL(url);unselected.pathname='/turas_unselected_009';
  process.env.DATABASE_URL=unselected.toString();process.env.DATABASE_URL_UNPOOLED=unselected.toString();
  return await run();
 }finally{
  await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
  if(created){const owner=execFileSync('docker',['inspect','--format','{{index .Config.Labels "turas.009.owner"}}',name],{encoding:'utf8'}).trim();
   if(owner!==id)throw new Error('Owned container marker changed; cleanup refused');
   execFileSync('docker',['rm','--force','--volumes',name],{stdio:['ignore','pipe','pipe'],timeout:30000});
  }
 }
}
