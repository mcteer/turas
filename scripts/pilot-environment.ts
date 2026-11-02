import {configureOwnedNextDependencyRoot} from './owned-next-config';
import {qualityChildEnvironment} from "./pilot-quality-runtime";
import {recoveryPostgresImage,type RecoveryPostgresMajor} from '../lib/server/operations/postgres-version';
import { pilotProtectedSnapshot } from "./pilot-preservation";
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawnSync, type ChildProcess } from 'node:child_process';
import {spawnOwnedProcess,retireOwnedProcess,captureOwnedProcessDescendants,type OwnedProcessRetirement} from './pilot-owned-process';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { copyOwnedEvalFiles } from './eval-owned-copy';
import { reserveOwnedEvalPort } from './eval-port';
import { closeRuntimePool } from '../lib/server/db/client';
import {finishPilotEnvironment} from './pilot-environment-cleanup';

export function requireOwnedPilotDatabase(env: NodeJS.ProcessEnv = process.env, owner = false) {
 const raw = env[owner ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'];
 if (!raw || env.TURAS_PILOT_OWNED !== '1' || !env.TURAS_ENVIRONMENT_ID?.startsWith('test-pilot-') ||
     env.TURAS_TEST_ENVIRONMENT_ID !== env.TURAS_ENVIRONMENT_ID) throw Error('Pilot checks require the owning runner');
 const url = new URL(raw);
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
     !/^\/turas_test_016_eval_[a-f0-9]{12}$/.test(url.pathname)) throw Error('Pilot checks require an owned loopback database');
 return raw;
}
export type PilotEnvironment = { appRoot: string; storeRoot: string; workflowRoot: string; origin: string; readonly deadlineAt:number;
 databaseContainer:string; databaseOwnerLabel:string; appPid:()=>number|null; workerPid:()=>number|null; databaseName: string; environmentId: string; signal:AbortSignal; cancellationCause:()=> 'none'|'deadline'|'signal'; start: () => Promise<void>; startProduction:()=>Promise<void>; startProductionNative:()=>Promise<void>; startNative:()=>Promise<void>; startWorker: () => Promise<void>; crashWorker: () => Promise<void>; startSupervisor: () => Promise<void>; stop: () => Promise<void>;
 backupRestore:()=>Promise<void>; stopDatabase:()=>Promise<void>; startDatabase:()=>Promise<void>; restartDatabase:()=>Promise<void>; upgradeToCurrent: () => Promise<void> };
