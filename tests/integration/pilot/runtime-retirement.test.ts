import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {retireOwnedLegacyRuntime,retireLockedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {assertPilotDatabaseOnConnection} from '../../../lib/server/db/readiness';

async function fixture(run:(owner:Client,environmentId:string)=>Promise<void>){
 await withPilotEnvironment(async env=>{const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{await run(owner,env.environmentId);}finally{await owner.end();}},{postgresMajor:18,deadlineMs:120000});
}
async function lock(owner:Client,environmentId:string){const recoveryId=randomUUID();const revision=(await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0].revision;return {environmentId,recoveryId,controlRevision:Number(revision),password:randomBytes(32).toString('base64url')};}

it('retires old runtime credentials and active backends without unlocking or widening replacement grants',async()=>fixture(async(owner,environmentId)=>{
 const oldUrl=requireOwnedPilotDatabase(),old=new Client({connectionString:oldUrl});let disconnected=false;old.on('error',()=>{disconnected=true;});await old.connect();
 expect((await old.query('SELECT count(*) FROM login_sessions')).rowCount).toBe(1);
 const scope=await lock(owner,environmentId),before=(await owner.query('SELECT id,token_hash,expires_at,revoked_at FROM login_sessions ORDER BY id')).rows;
 expect(await retireOwnedLegacyRuntime(owner,scope)).toMatchObject({oldLoginDisabled:true,oldBackendsTerminated:true,mode:'locked',hostedCredentialsChanged:false,restorationReady:false});
 await expect(old.query('SELECT count(*) FROM login_sessions')).rejects.toThrow();await old.end().catch(()=>{});
 const reconnect=new Client({connectionString:oldUrl});try{await expect(reconnect.connect()).rejects.toMatchObject({code:'28000'});}finally{await reconnect.end();}
 const replacementUrl=new URL(oldUrl);replacementUrl.username='turas_runtime_016';replacementUrl.password=scope.password;
 const replacement=new Client({connectionString:replacementUrl.toString()});await replacement.connect();
 try{
  await assertPilotDatabaseOnConnection(environmentId,(sql,values=[])=>replacement.query(sql,[...values]));
  expect((await replacement.query("SELECT mode FROM operations_control WHERE environment_id=$1",[environmentId])).rows[0].mode).toBe('locked');
  await expect(replacement.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
  await expect(replacement.query('CREATE TABLE runtime_escalation(id int)')).rejects.toMatchObject({code:'42501'});
 }finally{await replacement.end();}
 expect((await owner.query('SELECT id,token_hash,expires_at,revoked_at FROM login_sessions ORDER BY id')).rows).toEqual(before);
 expect(disconnected).toBe(true);
}),150000);

it('rejects stale runtime retirement before changing either login',async()=>fixture(async(owner,environmentId)=>{
 const scope=await lock(owner,environmentId);
 await expect(retireLockedLegacyRuntime(owner,scope,{databaseName:'foreign_database',ownerRole:'postgres'})).rejects.toThrow('Exact retirement database owner');
 await expect(retireOwnedLegacyRuntime(owner,{...scope,controlRevision:scope.controlRevision+1})).rejects.toThrow('Exact locked');
 expect((await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime'")).rows[0].rolcanlogin).toBe(true);
 expect((await owner.query("SELECT 1 FROM pg_roles WHERE rolname='turas_runtime_016'")).rowCount).toBe(0);
}),150000);

it('rejects an escalated legacy permission role before creating the replacement login',async()=>fixture(async(owner,environmentId)=>{
 const scope=await lock(owner,environmentId);await owner.query('GRANT UPDATE ON operations_control TO turas_runtime');
 await expect(retireOwnedLegacyRuntime(owner,scope)).rejects.toThrow('Restricted legacy permission role required');
 expect((await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime'")).rows[0].rolcanlogin).toBe(true);
 expect((await owner.query("SELECT 1 FROM pg_roles WHERE rolname='turas_runtime_016'")).rowCount).toBe(0);
}),150000);

it('rejects an existing replacement role without rotating its secret or reopening the retired login',async()=>fixture(async(owner,environmentId)=>{
 const scope=await lock(owner,environmentId);await retireOwnedLegacyRuntime(owner,scope);
 const before=(await owner.query("SELECT rolpassword FROM pg_authid WHERE rolname='turas_runtime_016'")).rows[0].rolpassword;
 expect(await retireOwnedLegacyRuntime(owner,scope)).toMatchObject({oldLoginDisabled:true,mode:'locked'});
 await expect(retireOwnedLegacyRuntime(owner,{...scope,password:randomBytes(32).toString('base64url')})).rejects.toThrow('Replacement runtime already exists');
 expect((await owner.query("SELECT rolpassword FROM pg_authid WHERE rolname='turas_runtime_016'")).rows[0].rolpassword).toBe(before);
 expect((await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime'")).rows[0].rolcanlogin).toBe(false);
 await owner.query('GRANT UPDATE ON operations_control TO turas_runtime_016');
 try{await expect(retireOwnedLegacyRuntime(owner,scope)).rejects.toThrow('Restricted replacement');}
 finally{await owner.query('REVOKE UPDATE ON operations_control FROM turas_runtime_016');}
}),150000);

it('runs the protected retirement command without retaining the replacement secret in its receipt',async()=>fixture(async(owner,environmentId)=>{
 const scope=await lock(owner,environmentId),root=await mkdtemp(resolve('local-artifacts/016/runtime-command-')),file=join(root,'input.json'),output=join(root,'result');
 try{
  await writeFile(file,JSON.stringify(scope),{mode:0o600,flag:'wx'});
  const result=await promisify(execFile)(process.execPath,['--import','tsx','scripts/pilot-recovery-authority.ts','--retire-owned-runtime','--input',file,'--output',output],{timeout:60000,maxBuffer:65536,env:process.env});
  const receipt=await readFile(join(output,'retirement.json'),'utf8');
  expect(JSON.parse(receipt)).toMatchObject({oldLoginDisabled:true,oldBackendsTerminated:true,ownedRehearsal:true,hostedCredentialsChanged:false,restorationReady:false});
  expect(receipt).not.toContain(scope.password);expect(result.stdout).not.toContain(scope.password);expect(result.stderr).not.toContain(scope.password);
 }finally{await rm(root,{recursive:true,force:true});}
}),150000);
