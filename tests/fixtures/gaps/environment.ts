import { Pool, type PoolClient } from 'pg';
import { requireOwnedGapDatabase } from '../../../scripts/gaps-eval-environment';
export async function withGapDatabase<T>(run:(db:PoolClient)=>Promise<T>,owner=true){const pool=new Pool({connectionString:requireOwnedGapDatabase(process.env,owner),max:5});try{const db=await pool.connect();try{return await run(db);}finally{db.release();}}finally{await pool.end();}}
