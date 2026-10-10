import { Pool } from 'pg';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { knowledgeLineageIsCurrent } from '../lib/server/profiles/eligibility';
/** Operator-only transaction: snapshot eligible heads and activate once atomically. */
export async function activateLearning(environmentId:string,workspaceId:string,enabled:boolean,url:string){
 const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});
 try{const db=await pool.connect();try{
  await db.query('BEGIN');
  await db.query("SET LOCAL transaction_timeout='30s'");
  await db.query("SET LOCAL lock_timeout='2s'");
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==environmentId||![54,55].includes(Number(marker[0].schema_version)))throw Error('Explicit schema 054 or 055 environment required');
  const authority=(await db.query(`SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='learning_workspace_state'::regclass`)).rows[0];
  if(!authority?.owner)throw Error('Learning activation requires the migration owner');
  const state=(await db.query(`SELECT gate_activated_at FROM learning_workspace_state WHERE environment_id=$1 AND workspace_id=$2 FOR UPDATE`,[environmentId,workspaceId])).rows[0];
  if(!state)throw Error('Workspace learning state missing');
  // Prevent an old writer slipping a new published head between snapshot and gate.
  await db.query('LOCK TABLE knowledge_publications IN SHARE ROW EXCLUSIVE MODE');
  if(state.gate_activated_at===null){
   const heads=await db.query<{id:string;revision_id:string;head_generation:string}>(`SELECT p.id,p.revision_id,p.head_generation FROM knowledge_publications p
     JOIN knowledge_contributions c ON c.id=p.contribution_id WHERE p.environment_id=$1 AND c.workspace_id=$2 AND p.state='published' ORDER BY p.id FOR UPDATE OF p`,[environmentId,workspaceId]);
   for(const head of heads.rows){
    if(!await knowledgeLineageIsCurrent(db,head.revision_id))continue;
    await db.query(`INSERT INTO learning_legacy_heads(environment_id,workspace_id,publication_id,revision_id,publication_generation) VALUES($1,$2,$3,$4,$5)`,[environmentId,workspaceId,head.id,head.revision_id,head.head_generation]);
   }
  }
  await db.query(`UPDATE learning_workspace_state SET enabled=$3,gate_activated_at=coalesce(gate_activated_at,clock_timestamp()),version=version+1 WHERE environment_id=$1 AND workspace_id=$2`,[environmentId,workspaceId,enabled]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const workspace=process.argv[process.argv.indexOf('--workspace')+1];
 if(!process.argv.includes('--workspace')||!process.argv.includes('--activate')||!process.env.DATABASE_URL_UNPOOLED||!process.env.TURAS_ENVIRONMENT_ID)
  throw Error('Explicit --activate --workspace UUID, migration URL and environment required');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspace))throw Error('Workspace UUID required');
 await activateLearning(process.env.TURAS_ENVIRONMENT_ID,workspace,!process.argv.includes('--disabled'),process.env.DATABASE_URL_UNPOOLED);
 console.log('Learning activation recorded; hosted behavior requires separate verification');
}
