import {z} from 'zod';
import {withOwnedProcess,OwnedProcessRetirementError} from './pilot-owned-process';
import {mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {copyOwnedEvalFiles} from './eval-owned-copy';
import {reserveOwnedEvalPort} from './eval-port';
import {pilotSource} from './pilot-source';
import {parseServerConfig} from '../lib/server/config';
import {withRecoveryServerConfiguration} from '../lib/server/operations/recovery-configuration-context';
import {withOwnedRestoreTarget,requireOwnedRestoreConfigurationTarget,requireOwnedRestoredRuntimeEnvironment,registerOwnedRestoredRuntimeProcess,type OwnedRestoreTarget} from '../lib/server/operations/owned-restore-target';

type Scope={environmentId:string;recoveryId:string;controlRevision:number};
export type OwnedRecoveryApplication=Readonly<{contract:'pilot-owned-recovery-application-v1';origin:string;sourceCommit:string;sourceDigest:string;catalogDigest:string}>;
type Binding={target:OwnedRestoreTarget;scope:Scope;root:string;deadline:number;environment:NodeJS.ProcessEnv;port:Awaited<ReturnType<typeof reserveOwnedEvalPort>>;active:boolean};
const applications=new WeakMap<object,Binding>();
function binding(application:OwnedRecoveryApplication){const value=applications.get(application);if(!value)throw Error('Actual owned recovery application required');return value;}
const runtimeKeys=['DATABASE_URL','DATABASE_URL_UNPOOLED','TURAS_ENVIRONMENT_ID','TURAS_PRIVATE_OBJECT_BACKEND','TURAS_ARTIFACT_STORE_ROOT','TURAS_WORKFORCE_STORE_ROOT','TURAS_REPORT_STORE_ROOT'] as const;

/** Clone authored application files only. No selected env, workflow data,
 * customer store, credential file, provider key or owner URL enters the child. */
export async function prepareOwnedRecoveryApplication(input:{target:OwnedRestoreTarget;scope:Scope;signal:AbortSignal;deadline:number;rendererImage?:string}){
 input.signal.throwIfAborted();
 if(!Number.isSafeInteger(input.deadline)||input.deadline<=Date.now()||input.deadline>Date.now()+900000)throw Error('Bounded original recovery deadline required');
 await withOwnedRestoreTarget(input.target,input.scope,input.signal,async()=>{});
 const source=await pilotSource(),config=parseServerConfig(process.env);
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
 const root=await mkdtemp(resolve('local-artifacts/016/recovery-application-'));let port:Awaited<ReturnType<typeof reserveOwnedEvalPort>>|undefined;
 try{
  port=await reserveOwnedEvalPort();
  for(const file of ['app','agent','lib','migrations','scripts','public','tests','packages','infra','report-renderer','report-templates','next.config.ts','next-env.d.ts','playwright.config.ts','vitest.config.ts','tsconfig.json','tsconfig.pilot.json','package.json']){
   input.signal.throwIfAborted();copyOwnedEvalFiles(resolve(file),join(root,file),{excludeRuntime:true,deadlineAt:input.deadline});
  }
  await symlink(resolve('node_modules'),join(root,'node_modules'));
  await symlink(resolve('packages/artifact-extractor/node_modules'),join(root,'packages/artifact-extractor/node_modules'));
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Recovery application source changed');
  const origin='http://127.0.0.1:'+port.port;
  const receiptKeys=z.array(z.string().refine(value=>Buffer.byteLength(value)>=32&&Buffer.byteLength(value)<=4096)).min(1).max(32).parse(process.env.TURAS_012_RECEIPT_HASH_KEYS?JSON.parse(process.env.TURAS_012_RECEIPT_HASH_KEYS):[config.TURAS_MAINTENANCE_SECRET]);
  const renderer=input.rendererImage??process.env.TURAS_PILOT_RENDERER_IMAGE;if(!renderer||!/^sha256:[a-f0-9]{64}$/.test(renderer))throw Error('Exact prepared recovery renderer required');
  const application:OwnedRecoveryApplication=Object.freeze({contract:'pilot-owned-recovery-application-v1',origin,sourceCommit:source.sourceCommit,sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest});
  const environment:NodeJS.ProcessEnv={...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]])),
   // This launcher serves maintenance HTTP only. The installed Eve Next
   // integration honors EVE_BASE_URL before automatic dev-server startup.
   // Port zero is deliberately unavailable; native/Workflow proof stays separate.
   NODE_ENV:'development',EVE_BASE_URL:'http://127.0.0.1:0',TURAS_PILOT_RENDERER_IMAGE:renderer,NEXT_TELEMETRY_DISABLED:'1',TURAS_CODE_VERSION:source.sourceCommit,TURAS_APP_ORIGIN:origin,TURAS_EVE_INTERNAL_ORIGIN:origin+'/',
   TURAS_DEMO_USERNAME:'mcteer',TURAS_DEMO_PASSWORD:config.TURAS_DEMO_PASSWORD,PANEL_USERNAME:'panel',PANEL_PASSWORD:config.PANEL_PASSWORD,PARTNER_USERNAME:'partner',PARTNER_PASSWORD:config.PARTNER_PASSWORD,
   TURAS_MAINTENANCE_SECRET:config.TURAS_MAINTENANCE_SECRET,TURAS_012_RECEIPT_HASH_KEYS:JSON.stringify(receiptKeys),
   TURAS_PILOT_LOGIN_ENABLED:'0',TURAS_PRIVATE_OBJECT_BACKEND:'local',TURAS_JOB_EXECUTOR:'local',TURAS_REPORTS_ENABLED:'true',TURAS_REPORT_DELIVERY_ENABLED:'0',TURAS_TEST_MODEL_MODE:'deterministic'};
  applications.set(application,{target:input.target,scope:Object.freeze({...input.scope}),root,deadline:input.deadline,environment,port,active:false});return application;
 }catch(error){await port?.release();await rm(root,{recursive:true,force:true});throw error;}
}

