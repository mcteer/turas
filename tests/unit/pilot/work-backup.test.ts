import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {it,expect,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workBackupConfigurationSchema,workBackupScopeDigest,deriveWorkBackupKey,planWorkBackupCadence,waitForWorkBackupCadence} from '../../../lib/server/operations/work-backup-run';
import {assessBackupSchedule} from '../../../lib/server/operations/backup-schedule';
import {preparePilotRecoveryOperator} from '../../../scripts/prepare-pilot-recovery-operator';
import {sealWorkCandidate,unsealWorkCandidate} from '../../../lib/server/operations/work-candidate-capsule';
import {workBackupCostCeilings,workBackupPricingDigest} from '../../../lib/server/operations/work-backup-pricing';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';

function configuration(){
 const installationId=randomUUID(),environmentId='synthetic-work',value={contract:'pilot-work-backup-config-v1',operatorProjectId:'prj_operator',sourceProjectId:'prj_source',environmentId,installationId,storeId:'synthetic-store',sourceConnection:'postgresql://synthetic:synthetic@source.neon.tech/source?sslmode=verify-full',archiveConnection:'postgresql://synthetic:synthetic@archive.neon.tech/archive?sslmode=verify-full',maximumArchiveBytes:419430400,maximumObjectBytes:25165824,maximumObjects:256,keyReference:'TURAS_RECOVERY_MASTER_1',keyVersion:'1',cost:{installationId,environmentId,scopeDigest:'a'.repeat(64),pricingDigest:workBackupPricingDigest(),hostingBudgetId:randomUUID(),blobBudgetId:randomUUID(),hostingCeilingMicroUsd:100000,blobCeilingMicroUsd:100000}};
 value.cost.scopeDigest=workBackupScopeDigest(value);return value;
}
function candidate(){const id=randomUUID(),hash='a'.repeat(64),empty=recoveryDigest([]);return {contract:'pilot-work-capture-candidate-v1',id,environmentId:'synthetic-work',recoveryId:randomUUID(),controlRevision:1,sourceCommit:'a'.repeat(40),sourceDigest:hash,catalogDigest:hash,capturedAt:new Date().toISOString(),sourceDatabaseName:'synthetic_source',schemaVersion:79,ledgerDigest:hash,runtimeGrantsDigest:hash,acceptedContentDigest:hash,configurationDigest:hash,database:{digest:hash,sizeBytes:1,serverMajor:18,clientMajor:18},objects:{inventoryDigest:empty,objectCount:0,entries:[]},workflow:{inventoryDigest:empty,fileCount:0,entries:[],backend:'managed-workflow',capability:'interrupted-reconciliation',runtimeStoppedVerified:false,resumptionVerified:false,reconciliationVerified:false},encryptedBundle:{headerDigest:hash,digest:hash,sizeBytes:68},key:{reference:'TURAS_RECOVERY_MASTER_1:'+id,version:'1',available:true,probeDigest:hash},originalsRetained:true,currentAuthorityVerified:false,outsideCopyVerified:false,scheduledBackupVerified:false,restorationReady:false,mode:'open',modelCalls:0,mailCalls:0};}
it('accepts only explicitly bound independent work resources and object allowances',()=>{
 const input=configuration();expect(workBackupConfigurationSchema.parse(input)).toEqual(input);
});
it('rejects shared source placement pooled connections and missing certificate verification',()=>{
 for(const change of [{operatorProjectId:'prj_source'},{archiveConnection:'postgresql://synthetic:synthetic@source.neon.tech/archive?sslmode=verify-full'},{sourceConnection:'postgresql://synthetic:synthetic@source-pooler.neon.tech/source?sslmode=verify-full'},{sourceConnection:'postgresql://synthetic:synthetic@source.neon.tech/source?sslmode=require'}])expect(()=>workBackupConfigurationSchema.parse({...configuration(),...change})).toThrow();
});
it('rejects allowance changes and foreign cost installation before backup admission',()=>{
 const input=configuration();expect(()=>workBackupConfigurationSchema.parse({...input,maximumObjects:257})).toThrow();
 expect(()=>workBackupConfigurationSchema.parse({...input,maximumObjectBytes:1024})).toThrow();
 expect(()=>workBackupConfigurationSchema.parse({...input,cost:{...input.cost,installationId:randomUUID()}})).toThrow();
});
it('derives recoverable archive keys without reusing them across installations environments or archives',()=>{
 const master=randomBytes(32),before=Buffer.from(master),scope={installationId:randomUUID(),environmentId:'synthetic-work',archiveId:randomUUID()},key=deriveWorkBackupKey(master,scope);
 try{expect(key).toEqual(deriveWorkBackupKey(master,scope));for(const other of [{...scope,environmentId:'other-work'},{...scope,installationId:randomUUID()},{...scope,archiveId:randomUUID()}])expect(deriveWorkBackupKey(master,other)).not.toEqual(key);expect(master).toEqual(before);expect(()=>deriveWorkBackupKey(master.subarray(1),scope)).toThrow();}finally{master.fill(0);before.fill(0);key.fill(0);}
});
it('encrypts complete cold metadata with fresh nonces while preserving unverified recovery state',()=>{
 const key=randomBytes(32),input=candidate(),scope={archiveId:input.id,candidateDigest:recoveryDigest(input)};
 try{const first=sealWorkCandidate(input,key),second=sealWorkCandidate(input,key);expect(first).not.toEqual(second);expect(unsealWorkCandidate(first,key,scope)).toEqual(input);expect(unsealWorkCandidate(second,key,scope).restorationReady).toBe(false);}finally{key.fill(0);}
});
it('rejects altered capsule bytes wrong keys and foreign archive contexts',()=>{
 const key=randomBytes(32),wrong=randomBytes(32),input=candidate(),scope={archiveId:input.id,candidateDigest:recoveryDigest(input)},bytes=sealWorkCandidate(input,key);
 try{const corrupt=Buffer.from(bytes);corrupt[52]^=1;expect(()=>unsealWorkCandidate(corrupt,key,scope)).toThrow();expect(()=>unsealWorkCandidate(bytes,wrong,scope)).toThrow();expect(()=>unsealWorkCandidate(bytes,key,{...scope,archiveId:randomUUID()})).toThrow();expect(()=>unsealWorkCandidate(bytes,key,{...scope,candidateDigest:'b'.repeat(64)})).toThrow();}finally{key.fill(0);wrong.fill(0);}
});
it('refuses capsule metadata that claims release approval or hides infrastructure calls as zero providers',()=>{
 const key=randomBytes(32),input=candidate();try{for(const change of [{restorationReady:true},{ownerApproved:'mcteer'},{providerCalls:0}])expect(()=>sealWorkCandidate({...input,...change},key)).toThrow();}finally{key.fill(0);}
});
it('builds the actual operator transport and rejects unauthorized disabled and nonproduction requests',async()=>{
 const root=resolve('local-artifacts/016/operator-transport-'+randomUUID()),previous={...process.env};let server:ReturnType<typeof createServer>|undefined;
 try{
  await preparePilotRecoveryOperator(['--output',root]);
  expect(await readFile(join(root,'agent/agent.ts'),'utf8')).toContain("model:'anthropic/claude-sonnet-5.5'");
  // Check upload matching with actual gitignore semantics, including arbitrary
  // env-pull names and files injected under an otherwise admitted directory.
  // Vercel's walker tests directories as bare paths before descending. Use an
  // empty matching root so Git cannot infer a trailing slash from existing dirs.
  const probe=join(root,'upload-policy-probe');await mkdir(probe);
  await writeFile(join(probe,'.gitignore'),await readFile(join(root,'.vercelignore')));
  await promisify(execFile)('git',['init','--quiet',probe]);
  const denied=['.env','.env.local','.env.operator-production.private','credentials.json','preparation.json','deployment-intent-private.json','src/.env.private','src/customer.json','src/native-client/.env.secret'];
  const admitted=['.vercelignore','package.json','package-lock.json','vercel.json','build.mjs','agent','agent/channels','agent/agent.ts','agent/instructions.md','agent/channels/eve.ts','src','src/native-client','src/runtime.cjs','src/source.json','src/native-client/manifest.json'];
  const ignored=await promisify(execFile)('git',['check-ignore','--no-index',...denied,...admitted],{cwd:probe});
  expect(ignored.stdout.trim().split('\n')).toEqual(denied);
  // Exercise the installed CLI's real project detector without linking a cloud
  // project. A build alone accepted a package that eve link could not discover.
  const {findEveProjectRoot}=await import(pathToFileURL(resolve('node_modules/eve/dist/src/internal/eve-project-root.js')).href);
  expect(await findEveProjectRoot(root)).toBe(root);
  const deploymentConfig=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const outputConfig=JSON.parse(await readFile(join(root,'.vercel/output/config.json'),'utf8'));
  expect([...(deploymentConfig.crons??[]),...(outputConfig.crons??[])]).toEqual([{path:'/api/backup',schedule:'0 */12 * * *'}]);
  const loaded=createRequire(import.meta.url)(join(root,'.vercel/output/functions/api/backup.func/runtime.cjs')).default;
  server=createServer((request,response)=>{void loaded(request,response);});await new Promise<void>((done,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',done);});
  const address=server.address();if(!address||typeof address==='string')throw Error('Owned transport listener unavailable');const origin='http://127.0.0.1:'+address.port;
  process.env.CRON_SECRET='synthetic-operator-secret-'.padEnd(64,'x');process.env.TURAS_WORK_BACKUP_ENABLED='1';process.env.TURAS_WORK_BACKUP_CONFIG='invalid-protected-config';delete process.env.VERCEL;
  // Equal character counts do not imply equal UTF-8 byte counts. Exercise the
  // actual built handler directly so the former rejected promise cannot leave
  // an HTTP request hanging or become an unhandled server rejection.
  let malformedStatus=0,malformedBody='';
  const malformedResponse={setHeader:()=>{},set statusCode(value:number){malformedStatus=value;},end:(body:string)=>{malformedBody=body;}};
  await expect(loaded({url:'/api/backup',method:'GET',headers:{authorization:'Bearer '+process.env.CRON_SECRET.slice(0,-1)+'é'}},malformedResponse)).resolves.toBeUndefined();
  expect(malformedStatus).toBe(401);expect(JSON.parse(malformedBody)).toEqual({error:'unauthorized'});
  expect((await fetch(origin+'/api/backup')).status).toBe(401);
  expect((await fetch(origin+'/api/backup?source=foreign')).status).toBe(404);
  expect((await fetch(origin+'/api/backup',{method:'POST'})).status).toBe(405);
  const headers={authorization:'Bearer '+process.env.CRON_SECRET};process.env.TURAS_WORK_BACKUP_ENABLED='0';
  expect(await (await fetch(origin+'/api/backup',{headers})).json()).toEqual({error:'backup_disabled',restorationReady:false});
  process.env.TURAS_WORK_BACKUP_ENABLED='1';expect(await (await fetch(origin+'/api/backup',{headers})).json()).toEqual({error:'backup_incomplete',restorationReady:false});
 }finally{
  if(server){server.closeAllConnections();await new Promise<void>(done=>server!.close(()=>done()));}
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous);await rm(root,{recursive:true,force:true});
 }
},60000);

it('paces scheduled capture from source time with one bounded abortable wait',async()=>{
 const scope=configuration(),capturedAt=new Date('2026-10-24T00:00:30Z'),sourceNow=new Date('2026-10-24T12:00:05Z');
 const receipt={archive_id:randomUUID(),installation_id:scope.installationId,source_project_id:scope.sourceProjectId,environment_id:scope.environmentId,source_commit:'a'.repeat(40),source_digest:'b'.repeat(64),catalog_digest:'c'.repeat(64),candidate_digest:'d'.repeat(64),captured_at:capturedAt,archive_captured_at:capturedAt,archive_environment_id:scope.environmentId};
 const plan=planWorkBackupCadence([receipt],scope,sourceNow);
 expect(plan).toEqual({waitMilliseconds:25000,notBeforeCapturedAt:'2026-10-24T12:00:30.000Z'});
 expect(planWorkBackupCadence([],scope,sourceNow)).toEqual({waitMilliseconds:0,notBeforeCapturedAt:undefined});
 expect(planWorkBackupCadence([receipt],scope,new Date(plan.notBeforeCapturedAt!))).toEqual({...plan,waitMilliseconds:0});
 // Previous releases still establish cadence; a deployment cannot reset it.
 expect(planWorkBackupCadence([{...receipt,source_commit:'e'.repeat(40)}],scope,sourceNow)).toEqual(plan);
 for(const change of [{installation_id:randomUUID()},{source_project_id:'prj_foreign'},{environment_id:'foreign'},{archive_environment_id:'foreign'},{archive_captured_at:new Date(capturedAt.getTime()+1)},{captured_at:'2026-10-24T00:00:30Z'},{source_digest:'invalid'}])expect(()=>planWorkBackupCadence([{...receipt,...change}],scope,sourceNow)).toThrow();
 expect(()=>planWorkBackupCadence([receipt,receipt],scope,sourceNow)).toThrow();
 expect(planWorkBackupCadence([receipt],scope,new Date('2026-10-24T11:59:29.999Z'))).toMatchObject({waitMilliseconds:60001,notBeforeCapturedAt:plan.notBeforeCapturedAt});
 expect(()=>planWorkBackupCadence([receipt],scope,new Date('2026-10-23T23:59:00Z'))).toThrow();
 expect(()=>planWorkBackupCadence([receipt],scope,new Date(NaN))).toThrow();
 const schedule={contract:'pilot-backup-schedule-v1',intervalHours:12,maximumAgeHours:24,retentionDays:7,deleteOperatorArchives:false,deleteIndependentAuthority:false};
 const entry=(at:Date)=>({id:randomUUID(),environmentId:scope.environmentId,ownership:'managed-016',capturedAt:at.toISOString(),expiresAt:new Date(at.getTime()+7*86400000).toISOString(),verifiedAt:at.toISOString()});
 const assess=(at:Date)=>assessBackupSchedule({schedule,environmentId:scope.environmentId,entries:[entry(capturedAt),entry(at)],now:Date.parse('2026-10-24T12:01:00Z')});
 expect(assess(sourceNow)).toMatchObject({fresh:true,observedCaptureSpacing:false,scheduleExecutionVerified:false});
 expect(assess(new Date(plan.notBeforeCapturedAt!))).toMatchObject({fresh:true,observedCaptureSpacing:true,scheduleExecutionVerified:false});
 vi.useFakeTimers();
 try{
  vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
  expect(planWorkBackupCadence([receipt],scope,sourceNow)).toEqual(plan);
  let finished=false;const controller=new AbortController(),waiting=waitForWorkBackupCadence(plan.waitMilliseconds,controller.signal).then(()=>{finished=true;});
  expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(24999);expect(finished).toBe(false);await vi.advanceTimersByTimeAsync(1);await waiting;expect(finished).toBe(true);expect(vi.getTimerCount()).toBe(0);
  const deadline=new AbortController(),reason=Error('Existing caller deadline');setTimeout(()=>deadline.abort(reason),10);
  const stopped=expect(waitForWorkBackupCadence(60000,deadline.signal)).rejects.toBe(reason);await vi.advanceTimersByTimeAsync(10);await stopped;expect(vi.getTimerCount()).toBe(0);
  await expect(waitForWorkBackupCadence(0,deadline.signal)).rejects.toBe(reason);
  await expect(waitForWorkBackupCadence(60001,new AbortController().signal)).rejects.toThrow('Bounded');expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
 // Drive the real runner through its wait and reconnect failure paths. SQL and
 // pricing boundaries are synthetic; no hosted operation is represented here.
 const previousRetries=process.env.VERCEL_BLOB_RETRIES;
 try{
  process.env.VERCEL_BLOB_RETRIES='0';
  for(const failure of ['abort','reconnect'] as const){
   vi.resetModules();vi.useFakeTimers();
   const clients:{connected:boolean;ended:boolean}[]=[],transitions:string[]=[],reserved:string[][]=[];
   const reconnectError=Error('Synthetic reconnect failure'),deadlineError=Error('Original deadline');
   class FakeClient{
    connected=false;ended=false;
    constructor(){clients.push(this);}
    async connect(){if(clients.length===3)throw reconnectError;this.connected=true;}
    async end(){this.connected=false;this.ended=true;}
    async query(sql:string){
     if(!this.connected)throw Error('Disconnected query attempted');
     if(sql.includes('SELECT r.archive_id'))return {rows:[receipt]};
     if(sql.includes('source_now'))return {rows:[{mode:'open',revision:1,environment_id:scope.environmentId,schema_version:CURRENT_SCHEMA_VERSION,source_now:sourceNow,owner:true}]};
     if(sql.includes('current_user=pg_get_userbyid'))return {rows:[{owner:true}]};
     throw Error('Unexpected SQL after cadence admission');
    }
   }
   vi.doMock('pg',()=>({Client:FakeClient}));
   vi.doMock('../../../lib/server/operations/work-backup-cost',async()=>({...await vi.importActual<object>('../../../lib/server/operations/work-backup-cost'),reserveWorkBackupCost:async()=>{const ids=[randomUUID(),randomUUID()];reserved.push(ids);return ids;},transitionWorkBackupCost:async(_db:unknown,_binding:unknown,_ids:unknown,state:string)=>{transitions.push(state);}}));
   vi.doMock('../../../lib/server/operations/work-backup-pricing',async()=>({...await vi.importActual<object>('../../../lib/server/operations/work-backup-pricing'),verifyWorkBackupPricing:async()=>({synthetic:true})}));
   const {runScheduledWorkBackup}=await import('../../../lib/server/operations/work-backup-run');
   const controller=new AbortController(),master=randomBytes(32);
   try{
    const running=runScheduledWorkBackup({configuration:scope,source:{sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:'d'.repeat(64)},assetRoot:'/synthetic-unused',signal:controller.signal,objects:{} as never,key:{master,reference:scope.keyReference,version:scope.keyVersion}});
    const rejected=expect(running).rejects.toBe(failure==='abort'?deadlineError:reconnectError);
    for(let turn=0;turn<50&&vi.getTimerCount()===0;turn++)await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);expect(clients).toHaveLength(2);expect(clients.every(client=>client.ended&&!client.connected)).toBe(true);
    if(failure==='abort')controller.abort(deadlineError);else await vi.advanceTimersByTimeAsync(25000);
    await rejected;
    expect(clients).toHaveLength(failure==='abort'?2:3);expect(transitions).toEqual(['dispatched']);expect(reserved).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
   }finally{master.fill(0);vi.useRealTimers();vi.doUnmock('pg');vi.doUnmock('../../../lib/server/operations/work-backup-cost');vi.doUnmock('../../../lib/server/operations/work-backup-pricing');vi.resetModules();}
  }
 }finally{if(previousRetries===undefined)delete process.env.VERCEL_BLOB_RETRIES;else process.env.VERCEL_BLOB_RETRIES=previousRetries;vi.useRealTimers();}
});

it('requires distinct versioned admission for expanded capture and keeps diagnostics secret-free',async()=>{
 const legacy=configuration(),expanded={...legacy,contract:'pilot-work-backup-config-v2',maximumArchiveBytes:6442450944,maximumObjectBytes:201326592,cost:{...legacy.cost}},price=workBackupCostCeilings(expanded.maximumObjectBytes,'pilot-work-backup-config-v2');expanded.cost.scopeDigest=workBackupScopeDigest(expanded);expanded.cost.hostingCeilingMicroUsd=price.hostingCeilingMicroUsd;expanded.cost.blobCeilingMicroUsd=price.blobCeilingMicroUsd;expect(workBackupConfigurationSchema.parse(expanded)).toEqual(expanded);expect(expanded.cost.scopeDigest).not.toBe(legacy.cost.scopeDigest);expect(()=>workBackupConfigurationSchema.parse({...expanded,contract:'pilot-work-backup-config-v1'})).toThrow();const small={...legacy,contract:'pilot-work-backup-config-v2'};expect(workBackupScopeDigest(small)).not.toBe(workBackupScopeDigest(legacy));
 const {recordWorkBackupFailure,workBackupFailureDiagnostic}=await import('../../../lib/server/operations/work-backup-diagnostics');const failure=Object.assign(Error('synthetic-private-credential'),{code:'synthetic-private-code'});recordWorkBackupFailure(failure,'capture');const diagnostic=workBackupFailureDiagnostic(failure);expect(diagnostic).toEqual({stage:'capture',code:'unclassified',reason:'unclassified'});expect(JSON.stringify(diagnostic)).not.toContain('synthetic-private');expect(failure.message).toBe('synthetic-private-credential');const hostile=Object.defineProperty(Error('synthetic-private-credential'),'code',{get(){throw Error('synthetic-private-accessor');}});expect(()=>workBackupFailureDiagnostic(hostile)).not.toThrow();expect(JSON.stringify(workBackupFailureDiagnostic(hostile))).not.toContain('synthetic-private');
 const inner=Error('Native snapshot dump incomplete');recordWorkBackupFailure(inner,'capture-native-dump');recordWorkBackupFailure(inner,'capture');expect(workBackupFailureDiagnostic(inner)).toEqual({stage:'capture-native-dump',code:'unclassified',reason:'database-dump'});
 let getterCalls=0;const getters=Object.defineProperties(Error('synthetic-private-secret'),{message:{get(){getterCalls++;throw Error('secret');}},code:{get(){getterCalls++;throw Error('secret');}},cause:{get(){getterCalls++;throw Error('secret');}}});recordWorkBackupFailure(getters,'capture-encrypt');expect(workBackupFailureDiagnostic(getters)).toEqual({stage:'capture-encrypt',code:'unclassified',reason:'unclassified'});expect(getterCalls).toBe(0);
 const hostileProxy=new Proxy({}, {getOwnPropertyDescriptor(){throw Error('synthetic-private-proxy');},get(){getterCalls++;throw Error('secret');}});recordWorkBackupFailure(hostileProxy,'capture-objects');expect(workBackupFailureDiagnostic(hostileProxy)).toEqual({stage:'capture-objects',code:'unclassified',reason:'unclassified'});expect(getterCalls).toBe(0);
 const {captureWorkRecoveryCandidate}=await import('../../../lib/server/operations/capture-work-candidate');const preflight=await captureWorkRecoveryCandidate({maximumEncryptedArchiveBytes:0} as never).catch(error=>error);expect(workBackupFailureDiagnostic(preflight).stage).toBe('capture-preflight');
 const {runNativeRecoveryPgDump}=await import('../../../lib/server/operations/native-postgres');const nativePreflight=await runNativeRecoveryPgDump({signal:new AbortController().signal,snapshot:'invalid!',serverMajor:18} as never).catch(error=>error);expect(workBackupFailureDiagnostic(nativePreflight)).toEqual({stage:'capture-native-preflight',code:'unclassified',reason:'native-platform'});
});
