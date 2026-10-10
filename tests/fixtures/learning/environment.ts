import { Pool, type PoolClient } from 'pg';
import { requireOwnedLearningDatabase } from '../../../scripts/learning-environment';
export async function withLearningDatabase<T>(run:(db:PoolClient)=>Promise<T>,owner=true){const pool=new Pool({connectionString:requireOwnedLearningDatabase(process.env,owner),max:5});try{const db=await pool.connect();try{return await run(db);}finally{db.release();}}finally{await pool.end();}}