async function serve<T>(application:OwnedRecoveryApplication,runtime:Readonly<Record<string,string>>,signal:AbortSignal,run:()=>Promise<T>,warming=false){
 const state=binding(application);signal.throwIfAborted();
 if(state.active||Date.now()>=state.deadline)throw Error('Recovery application unavailable or already active');
 const supplied=Object.keys(runtime).sort();if(JSON.stringify(supplied)!==JSON.stringify([...runtimeKeys].sort()))throw Error('Exact restricted recovery environment required');
 requireOwnedRestoreConfigurationTarget(state.target,runtime.DATABASE_URL,process.env.DATABASE_URL_UNPOOLED??'');
 if(runtime.DATABASE_URL!==runtime.DATABASE_URL_UNPOOLED||new URL(runtime.DATABASE_URL).username!=='turas_runtime_016'||runtime.TURAS_ENVIRONMENT_ID!==state.scope.environmentId||runtime.TURAS_PRIVATE_OBJECT_BACKEND!=='local')throw Error('Restricted recovery application binding differs');
 const runtimeSignal=warming?signal:requireOwnedRestoredRuntimeEnvironment(state.target,state.scope,runtime);
 state.active=true;let tail='',retired=false;
 const deadline=AbortSignal.any([signal,runtimeSignal,AbortSignal.timeout(Math.max(1,state.deadline-Date.now()))]);
 try{
  await state.port.release();deadline.throwIfAborted();
  return await withOwnedProcess({command:process.execPath,args:['scripts/pilot-owned-recovery-server.mjs'],cwd:state.root,environment:{...state.environment,...runtime},signal:deadline,deadline:state.deadline,onProcess:warming?undefined:process=>registerOwnedRestoredRuntimeProcess(state.target,state.scope,runtime,process)},async child=>{
  tail+='\nowned-child-pid='+child.pid+'\n';
  let failure=false;child.on('error',()=>{failure=true;});
  for(const stream of [child.stdout,child.stderr])stream?.on('data',bytes=>{tail=(tail+bytes.toString()).slice(-65536);});
  for(;;){
   deadline.throwIfAborted();if(failure||child.exitCode!==null||child.signalCode!==null)throw Error('Owned recovery application stopped before readiness');
   // Probe only once the owned child reports its actual listener. A different
   // process occupying the released port must not supply readiness.
   if(/Ready in/.test(tail)){
    const response=await fetch(application.origin+'/api/auth/session',{redirect:'manual',signal:AbortSignal.any([deadline,AbortSignal.timeout(warming?30000:5000)])});
    await response.body?.cancel();if(response.status!==401||response.headers.get('x-turas-code-version')!==application.sourceCommit)throw Error('Owned recovery application release or readiness differs');break;
   }
   await new Promise<void>(done=>setTimeout(done,50));
  }
  const result=await run();deadline.throwIfAborted();if(failure||child.exitCode!==null||child.signalCode!==null)throw Error('Owned recovery application lost');return result;
  }).then(value=>{retired=true;return value;},error=>{if(error instanceof OwnedProcessRetirementError){tail+='\n'+error.message+'; '+(error.cause instanceof Error?error.cause.message:'unknown retirement cause')+'\n';throw error;}retired=true;throw error;});
 }finally{
  state.active=!retired;await writeFile(join(dirname(state.root),basename(state.root)+'-child-private.log'),tail,{mode:0o600});
 }
}

