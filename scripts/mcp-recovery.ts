import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { withMcpEnvironment } from "./mcp-environment";
import { withMcpDatabase,mcpFixture } from "../tests/fixtures/mcp/setup";
import { assertMcpReady } from "../lib/server/mcp/schema";
import { lockWorkspaceActor } from "../lib/server/profiles/policy";
import { withTransaction } from "../lib/server/db/client";
import { mkdir,mkdtemp,writeFile,access } from 'node:fs/promises';
import { join } from 'node:path';
import { fork,spawnSync } from 'node:child_process';
import { featureSourceDigest } from './execution-source-digest';
import { activateLearning } from './learning-activate';
import { requireOwnedMcpDatabase } from './mcp-environment';

export async function checkMcpRecovery(){
  if(process.argv.length!==2)throw Error('MCP recovery takes no overrides');
  const sourceDigest=await featureSourceDigest('015');
  await mkdir('local-artifacts/015',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/015/recovery-'));
  await withMcpEnvironment(async environment=>{
    await withMcpDatabase(async db=>{await assertMcpReady(db);const {actor}=await mcpFixture(db);
      await activateLearning(actor.environmentId,actor.workspaceId,false,requireOwnedMcpDatabase(process.env,true));});
    await environment.backupRestore();await environment.restartDatabase();
  });
  await withMcpEnvironment(async environment=>{
    await environment.backupRestore();
    await withMcpDatabase(async db=>{
      const before=JSON.stringify((await db.query('SELECT id,workspace_id,display_name FROM customer_references ORDER BY id')).rows);
      let refused=false;try{await assertMcpReady(db);}catch{refused=true;}
      if(!refused)throw Error('054 unexpectedly admitted MCP');
      const {actor}=await mcpFixtureAfter054(db);
      await activateLearning(actor.environmentId,actor.workspaceId,false,requireOwnedMcpDatabase(process.env,true));
      await environment.upgradeToCurrent();
      await assertMcpReady(db);
      if(before!==JSON.stringify((await db.query('SELECT id,workspace_id,display_name FROM customer_references ORDER BY id')).rows))throw Error('Upgrade changed customer truth');
    });
    const actor=await withMcpDatabase(async db=>{
      const {actor}=await mcpFixture(db);
      await db.query('UPDATE mcp_connections SET revoked_at=now(),revoker_membership_id=membership_id WHERE id=$1',[actor.connectionId]);
      let denied=false;try{await withTransaction(client=>lockWorkspaceActor(client,actor,undefined,true));}catch{denied=true;}
      if(!denied)throw Error('Revoked authority admitted');
      return actor;
    });
    await environment.backupRestore();
    await environment.restartDatabase();
    await withMcpDatabase(async db=>{
      await assertMcpReady(db);
      const connection=(await db.query('SELECT revoked_at FROM mcp_connections WHERE id=$1',[actor.connectionId])).rows[0];
      if(!connection?.revoked_at)throw Error('Restore lost revocation');
    });
    let denied=false;try{await withTransaction(client=>lockWorkspaceActor(client,actor,undefined,true));}catch{denied=true;}
    if(!denied)throw Error('Restored revoked authority admitted');
  },{priorSchema:54});
  const child=fork(resolve('scripts/mcp-recovery-interrupt.ts'),[],{execArgv:['--import','tsx'],stdio:['ignore','ignore','ignore','ipc']});
  let owned:{appRoot:string;databaseName:string}|undefined;
  try{
    await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error('Owned interrupt setup deadline')),120000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{if(!owned){clearTimeout(timer);reject(Error('Owned interrupt setup failed'));}});
      child.once('message',message=>{const value=message as {appRoot?:unknown;databaseName?:unknown};
        if(typeof value.appRoot!=='string'||!value.appRoot.startsWith(resolve('local-artifacts/015/owned-'))||typeof value.databaseName!=='string'||!/^turas_test_015_eval_[a-f0-9]{12}$/.test(value.databaseName)){clearTimeout(timer);reject(Error('Owned interrupt identity mismatch'));return;}
        owned={appRoot:value.appRoot,databaseName:value.databaseName};clearTimeout(timer);done();});});
    const exited=new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error('Owned interrupt cleanup deadline')),30000);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('Owned interrupt cleanup failed'));});});
    child.kill('SIGTERM');await exited;
    const container='turas-015-check-'+owned!.databaseName.slice('turas_test_015_eval_'.length),inspection=spawnSync('docker',['inspect',container],{encoding:'utf8',timeout:10000});
    if(inspection.status===0||!/No such (?:object|container)/i.test(inspection.stderr))throw Error('Interrupted owned container remains');
    let remaining=false;try{await access(owned!.appRoot);remaining=true;}catch{}if(remaining)throw Error('Interrupted owned app remains');
  }finally{if(child.exitCode===null)child.kill('SIGTERM');}
  if(await featureSourceDigest('015')!==sourceDigest)throw Error('Recovery source changed');
  const summary={sourceDigest,from:['empty',54],to:55,backupRestore:true,unchangedCustomerTruth:true,persistentRevocation:true,restart:true,
    interruptedOwnedCleanup:true,learningCompatibility:[54,55],paidCalls:0,hostedProof:false};
  await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
  console.info('MCP owned 054 restore, 055 upgrade/restore/restart and persistent revocation checks passed');
}
async function mcpFixtureAfter054(db:import('pg').PoolClient){
  const {mcpInternalPeer}=await import('../tests/fixtures/mcp/setup');
  const workspace=(await db.query('SELECT id FROM workspaces ORDER BY id LIMIT 1')).rows[0].id as string;
  return {actor:{...await mcpInternalPeer(db,workspace),environmentId:process.env.TURAS_ENVIRONMENT_ID!}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkMcpRecovery().catch(error=>{console.error(error instanceof Error?error.message:'MCP recovery failed');process.exitCode=1;});
