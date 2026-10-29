import { Client } from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';

export async function requireOwnedReportsDatabase(): Promise<void> {
 if(process.env.TURAS_PILOT_OWNED==='1'){
  const raw=requireOwnedPilotDatabase(process.env,true);if(raw!==process.env.TURAS_TEST_DATABASE_URL||raw===process.env.DATABASE_URL)throw Error('Owned pilot runtime/owner separation required');
  const client=new Client({connectionString:raw,connectionTimeoutMillis:5000});await client.connect();try{const row=(await client.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0];if(row?.environment_id!==process.env.TURAS_ENVIRONMENT_ID||row?.schema_version!==80)throw Error('Owned pilot environment required');}finally{await client.end();}return;
 }
  const raw=process.env.TURAS_TEST_DATABASE_URL;
  if (!raw || raw!==process.env.DATABASE_URL || raw!==process.env.DATABASE_URL_UNPOOLED ||
      !process.env.TURAS_TEST_ENVIRONMENT_ID?.startsWith('test-') ||
      process.env.TURAS_ENVIRONMENT_ID!==process.env.TURAS_TEST_ENVIRONMENT_ID ||
      !/^turas_test_009_eval_[a-f0-9]{12}$/.test(new URL(raw).pathname.slice(1))) {
    throw new Error('Owned 009 test clone required');
  }
  const client=new Client({connectionString:raw,connectionTimeoutMillis:5000});
  await client.connect();
  try {
    const result=await client.query<{marker:string}>('SELECT shobj_description(oid,\'pg_database\') AS marker FROM pg_database WHERE datname=current_database()');
    if (!result.rows[0]?.marker?.startsWith('turas-owned-009-')) throw new Error('Owned database marker required');
  } finally {await client.end();}
}

export async function withReportsDatabase<T>(run:(db:import('pg').PoolClient)=>Promise<T>):Promise<T>{
 await requireOwnedReportsDatabase();const {Pool}=await import('pg');
 const pool=new Pool({connectionString:process.env.TURAS_TEST_DATABASE_URL,max:5});
 try{const db=await pool.connect();try{return await run(db);}finally{db.release();}}finally{await pool.end();}
}

/** Clock/fence setup in verified disposable fixtures only. Application behavior
 * continues through the actual runtime connection and its normal privileges. */
export async function ownedReportFixtureTransaction<T>(run:(db:import('pg').PoolClient)=>Promise<T>):Promise<T>{
 return withReportsDatabase(async db=>{
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='report_deliveries'::regclass")).rows[0]?.owner!==true)throw Error('Owned report fixture requires actual database owner');
  await db.query('BEGIN');
  try{const result=await run(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}
 });
}
