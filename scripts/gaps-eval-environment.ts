import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { copyOwnedEvalFiles } from './eval-owned-copy';
import { reserveOwnedEvalPort } from './eval-port';
import { closeRuntimePool } from '../lib/server/db/client';

export function requireOwnedGapDatabase(env: NodeJS.ProcessEnv = process.env, owner = false) {
 const raw = env[owner ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'];
 if (!raw || env.TURAS_GAPS_OWNED !== '1' || !env.TURAS_ENVIRONMENT_ID?.startsWith('test-gap-') ||
     env.TURAS_TEST_ENVIRONMENT_ID !== env.TURAS_ENVIRONMENT_ID) throw Error('Gap checks require the owning runner');
 const url = new URL(raw);
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
     !/^\/turas_test_012_eval_[a-f0-9]{12}$/.test(url.pathname)) throw Error('Gap checks require an owned loopback database');
 return raw;
}
export type GapEnvironment = { appRoot: string; storeRoot: string; workflowRoot: string; origin: string;
 databaseName: string; environmentId: string; start: () => Promise<void>; startWorker: () => Promise<void>; crashWorker: () => Promise<void>; startSupervisor: () => Promise<void>; stop: () => Promise<void>;
 upgradeToCurrent: () => Promise<void> };
const safeParentKeys = ['PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT'] as const;
function command(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd(), timeout = 120_000) {
 const result = spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:1_000_000});
 if (result.error || result.status !== 0) throw Error(`Owned gap setup failed: ${cmd.split('/').pop()}`);
 return result.stdout.trim();
}
export async function withGapEnvironment<T>(run: (environment: GapEnvironment) => Promise<T>, options: { priorSchema?: 47; deadlineMs?: number } = {}): Promise<T> {
 if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Gap checks require Node 24');
 const digest = async () => createHash('sha256').update(await readFile('agent/agent.ts')).digest('hex');
 const agentDigest = await digest(), previous = { ...process.env };
 const selectedHash=async()=>{try{return createHash('sha256').update(await readFile('.env.local')).digest('hex');}catch(error){if((error as {code?:string}).code==='ENOENT')return null;throw error;}};const selectedBefore=await selectedHash();
 const safeEnv: NodeJS.ProcessEnv = { ...Object.fromEntries(safeParentKeys.map(k=>[k,process.env[k]])), NODE_ENV: 'test' };
 const token = randomUUID().replaceAll('-','').slice(0,12), name = `turas_test_012_eval_${token}`,
  container = `turas-012-check-${token}`, environmentId = `test-gap-${token}`, password = randomBytes(24).toString('hex');
 await mkdir(resolve('local-artifacts/012'),{recursive:true,mode:0o700});
 const root = await mkdtemp(resolve('local-artifacts/012/owned-')), appRoot=join(root,'app'),storeRoot=join(root,'reports'),workflowRoot=join(appRoot,'.eve/.workflow-data');
 const portLease = await reserveOwnedEvalPort();
 let created=false, child: ChildProcess | undefined,worker:ChildProcess|undefined;
 const deadline=Date.now()+(options.deadlineMs ?? 300_000);
 const remaining=()=>{const value=deadline-Date.now();if(value<=0)throw Error('Owned gap check deadline exceeded');return value;};
 async function stop(){if(worker){const current=worker;worker=undefined;if(current.exitCode===null)await new Promise<void>(done=>{const timer=setTimeout(()=>{current.kill('SIGKILL');done();},5000);current.once('exit',()=>{clearTimeout(timer);done();});current.kill('SIGTERM');});}if(!child)return;const current=child;child=undefined;if(current.exitCode===null)await new Promise<void>(done=>{const timer=setTimeout(()=>{current.kill('SIGKILL');done();},5000);current.once('exit',()=>{clearTimeout(timer);done();});current.kill('SIGTERM');});}
 try {
  created=true;command('docker',['run','--detach','--name',container,'--label',`turas.012.owner=${token}`,'--publish','127.0.0.1::5432','--env',`POSTGRES_PASSWORD=${password}`,'--env',`POSTGRES_DB=${name}`,'pgvector/pgvector:pg17'],safeEnv);created=true;
  const port=command('docker',['port',container,'5432/tcp'],safeEnv).split(':').at(-1)!;
  const ownerUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${name}`;
  const runtimeUrl=`postgresql://turas_runtime:${password}@127.0.0.1:${port}/${name}`;
  const pool=new Pool({connectionString:ownerUrl,connectionTimeoutMillis:1000});
  try{for(;;){remaining();try{await pool.query('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,250));}}
   const sql=(await pool.query("SELECT format('CREATE ROLE turas_runtime LOGIN PASSWORD %L',$1::text) AS sql",[password])).rows[0].sql;await pool.query(sql);
  }finally{await pool.end();}
  await mkdir(appRoot,{mode:0o700});await mkdir(storeRoot,{mode:0o700});await mkdir(workflowRoot,{recursive:true,mode:0o700});
  for(const file of ['app','agent','lib','migrations','scripts','public','evals','tests','packages','report-renderer','report-templates','next.config.ts','next-env.d.ts','playwright.config.ts','tsconfig.json','package.json'])copyOwnedEvalFiles(resolve(file),join(appRoot,file),{excludeRuntime:true,deadlineAt:deadline});
  await symlink(resolve('node_modules'),join(appRoot,'node_modules'));
  await symlink(resolve('packages/artifact-extractor/node_modules'),join(appRoot,'packages/artifact-extractor/node_modules'));
  await writeFile(join(storeRoot,'.turas-report-store.json'),JSON.stringify({environmentId}),{mode:0o600});await mkdir(join(storeRoot,'objects'),{mode:0o700});
  const configPath=join(appRoot,'next.config.ts');const config=await readFile(configPath,'utf8');
  await writeFile(configPath,config.replace('const nextConfig: NextConfig = {',`const nextConfig: NextConfig = {\n  turbopack: { root: ${JSON.stringify(resolve('.'))} },`));
  const origin=`http://127.0.0.1:${portLease.port}`;
  const env={...safeEnv,DATABASE_URL:runtimeUrl,DATABASE_URL_UNPOOLED:ownerUrl,TURAS_TEST_DATABASE_URL:ownerUrl,TURAS_ENVIRONMENT_ID:environmentId,TURAS_TEST_ENVIRONMENT_ID:environmentId,TURAS_GAPS_OWNED:'1',TURAS_APP_ORIGIN:origin,TURAS_REPORT_STORE_ROOT:storeRoot,TURAS_MAINTENANCE_SECRET:randomBytes(32).toString('hex'),TURAS_012_RECEIPT_HASH_KEYS:JSON.stringify([randomBytes(32).toString('hex')]),TURAS_DEMO_USERNAME:'mcteer',TURAS_DEMO_PASSWORD:'SyntheticGapPassword1!',PANEL_USERNAME:'panel',PANEL_PASSWORD:'SyntheticGapPassword2!',PARTNER_USERNAME:'partner',PARTNER_PASSWORD:'SyntheticGapPassword3!',TURAS_TEST_MODEL_MODE:'deterministic',NODE_ENV:'test',TURAS_REPORTS_ENABLED:'0',TURAS_REPORT_DELIVERY_ENABLED:'0'};
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
  const manifestPath=join(appRoot,'migrations/manifest.json'),full=await readFile(manifestPath,'utf8');let future:string[]=[];
  if(options.priorSchema){const manifest=JSON.parse(full);future=manifest.migrations.filter((m:{file:string})=>Number(m.file.slice(0,3))>47).map((m:{file:string})=>m.file);await mkdir(join(appRoot,'future'));for(const file of future)await rename(join(appRoot,'migrations',file),join(appRoot,'future',file));manifest.version=47;manifest.migrations=manifest.migrations.filter((m:{file:string})=>Number(m.file.slice(0,3))<=47);await writeFile(manifestPath,JSON.stringify(manifest));}
  const script=(file:string,args:string[]=[])=>command(process.execPath,['--experimental-strip-types',file,...args],process.env,appRoot,Math.min(remaining(),120_000));
  script('scripts/db-migrate.ts',['--init']);script('scripts/db-roles.ts');script('scripts/bootstrap-demo.ts');
  async function start(supervisor=false){if(child)throw Error('Owned gap app already started');await portLease.release();child=spawn(process.execPath,supervisor?['scripts/dev.mjs']:['node_modules/next/dist/bin/next','dev','--webpack','--port',String(portLease.port)],{cwd:appRoot,env:{...process.env,PORT:String(portLease.port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});let tail='';for(const stream of [child.stdout,child.stderr])stream?.on('data',b=>{tail=(tail+b.toString()).slice(-100000);});
   while(remaining()>0){if(child.exitCode!==null)break;try{const r=await fetch(`${origin}/api/auth/session`,{signal:AbortSignal.timeout(2000)});await r.body?.cancel();if(r.status===401)return;}catch{}await new Promise(r=>setTimeout(r,300));}
   await writeFile(resolve('local-artifacts/012',`startup-${token}.log`),tail.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]'),{mode:0o600});throw Error('Owned gap app failed readiness; inspect synthetic startup evidence');}
  return await run({appRoot,storeRoot,workflowRoot,origin,databaseName:name,environmentId,start:()=>start(),startSupervisor:()=>start(true),crashWorker:async()=>{if(!worker)throw Error('Owned worker not running');const current=worker;worker=undefined;current.kill('SIGKILL');if(current.exitCode===null)await new Promise<void>(done=>current.once('exit',()=>done()));},startWorker:async()=>{if(worker)throw Error('Owned gap worker already started');worker=spawn(process.execPath,['--import','tsx','scripts/reports-worker.ts'],{cwd:appRoot,env:process.env,stdio:'ignore'});await new Promise(r=>setTimeout(r,250));if(worker.exitCode!==null)throw Error('Owned gap worker failed startup');},stop,upgradeToCurrent:async()=>{if(!future.length)throw Error('No owned prior-schema fixture');for(const file of future)await rename(join(appRoot,'future',file),join(appRoot,'migrations',file));future=[];await writeFile(manifestPath,full);script('scripts/db-migrate.ts');script('scripts/db-roles.ts');}});
 } finally {
  await portLease.release();await stop();await closeRuntimePool();for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous);
  if(created){const inspected=spawnSync('docker',['inspect','--format',`{{index .Config.Labels "turas.012.owner"}}`,container],{env:safeEnv,encoding:'utf8',timeout:30000});if(inspected.status===0){if(inspected.stdout.trim()!==token)throw Error('Owned gap container marker changed; cleanup refused');command('docker',['rm','--force',container],safeEnv);}else if(!/No such (?:object|container)/i.test(inspected.stderr??''))throw Error('Owned gap resource cleanup could not be verified');}
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  if(await selectedHash()!==selectedBefore)throw Error('Selected configuration changed during gap check');
  if(await digest()!==agentDigest)throw Error('Root agent changed during gap check');
 }
}
