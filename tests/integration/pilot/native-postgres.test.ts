import {beforeAll,afterAll,it,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
const run=promisify(execFile),image='node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f';
let root:string,result:Record<string,unknown>;
beforeAll(async()=>{
 root=await mkdtemp(resolve('local-artifacts/016/native-postgres-test-'));const output=join(root,'output');await mkdir(output,{mode:0o700});
 await run(resolve('node_modules/esbuild/bin/esbuild'),['tests/integration/pilot/native-postgres-probe.ts','--bundle','--platform=node','--format=esm','--packages=external','--outfile='+join(root,'probe.mjs')],{timeout:30000});
 await run('docker',['pull','--platform','linux/amd64',image],{timeout:120000,maxBuffer:1048576});
 await withPilotEnvironment(async scope=>{
  const url=new URL(requireOwnedPilotDatabase(process.env,true));url.port='5432';const name='turas-016-native-test-'+scope.databaseOwnerLabel;
  try{
   try{await run('docker',['run','--rm','--platform','linux/amd64','--name',name,'--label','turas.016.native-client-owner='+scope.databaseOwnerLabel,'--network','container:'+scope.databaseContainer,'--read-only','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges','--user',String(process.getuid?.())+':'+String(process.getgid?.()),'--memory','512m','--cpus','1','--pids-limit','64','--mount','type=bind,src='+resolve('infra/pilot/native-postgres/linux-amd64')+',dst=/native-client,readonly','--mount','type=bind,src='+resolve('infra/pilot')+',dst=/sql,readonly','--mount','type=bind,src='+join(root,'probe.mjs')+',dst=/work/probe.mjs,readonly','--mount','type=bind,src='+resolve('node_modules')+',dst=/work/node_modules,readonly','--mount','type=bind,src='+output+',dst=/output','--env','DATABASE_URL_UNPOOLED','--env','TURAS_TEST_ENVIRONMENT_ID','--env','TURAS_PILOT_OWNED','--env','NODE_ENV=test','--env','TURAS_ENVIRONMENT_ID='+scope.environmentId,image,'node','/work/probe.mjs'],{timeout:120000,maxBuffer:65536,env:{NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME,DATABASE_URL_UNPOOLED:url.toString(),TURAS_TEST_ENVIRONMENT_ID:scope.environmentId,TURAS_PILOT_OWNED:'1'}});}catch(error){const diagnostic=String((error as {stderr?:string}).stderr??'Unavailable probe diagnostic').replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'\"<>]+/g,'[redacted-url]').replaceAll(decodeURIComponent(url.password),'[redacted-secret]');await writeFile(root+'-failure.log',diagnostic.slice(-32768),{mode:0o600,flag:'wx'});throw Error('Isolated native PostgreSQL proof failed; private diagnostic retained');}
   result=JSON.parse(await readFile(join(output,'result.json'),'utf8'));
  }finally{
   try{const label=await run('docker',['inspect','--format','{{index .Config.Labels "turas.016.native-client-owner"}}',name],{timeout:5000});if(label.stdout.trim()!==scope.databaseOwnerLabel)throw Error('Native proof ownership changed');await run('docker',['rm','--force',name],{timeout:5000});}catch(error){if(!/No such (?:object|container)/i.test((error as {stderr?:string}).stderr??''))throw error;}
  }
 },{postgresMajor:18,deadlineMs:180000});
},240000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
it('restores the exported snapshot with the real Linux client while retaining later source writes',()=>{
 expect(result).toMatchObject({snapshotContentRestored:true,sourceContentRetained:true,hostedVerified:false,dump:{serverMajor:18,clientMajor:18}});
});
it('denies cancelled native execution without leaving a partial dump',()=>{
 expect(result).toMatchObject({cancellationDenied:true,cancelledOutputAbsent:true});
});
it('captures and authenticates all private namespaces with the locked native database checkpoint',()=>{
 expect(result).toMatchObject({matchedCaptureVerified:true,hostedVerified:false});
});
it('fences routine backup IO without changing open service control or claiming cron execution',()=>{
 expect(result).toMatchObject({scheduledCaptureVerified:true,hostedVerified:false});
});
it('cold downloads and authenticates the matched archive with immutable idempotent capture audit',()=>{
 expect(result).toMatchObject({coldCopyVerified:true,hostedVerified:false});
});
it('holds unknown backup costs and preserves atomic category budgets across retries and exhaustion',()=>{
 expect(result).toMatchObject({costAdmissionVerified:true,hostedVerified:false});
});
it('cold reads derived-key archives without source access and rejects a wrong retained master',()=>{
 expect(result).toMatchObject({coldReadVerified:true,hostedVerified:false});
});
it('provisions one bounded work authorization without expanding or resetting category budgets',()=>{
 expect(result).toMatchObject({costProvisionVerified:true,hostedVerified:false});
});
it('runs complete bounded scheduled capture, cold copy, cleanup and cost accounting without changing service control',()=>{
 expect(result).toMatchObject({scheduledRunVerified:true,hostedVerified:false});
});

it('runs one reviewed manual capture with full prior costs retained and rejects replay without changing the scheduled slot',()=>{
 expect(result).toMatchObject({manualRunVerified:true,hostedVerified:false});
});
