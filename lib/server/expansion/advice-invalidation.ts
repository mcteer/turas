import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
/** Same-transaction metadata retirement fixes the earliest invalidation deadline.
 * No assistant or hypothesis prose is read or restored by this fanout. */
export async function retireExpansionAdviceDependency(db:PoolClient,kind:string,id:string){
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 if(Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[env])).rows[0]?.schema_version??0)<47)return 0;
 const retired=(await db.query(`INSERT INTO expansion_advice_retirements(attempt_id)
  SELECT DISTINCT a.id FROM expansion_advice_attempts a JOIN expansion_advice_dependencies d ON d.attempt_id=a.id
  WHERE a.environment_id=$1 AND d.kind=$2 AND d.dependency_id=$3 ON CONFLICT DO NOTHING RETURNING attempt_id`,[env,kind,id])).rows;
 return retired.length;
}
