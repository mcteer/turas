import { Client } from 'pg';

export async function requireOwnedReportsDatabase(): Promise<void> {
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
