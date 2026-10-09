import { Pool, type PoolClient } from 'pg';
import { requireOwnedPartnerDatabase } from '../../../scripts/partners-environment';
export async function withPartnerDatabase<T>(run:(db:PoolClient)=>Promise<T>,owner=true){const pool=new Pool({connectionString:requireOwnedPartnerDatabase(process.env,owner),max:5});try{const db=await pool.connect();try{return await run(db);}finally{db.release();}}finally{await pool.end();}}
