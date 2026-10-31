import {query} from '../db/client';
import {getServerConfig} from '../config';
import {operationalCodeVersion} from './code-version';
/** Preserve the pre-existing tighter 15-second infrastructure freshness bound.
 * A scheduler start or unrelated class heartbeat cannot satisfy this check. */
export async function hostedFileWorkerReady(id:'artifacts'|'workforce'|'reports'){
 try{
  const result=await query(`SELECT 1 FROM operations_maintenance_status WHERE environment_id=$1 AND class_id=$2
   AND code_version=$3 AND safe_failure IS NULL AND last_success_at>clock_timestamp()-($4::int*interval '1 millisecond')
   AND last_success_at<=clock_timestamp() AND last_completed_at>=last_success_at`,[getServerConfig().TURAS_ENVIRONMENT_ID,id,operationalCodeVersion(),id==='reports'?45000:15000]);
  return result.rowCount===1;
 }catch{return false;}
}
