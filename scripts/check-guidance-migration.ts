import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readDatabaseSafetyBoundary} from '../lib/server/operations/database-safety-boundary';
import {withMcpEnvironment} from './mcp-environment';
import {mcpFixture,withMcpDatabase} from '../tests/fixtures/mcp/setup';

/** Synthetic, owned PostgreSQL only. No selected database or model calls. */
export async function checkGuidanceMigration(){
 await withMcpEnvironment(async environment=>{
  const seeded=await withMcpDatabase(async db=>{
   assert.equal((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version,85);
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   try{await readDatabaseSafetyBoundary(db,process.env.TURAS_ENVIRONMENT_ID!);}
   finally{await db.query('ROLLBACK');}
   const {browser,customerId}=await mcpFixture(db);
   const conversationId=randomUUID(),messageId=randomUUID(),attemptId=randomUUID();
   await db.query(`INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,
    creation_operation_id,binding_state,title,context_audience,context_generation,
    context_snapshot_schema,context_login_session_id,context_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic freshness migration','internal',0,'customer-context-v1',$7,$8)`,
    [conversationId,process.env.TURAS_ENVIRONMENT_ID,browser.workspaceId,customerId,browser.principalId,
     randomUUID(),browser.sessionId,browser.membershipId]);
   await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
    VALUES($1,$2,$3,$4,'Synthetic migration question')`,[messageId,conversationId,randomUUID(),'a'.repeat(64)]);
   await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,dispatch_state,response_state,input_digest)
    VALUES($1,$2,$3,'rejected','failed',$4)`,[attemptId,conversationId,messageId,'b'.repeat(64)]);
   // Cover account and workspace references, including a removed original attempt.
   for(const [scope,snapshot,firstAttempt] of [[customerId,'c'.repeat(64),attemptId],[null,'d'.repeat(64),randomUUID()]] as const)
    await db.query(`INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
     VALUES($1,$2,$3,$4)`,[conversationId,scope,'public_practice:'+snapshot,firstAttempt]);
   return {conversationId,customerId,attemptId};
  });
  await environment.backupRestore();
  await environment.upgradeToCurrent();
  async function verify(){
   await withMcpDatabase(async db=>{
    assert.equal((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version,86);
    const rows=(await db.query(`SELECT scope_key,snapshot_id,attempt_id,valid_until<clock_timestamp() AS expired,
     retired_refresh_id FROM ordinary_practice_guidance_reads WHERE conversation_id=$1 ORDER BY snapshot_id`,[seeded.conversationId])).rows;
    assert.deepEqual(rows,[
     {scope_key:seeded.customerId,snapshot_id:'c'.repeat(64),attempt_id:seeded.attemptId,expired:true,retired_refresh_id:null},
     {scope_key:'workspace',snapshot_id:'d'.repeat(64),attempt_id:seeded.attemptId,expired:true,retired_refresh_id:null},
    ]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[seeded.conversationId])).rows[0].count,2);
    for(const privilege of ['SELECT','INSERT','UPDATE'])assert.equal((await db.query(
     "SELECT has_table_privilege('turas_runtime','ordinary_practice_guidance_reads',$1) AS allowed",[privilege])).rows[0].allowed,true);
    assert.equal((await db.query("SELECT has_table_privilege('turas_runtime','ordinary_practice_guidance_reads','DELETE') AS allowed")).rows[0].allowed,false);
    await db.query('BEGIN');
    try{
     await db.query('SET LOCAL ROLE turas_runtime');
     assert.equal((await db.query('SELECT snapshot_id FROM ordinary_practice_guidance_reads WHERE conversation_id=$1',[seeded.conversationId])).rowCount,2);
     assert.equal((await db.query('UPDATE ordinary_practice_guidance_reads SET valid_until=valid_until WHERE conversation_id=$1',[seeded.conversationId])).rowCount,2);
    }finally{await db.query('ROLLBACK');}
   });
  }
  await verify();
  await environment.backupRestore();
  await environment.restartDatabase();
  await verify();
  console.info('Guidance migration: populated 85→86, conservative backfill, runtime grants, backup/restore and restart passed.');
 },{priorSchema:85});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2)throw Error('Guidance migration check takes no overrides');
 await checkGuidanceMigration();
}
