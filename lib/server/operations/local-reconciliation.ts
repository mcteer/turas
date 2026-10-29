import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {query} from '../db/client';
import {getServerConfig} from '../config';
const command=promisify(execFile);
/** No glob, prune or broad removal: reconcile only the durable exact local job. */
export async function runLocalReconciliation(input:{limit:number;signal:AbortSignal}){
 if(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100)throw Error('Finite local reconciliation required');
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 const rows=(await query<{id:string;lease_id:string}>(`SELECT id,lease_id FROM operations_local_jobs WHERE environment_id=$1
 AND state IN ('running','reconciling') AND (state='reconciling' OR deadline_at<=clock_timestamp() OR lease_expires_at<=clock_timestamp()) ORDER BY deadline_at,id LIMIT $2`,[environmentId,input.limit+1])).rows;
 for(const row of rows.slice(0,input.limit)){
  input.signal.throwIfAborted();if(!/^[a-f0-9-]{36}$/.test(row.id))throw Error('Invalid local job identity');
  const name='turas-job-'+row.id;
  await query("UPDATE operations_local_jobs SET state='reconciling' WHERE id=$1 AND environment_id=$2 AND lease_id=$3 AND state='running' AND (deadline_at<=clock_timestamp() OR lease_expires_at<=clock_timestamp())",[row.id,environmentId,row.lease_id]);
  if(!(await query("SELECT 1 FROM operations_local_jobs WHERE id=$1 AND environment_id=$2 AND lease_id=$3 AND state='reconciling'",[row.id,environmentId,row.lease_id])).rowCount)continue;
  try{
   const {stdout}=await command('docker',['inspect','--format','{{json .Config.Labels}}',name],{timeout:5000,maxBuffer:4096,signal:input.signal});
   const labels=JSON.parse(stdout);if(labels?.['turas.job.owner']!==row.id||labels?.['turas.job.environment']!==createHash('sha256').update(environmentId).digest('hex'))throw Error('Local compute ownership differs');
   await command('docker',['rm','--force',name],{timeout:5000,maxBuffer:4096,signal:input.signal});
   try{await command('docker',['inspect',name],{timeout:5000,maxBuffer:4096,signal:input.signal});throw Error('Local compute deletion unverified');}catch(error){if(!/No such (?:object|container)/i.test((error as {stderr?:string}).stderr??''))throw error;}
  }catch(error){if(!/No such (?:object|container)/i.test((error as {stderr?:string}).stderr??''))throw error;}
  input.signal.throwIfAborted();await query("UPDATE operations_local_jobs SET state='cancelled',finished_at=clock_timestamp() WHERE id=$1 AND environment_id=$2 AND lease_id=$3 AND state='reconciling'",[row.id,environmentId,row.lease_id]);
 }
 return {backlog:rows.length>input.limit?1:0,truncated:rows.length>input.limit};
}
