import {it,expect} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workBackupConfigurationSchema,workBackupScopeDigest,deriveWorkBackupKey} from '../../../lib/server/operations/work-backup-run';
import {preparePilotRecoveryOperator} from '../../../scripts/prepare-pilot-recovery-operator';
import {sealWorkCandidate,unsealWorkCandidate} from '../../../lib/server/operations/work-candidate-capsule';
import {workBackupPricingDigest} from '../../../lib/server/operations/work-backup-pricing';
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
  const {isEveProjectRoot}=await import(pathToFileURL(resolve('node_modules/eve/dist/src/internal/eve-project-root.js')).href);
  expect(await isEveProjectRoot(root)).toBe(true);
  const deploymentConfig=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const outputConfig=JSON.parse(await readFile(join(root,'.vercel/output/config.json'),'utf8'));
  expect([...(deploymentConfig.crons??[]),...(outputConfig.crons??[])]).toEqual([{path:'/api/backup',schedule:'0 */12 * * *'}]);
  const loaded=createRequire(import.meta.url)(join(root,'.vercel/output/functions/api/backup.func/runtime.cjs')).default;
  server=createServer((request,response)=>{void loaded(request,response);});await new Promise<void>((done,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',done);});
  const address=server.address();if(!address||typeof address==='string')throw Error('Owned transport listener unavailable');const origin='http://127.0.0.1:'+address.port;
  process.env.CRON_SECRET='synthetic-operator-secret-'.padEnd(64,'x');process.env.TURAS_WORK_BACKUP_ENABLED='1';process.env.TURAS_WORK_BACKUP_CONFIG='invalid-protected-config';delete process.env.VERCEL;
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