const safeParentKeys = ['PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT'] as const;
export function pilotParentEnvironment(environment:Record<string,string|undefined>=process.env):NodeJS.ProcessEnv{
 // Object.assign(process.env, {TMPDIR: undefined}) creates the string
 // "undefined". On Linux that turns os.tmpdir() into a relative mount path.
 return {...Object.fromEntries(safeParentKeys.filter(key=>environment[key]!==undefined).map(key=>[key,environment[key]])),NODE_ENV:'test'};
}
function command(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd(), timeout = 120_000) {
 const result = spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:1_000_000});
 if (result.error || result.status !== 0) {
  writeFileSync(resolve('local-artifacts/016/setup-error.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});
  // The full private diagnostic may belong to a clone removed by cleanup. Keep
  // only a fixed classification in the parent suite report, never arguments,
  // connection strings, environment values or arbitrary dependency error prose.
  const binary=['docker','git','node'].includes(cmd.split('/').pop()??'')?cmd.split('/').pop():'command';
  const operation=binary==='docker'&&['run','port','inspect','stop','start','restart','exec','rm'].includes(args[0])?args[0]:'setup';
  const failureCode=(result.error as NodeJS.ErrnoException|undefined)?.code;
  const text=(result.stderr??'')+'\n'+(result.stdout??'');
  const detail=/address already in use|port is already allocated/i.test(text)?'port_collision':/is already in use by container/i.test(text)?'container_collision':/no space left on device/i.test(text)?'disk_exhausted':/Cannot connect to the Docker daemon|error during connect/i.test(text)?'daemon_unavailable':/No such image|Unable to find image/i.test(text)?'image_unavailable':failureCode==='ETIMEDOUT'?'command_timeout':failureCode==='ENOENT'?'client_unavailable':'dependency_failed';
  throw Error(`Owned pilot setup failed: ${binary} ${operation} ${detail}`);
 }
 return result.stdout.trim();
}
function rootProbeDiagnostic(probe:'cwd'|'open-files',result:ReturnType<typeof spawnSync>){
 const stderr=String(result.stderr??''),code=(result.error as NodeJS.ErrnoException|undefined)?.code;
 // Vitest does not retain a plain-object Error cause. Report only fixed probe
 // metadata in the message; never expose lsof paths, process names or raw errors.
 const error=code==='ENOENT'?'missing':code==='ETIMEDOUT'?'timeout':code==='ENOBUFS'?'buffer':result.error?'other':'none';
 const warning=/permission denied/i.test(stderr)?'permission':/can.t stat/i.test(stderr)?'stat':/warning/i.test(stderr)?'warning':stderr.trim()?'other':'none';
 return `probe=${probe} status=${result.status??'none'} signal=${result.signal??'none'} error=${error} stdoutBytes=${Buffer.byteLength(String(result.stdout??''))} stderrBytes=${Buffer.byteLength(stderr)} stderrClass=${warning}`;
}
async function requireUnusedPilotRoot(root:string,environment:NodeJS.ProcessEnv,deadline:number){
 // Use more of the existing fixture allowance for host inspection. This does
 // not extend the fixture deadline or turn an incomplete observation into proof.
 const owned=await realpath(root),until=Math.min(deadline,Date.now()+20_000);
 // Linux's ordinary UID may not see other users' open descriptors. Require a
 // root-visible observation, with no weaker fallback if privilege is unavailable.
 const elevated=process.platform==='linux'&&process.geteuid?.()!==0;
 const probe=(args:string[],timeout:number)=>spawnSync(process.platform==='linux'?(elevated?'/usr/bin/sudo':'/usr/bin/lsof'):'lsof',
  [...(elevated?['-n','--','/usr/bin/lsof']:[]),'-n','-P',...args],{env:environment,encoding:'utf8',timeout,maxBuffer:4194304});
 // Shutdown hooks can start a short-lived detached vendor telemetry process.
 // Observe actual absence within one finite window; never remove an in-use root.
 for(;;){
  if(Date.now()>=until)throw Error('Owned pilot root open-file absence unverified',{cause:{probe:'open-files',deadlineExpired:true}});
  // +D selects directory instances (including cwd) and file device/inode pairs.
  // Cross filesystems, preserving nested-mount coverage without following links.
  // One observation avoids spending the same finite window on a redundant scan.
  const files=probe(['+D',owned,'-x','f','-Fp'],Math.max(1,until-Date.now()));
  const fileOutput=String(files.stdout??''),fileError=String(files.stderr??'');
  if(files.error||![0,1].includes(files.status??-1)||fileError.trim()||(!fileOutput.trim()&&files.status!==1))throw Error(`Owned pilot root open-file absence unverified: ${rootProbeDiagnostic('open-files',files)}`,{cause:{probe:'open-files',status:files.status,signal:files.signal,probeError:Boolean(files.error),stdoutPresent:Boolean(fileOutput.trim()),stderrPresent:Boolean(fileError.trim())}});
  if(fileOutput.trim()){if(Date.now()>=until)throw Error('Owned pilot root open-file absence unverified',{cause:{probe:'open-files',rootInUse:true}});await new Promise(done=>setTimeout(done,Math.min(100,until-Date.now())));continue;}
  if(Date.now()>until)throw Error('Owned pilot root open-file absence unverified',{cause:{probe:'open-files',deadlineExpired:true}});
  return;
 }
}
export async function withPilotEnvironment<T>(run: (environment: PilotEnvironment) => Promise<T>, options: { priorSchema?: 38|55|57|77|79|80|81|82|83|84; postgresMajor?:RecoveryPostgresMajor; queryStatistics?:boolean; deadlineMs?: number } = {}): Promise<T> {
 if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Pilot checks require Node 24');
 if(options.priorSchema!==undefined&&![38,55,57,77,79,80,81,82,83,84].includes(options.priorSchema))throw Error('Explicit supported owned prior schema required');
 const protectedBefore=await pilotProtectedSnapshot();
 const digest = async () => createHash('sha256').update(await readFile('agent/agent.ts')).digest('hex');
 const agentDigest = await digest(), previous = { ...process.env };
 const codeVersion=command('git',['rev-parse','HEAD'],process.env);if(!/^[a-f0-9]{40}$/.test(codeVersion))throw Error('Exact owned source identity required');
 const selectedHash=async()=>{try{return createHash('sha256').update(await readFile('.env.local')).digest('hex');}catch(error){if((error as {code?:string}).code==='ENOENT')return null;throw error;}};const selectedBefore=await selectedHash();
 const safeEnv=pilotParentEnvironment();
 const token = randomUUID().replaceAll('-','').slice(0,12), name = `turas_test_016_eval_${token}`,
  container = `turas-016-check-${token}`, environmentId = `test-pilot-${token}`, password = randomBytes(24).toString('hex');
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
 const root = await mkdtemp(resolve('local-artifacts/016/owned-')), appRoot=join(root,'app'),storeRoot=join(root,'reports'),artifactRoot=join(root,'artifacts'),workforceRoot=join(root,'workforce'),workflowRoot=join(appRoot,'.eve/.workflow-data');
 const portLease = await reserveOwnedEvalPort();
 let created=false, child: ChildProcess | undefined,worker:ChildProcess|undefined,nativeChild:ChildProcess|undefined,appLog="",nativeLog="";
 let nativePortLease:Awaited<ReturnType<typeof reserveOwnedEvalPort>>|undefined;
 const cancellation=new AbortController();
 const deadline=Date.now()+(options.deadlineMs ?? 300_000);
 const remaining=()=>{cancellation.signal.throwIfAborted();const value=deadline-Date.now();if(value<=0)throw Error('Owned pilot check deadline exceeded');return value;};
 let stopping:Promise<void>|null=null,stopEpoch=0;
 function stop(){if(stopping)return stopping;stopEpoch++;stopping=drainStop().finally(()=>{stopping=null;});return stopping;}
 const ownedChildren=new Map<ChildProcess,OwnedProcessRetirement>(),ownedCapabilities=new WeakMap<ChildProcess,OwnedProcessRetirement>();
 function requireStartup(epoch:number){remaining();if(stopping||epoch!==stopEpoch)throw Error('Owned pilot startup interrupted by stop');}
 function spawnOwned(args:string[],environment:NodeJS.ProcessEnv,epoch:number){requireStartup(epoch);const owned=spawnOwnedProcess({command:process.execPath,args,cwd:appRoot,environment});ownedChildren.set(owned.child,owned.retirement);ownedCapabilities.set(owned.child,owned.retirement);return owned.child;}
 async function retireChild(current:ChildProcess){const retirement=ownedCapabilities.get(current);if(!retirement)throw Error('Owned pilot process capability missing');await retireOwnedProcess(retirement);ownedChildren.delete(current);}
 async function drainStop(){
  const failures:unknown[]=[];
  // A CLI exit is insufficient: a descendant can still publish trace files.
  const ordered=[...new Set([worker,child,nativeChild,...ownedChildren.keys()])];
  for(const current of ordered)if(current&&ownedChildren.has(current))try{await retireChild(current);}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'Owned pilot process retirement unverified');
  worker=undefined;child=undefined;nativeChild=undefined;
 }
 let cancellationCause:'none'|'deadline'|'signal'='none';
 const interrupt=()=>{if(cancellationCause==='none')cancellationCause='signal';cancellation.abort(Error('Owned pilot check interrupted'));void stop().catch(()=>{/* Failed capabilities remain retained; finally awaits and rethrows retirement failure. */});};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);const watchdog=setTimeout(()=>{if(cancellationCause==='none')cancellationCause='deadline';interrupt();},Math.max(1,deadline-Date.now()));
 let runFailure:{error:unknown}|undefined;
 try {
  created=true;command('docker',['run','--detach','--name',container,'--label',`turas.016.owner=${token}`,'--publish','127.0.0.1::5432','--env',`POSTGRES_PASSWORD=${password}`,'--env',`POSTGRES_DB=${name}`,recoveryPostgresImage(options.postgresMajor??17),...(options.queryStatistics?['postgres','-c','shared_preload_libraries=pg_stat_statements','-c','pg_stat_statements.track=all','-c','pg_stat_statements.max=10000']:[])],safeEnv);created=true;
  const mapping=command('docker',['port',container,'5432/tcp'],safeEnv),match=/^127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(mapping);if(!match||Number(match[1])>65535)throw Error('Exact owned loopback database publication required');const port=match[1];
  const ownerUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${name}`;
  const runtimeUrl=`postgresql://turas_runtime:${password}@127.0.0.1:${port}/${name}`;
  const pool=new Pool({connectionString:ownerUrl,connectionTimeoutMillis:1000});
  try{for(;;){remaining();try{await pool.query('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,250));}}
   const sql=(await pool.query("SELECT format('CREATE ROLE turas_runtime LOGIN PASSWORD %L',$1::text) AS sql",[password])).rows[0].sql;await pool.query(sql);
  }finally{await pool.end();}
  await mkdir(artifactRoot,{mode:0o700});await writeFile(join(artifactRoot,'.turas-artifact-store.json'),JSON.stringify({version:1,environmentId}),{mode:0o600});await mkdir(workforceRoot,{mode:0o700});await writeFile(join(workforceRoot,'.turas-workforce-store.json'),JSON.stringify({environmentId}),{mode:0o600});
  await mkdir(appRoot,{mode:0o700});await mkdir(storeRoot,{mode:0o700});await mkdir(workflowRoot,{recursive:true,mode:0o700});
  for(const file of ['app','agent','lib','migrations','scripts','public','evals','tests','packages','infra','report-renderer','report-templates','next.config.ts','next-env.d.ts','playwright.config.ts','vitest.config.ts','tsconfig.json','tsconfig.pilot.json','package.json'])copyOwnedEvalFiles(resolve(file),join(appRoot,file),{excludeRuntime:true,deadlineAt:deadline});
  await symlink(resolve('node_modules'),join(appRoot,'node_modules'));
  await symlink(resolve('packages/artifact-extractor/node_modules'),join(appRoot,'packages/artifact-extractor/node_modules'));
  await writeFile(join(storeRoot,'.turas-report-store.json'),JSON.stringify({environmentId}),{mode:0o600});await mkdir(join(storeRoot,'objects'),{mode:0o700});
  const configPath=join(appRoot,'next.config.ts');const config=await readFile(configPath,'utf8');
  // Nested owned scopes inherit the same physical dependency root.
  // Add this configuration once; duplicate object keys fail production builds.
  if(!config.includes('// owned-pilot-next-config-v1'))await writeFile(configPath,config.replace('const nextConfig: NextConfig = {',`const nextConfig: NextConfig = {\n  // owned-pilot-next-config-v1\n  devIndicators: false,\n  turbopack: { root: ${JSON.stringify(resolve('.'))} },`));
  await configureOwnedNextDependencyRoot(appRoot);
  const origin=`http://127.0.0.1:${portLease.port}`;
  // Opt out of optional vendor telemetry transmission in isolated fixtures.
  const env={...safeEnv,NEXT_TELEMETRY_DISABLED:'1',TURAS_CODE_VERSION:codeVersion,DATABASE_URL:runtimeUrl,DATABASE_URL_UNPOOLED:ownerUrl,TURAS_TEST_DATABASE_URL:ownerUrl,TURAS_ENVIRONMENT_ID:environmentId,TURAS_TEST_ENVIRONMENT_ID:environmentId,TURAS_PILOT_OWNED:'1',TURAS_015_DISABLED:'0',TURAS_PRIVATE_OBJECT_BACKEND:'local',TURAS_JOB_EXECUTOR:'local',TURAS_APP_ORIGIN:origin,TURAS_EVE_INTERNAL_ORIGIN:origin+'/',TURAS_REPORT_STORE_ROOT:storeRoot,TURAS_ARTIFACT_STORE_ROOT:artifactRoot,TURAS_WORKFORCE_STORE_ROOT:workforceRoot,TURAS_MAINTENANCE_SECRET:randomBytes(32).toString('hex'),TURAS_012_RECEIPT_HASH_KEYS:JSON.stringify([randomBytes(32).toString('hex')]),TURAS_DEMO_USERNAME:'mcteer',TURAS_DEMO_PASSWORD:'SyntheticPilotPassword1!',PANEL_USERNAME:'panel',PANEL_PASSWORD:'SyntheticPilotPassword2!',PARTNER_USERNAME:'partner',PARTNER_PASSWORD:'SyntheticPilotPassword3!',TURAS_TEST_MODEL_MODE:'deterministic',NODE_ENV:'test',TURAS_REPORTS_ENABLED:'0',TURAS_REPORT_DELIVERY_ENABLED:'0'};
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
  const manifestPath=join(appRoot,'migrations/manifest.json'),full=await readFile(manifestPath,'utf8');let future:string[]=[];
  if(options.priorSchema){const prior=options.priorSchema,manifest=JSON.parse(full);future=manifest.migrations.filter((m:{file:string})=>Number(m.file.slice(0,3))>prior).map((m:{file:string})=>m.file);await mkdir(join(appRoot,'future'));for(const file of future)await rename(join(appRoot,'migrations',file),join(appRoot,'future',file));manifest.version=prior;manifest.migrations=manifest.migrations.filter((m:{file:string})=>Number(m.file.slice(0,3))<=prior);await writeFile(manifestPath,JSON.stringify(manifest));}
  const script=(file:string,args:string[]=[])=>command(process.execPath,['--experimental-strip-types',file,...args],process.env,appRoot,Math.min(remaining(),120_000));
  script('scripts/db-migrate.ts',['--init']);script('scripts/db-roles.ts');script('scripts/bootstrap-demo.ts');

  let built=false;async function start(supervisor=false,production=false,native=false){const epoch=stopEpoch;requireStartup(epoch);if(child||nativeChild)throw Error('Owned pilot app already started');
   if(production&&native){if(built)throw Error('Owned production native startup requires a fresh build');nativePortLease=await reserveOwnedEvalPort();process.env.EVE_NEXT_PRODUCTION_PORT=String(nativePortLease.port);}
   if(production&&!built){child=spawnOwned(['scripts/build-check.mjs'],{...process.env,NODE_ENV:'production'},epoch);for(const stream of [child.stdout,child.stderr])stream?.on('data',b=>{appLog=(appLog+b.toString()).slice(-100000);});const building=child,code=await new Promise<number|null>((done,reject)=>{building.once('error',reject);building.once('exit',done);});await retireChild(building);requireStartup(epoch);child=undefined;remaining();if(code!==0)throw Error('Owned production build failed');built=true;}
   if(production&&native){
    // Next hosting owns the built Eve service in 0.91. Starting it manually
    // would compete with withEve for the same reserved production port.
    await nativePortLease!.release();
    process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:'+nativePortLease!.port+'/';
   }
   const qualityEnvironment=await qualityChildEnvironment();requireStartup(epoch);await portLease.release();child=spawnOwned(supervisor?['scripts/dev.mjs']:['node_modules/next/dist/bin/next',production?'start':'dev',...(production?[]:['--webpack']),'--port',String(portLease.port)],{...process.env,PORT:String(portLease.port),NODE_ENV:production?'production':'development',...qualityEnvironment},epoch);let tail='';for(const stream of [child.stdout,child.stderr])stream?.on('data',b=>{tail=(tail+b.toString()).slice(-100000);appLog=tail;const listening=/server listening at (http:\/\/127\.0\.0\.1:\d+)\//.exec(tail);if(listening)process.env.TURAS_EVE_INTERNAL_ORIGIN=listening[1]+'/';});
   while(remaining()>0){if(child.exitCode!==null)break;let ready=false;try{const r=await fetch(`${origin}/api/auth/session`,{signal:AbortSignal.timeout(2000)});await r.body?.cancel();ready=r.status===401&&(!native||production||/server listening at http:\/\/127\.0\.0\.1:\d+\//.test(appLog));}catch{}if(ready){requireStartup(epoch);captureOwnedProcessDescendants(ownedCapabilities.get(child)!);return;}await new Promise(r=>setTimeout(r,300));}
   await writeFile(resolve('local-artifacts/016',`startup-${token}.log`),tail.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]'),{mode:0o600});throw Error('Owned pilot app failed readiness; inspect synthetic startup evidence');}
  const databaseReady=async()=>{const probe=new Pool({connectionString:ownerUrl,connectionTimeoutMillis:1000});try{for(;;){remaining();try{await probe.query("SELECT 1");return;}catch{await new Promise(r=>setTimeout(r,250));}}}finally{await probe.end();}};
  const databaseOwned=()=>{if(command('docker',['inspect','--format','{{index .Config.Labels "turas.016.owner"}}',container],safeEnv)!==token)throw Error('Owned database marker changed');};
  const result=await run({stopDatabase:async()=>{remaining();databaseOwned();await closeRuntimePool();command('docker',['stop','--time','5',container],safeEnv);},startDatabase:async()=>{remaining();databaseOwned();command('docker',['start',container],safeEnv);await databaseReady();},backupRestore:async()=>{remaining();if(child||worker)throw Error("Stop owned app before restore");await closeRuntimePool();command("docker",["exec",container,"pg_dump","--username=postgres","--dbname="+name,"--format=custom","--file=/tmp/pilot-owned.dump"],safeEnv);command("docker",["exec",container,"pg_restore","--username=postgres","--dbname="+name,"--clean","--if-exists","--exit-on-error","/tmp/pilot-owned.dump"],safeEnv);command("docker",["exec",container,"rm","/tmp/pilot-owned.dump"],safeEnv);},restartDatabase:async()=>{remaining();databaseOwned();await closeRuntimePool();command("docker",["restart",container],safeEnv);await databaseReady();},appRoot,storeRoot,workflowRoot,origin,databaseContainer:container,databaseOwnerLabel:token,appPid:()=>child?.pid??null,workerPid:()=>worker?.pid??null,databaseName:name,environmentId,signal:cancellation.signal,deadlineAt:deadline,cancellationCause:()=>cancellationCause,start:()=>start(),startNative:()=>start(false,false,true),startProduction:()=>start(false,true),startProductionNative:()=>start(false,true,true),startSupervisor:()=>start(true),crashWorker:async()=>{remaining();if(!worker)throw Error('Owned worker not running');const current=worker;current.kill('SIGKILL');if(current.exitCode===null)await new Promise<void>(done=>current.once('exit',()=>done()));await retireChild(current);if(worker===current)worker=undefined;},startWorker:async()=>{const epoch=stopEpoch;requireStartup(epoch);if(worker)throw Error('Owned pilot worker already started');worker=spawnOwned(['--import','tsx','scripts/maintenance-worker.ts'],{...process.env,...await qualityChildEnvironment()},epoch);const ready=new Pool({connectionString:ownerUrl,connectionTimeoutMillis:1000});try{const workerDeadline=Math.min(deadline,Date.now()+30000);for(;;){remaining();if(worker.exitCode!==null)throw Error('Owned pilot worker failed startup');const heartbeat=await ready.query("SELECT 1 FROM maintenance_workers WHERE environment_id=$1 AND last_seen_at>=clock_timestamp()-interval '15 seconds' LIMIT 1",[environmentId]);if(heartbeat.rowCount)break;if(Date.now()>=workerDeadline)throw Error('Owned pilot worker heartbeat unavailable');await new Promise(r=>setTimeout(r,100));}}finally{await ready.end();}},stop,upgradeToCurrent:async()=>{remaining();if(!future.length)throw Error('No owned prior-schema fixture');for(const file of future)await rename(join(appRoot,'future',file),join(appRoot,'migrations',file));future=[];await writeFile(manifestPath,full);script('scripts/db-migrate.ts');script('scripts/db-roles.ts');}});remaining();return result;
 } catch(error) {runFailure={error};throw error;} finally {
  clearTimeout(watchdog);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  await finishPilotEnvironment({runFailure,
   retire:[()=>portLease.release(),async()=>{await nativePortLease?.release();},stop],
   closePools:closeRuntimePool,
   proveUnused:()=>requireUnusedPilotRoot(root,safeEnv,deadline),
   saveLogs:[async()=>{if(nativeLog)await writeFile(resolve('local-artifacts/016',`native-${token}.log`),nativeLog.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]'),{mode:0o600});},async()=>{if(appLog)await writeFile(resolve('local-artifacts/016',`runtime-${token}.log`),appLog.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]'),{mode:0o600});}],
   restoreParent:()=>{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous);},
   removeOwned:async()=>{
    if(created){const inspected=spawnSync('docker',['inspect','--format',`{{index .Config.Labels "turas.016.owner"}}`,container],{env:safeEnv,encoding:'utf8',timeout:30000});if(inspected.status===0){if(inspected.stdout.trim()!==token)throw Error('Owned pilot container marker changed; cleanup refused');command('docker',['rm','--force','--volumes',container],safeEnv);}else if(!/No such (?:object|container)/i.test(inspected.stderr??''))throw Error('Owned pilot resource cleanup could not be verified');}
    await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
   },
   verifyProtected:async()=>{
    if(await selectedHash()!==selectedBefore)throw Error('Selected configuration changed during pilot check');
    if(await digest()!==agentDigest)throw Error('Root agent changed during pilot check');
    if(JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(protectedBefore))throw Error('Protected root state changed during pilot check');
   },
  });
 }
}