/** Compile only unauthenticated denied routes while runtime LOGIN remains shut.
 * The original deadline is shared with all later leases, never renewed. */
export async function warmOwnedRecoveryApplication(application:OwnedRecoveryApplication,signal:AbortSignal){
 const state=binding(application);
 await withOwnedRestoreTarget(state.target,state.scope,signal,async db=>{
  if((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount)throw Error('Closed recovery runtime required for preparation');
 });
 const runtime=new URL(process.env.DATABASE_URL!);runtime.username='turas_runtime_016';runtime.password=randomBytes(32).toString('base64url');
 const stores=join(state.root,'warm-stores');await mkdir(stores,{recursive:true,mode:0o700});
 await serve(application,{DATABASE_URL:runtime.toString(),DATABASE_URL_UNPOOLED:runtime.toString(),TURAS_ENVIRONMENT_ID:state.scope.environmentId,TURAS_PRIVATE_OBJECT_BACKEND:'local',TURAS_ARTIFACT_STORE_ROOT:stores,TURAS_WORKFORCE_STORE_ROOT:stores,TURAS_REPORT_STORE_ROOT:stores},signal,async()=>{
  for(const kind of ['profile','artifact','report','workforce','gap','plan','execution','mcp']){
   const response=await fetch(application.origin+'/api/operations/recovery-read/'+randomUUID()+'/'+kind,{redirect:'manual',signal});await response.body?.cancel();
   if(![401,403,503].includes(response.status)||response.headers.get('x-turas-code-version')!==application.sourceCommit)throw Error('Recovery preparation admitted a protected read or release differs');
  }
 },true);
}
export function withOwnedRecoveryApplication<T>(application:OwnedRecoveryApplication,runtime:Readonly<Record<string,string>>,signal:AbortSignal,run:()=>Promise<T>){return serve(application,runtime,signal,run);}
export async function retireOwnedRecoveryApplication(application:OwnedRecoveryApplication){const state=binding(application);if(state.active)throw Error('Recovery application still active');await state.port.release();await rm(state.root,{recursive:true,force:true});applications.delete(application);}
/** Owner-side canonical and admission reads use the same actual child origin.
 * Configuration stays async-local; neither selected env nor root stores change. */
export function withOwnedRecoveryApplicationConfiguration<T>(application:OwnedRecoveryApplication,signal:AbortSignal,read:(db:import('pg').Client)=>Promise<T>){
 const state=binding(application);return withOwnedRestoreTarget(state.target,state.scope,signal,db=>withRecoveryServerConfiguration(parseServerConfig({...process.env,TURAS_ENVIRONMENT_ID:state.scope.environmentId,TURAS_APP_ORIGIN:application.origin}),signal,()=>read(db)));
}
