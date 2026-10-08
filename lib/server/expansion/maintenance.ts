import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {requireExpansionEnvironment} from './policy';
import {expansionOpaqueHashes} from './commands';
function maintenanceLimit(limit:number){if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid expansion maintenance limit');return limit;}
export async function expireExpansionReceipts(limit=100){
 maintenanceLimit(limit);const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 return withTransaction(async db=>{await requireExpansionEnvironment(db);const rows=(await db.query(`SELECT id,workspace_id,actor_membership_id,request_key FROM expansion_command_receipts WHERE environment_id=$1 AND created_at<=clock_timestamp()-interval '365 days' ORDER BY created_at,id LIMIT $2`,[env,limit])).rows;let expired=0;
  for(const row of rows){const hashes=expansionOpaqueHashes([env,row.workspace_id,row.actor_membership_id,row.request_key]);if((await db.query('SELECT turas_expire_expansion_receipt($1,$2,$3::text[]) AS expired',[env,row.id,hashes])).rows[0].expired)expired++;}return expired;
 });
}
export async function runExpansionCleanupTick(limit=100){
 maintenanceLimit(limit);const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 await withTransaction(async db=>{await requireExpansionEnvironment(db);await db.query('SELECT turas_expansion_schedule_retention($1,$2)',[env,limit]);});
 const jobs=await withTransaction(async db=>(await db.query(`WITH due AS (
  SELECT j.id FROM expansion_cleanup_jobs j JOIN expansion_payloads p ON p.id=j.payload_id
  LEFT JOIN expansion_decisions d ON d.id=p.decision_id LEFT JOIN expansion_revisions r ON r.id=COALESCE(p.revision_id,d.revision_id)
  LEFT JOIN expansion_hypotheses h ON h.id=r.record_id LEFT JOIN expansion_owner_events e ON e.id=p.owner_event_id
  LEFT JOIN expansion_account_owners owner ON owner.customer_id=e.customer_id
  WHERE COALESCE(h.environment_id,owner.environment_id)=$1 AND j.deadline<=clock_timestamp()
   AND (j.state='pending' OR j.state='leased' AND j.lease_until<=clock_timestamp())
  ORDER BY j.deadline,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $2)
  UPDATE expansion_cleanup_jobs j SET state='leased',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
  FROM due WHERE j.id=due.id RETURNING j.id,j.payload_id,j.lease_id`,[env,limit])).rows);
 let purged=0;
 for(const job of jobs)if(await withTransaction(async db=>{
  const current=(await db.query('SELECT 1 FROM expansion_cleanup_jobs WHERE id=$1 AND lease_id=$2 AND lease_until>clock_timestamp() FOR UPDATE',[job.id,job.lease_id])).rowCount;
  return !!current&&(await db.query('SELECT turas_expansion_purge($1,$2) AS purged',[env,job.payload_id])).rows[0].purged===true;
 }))purged++;
 return {claimed:jobs.length,purged};
}

/** Settlement records uncertainty without trying another paid dispatch. */
export async function settleDueExpansionAdvice(){return withTransaction(async db=>{
 await requireExpansionEnvironment(db,false,true);
 const env=getServerConfig().TURAS_ENVIRONMENT_ID,disabled=process.env.TURAS_011_DISABLED==='1';
 return (await db.query(`UPDATE expansion_advice_attempts SET
  state=CASE WHEN state IN ('prepared','unconfirmed') THEN 'expired' ELSE 'unconfirmed' END,
  failure_code=CASE WHEN state='unconfirmed' THEN 'advice_expired' WHEN $2 THEN 'feature_disabled' WHEN state='prepared' THEN 'preparation_expired' ELSE 'receipt_unavailable' END,
  settled_at=COALESCE(settled_at,deadline_at,created_at+interval '5 minutes'),updated_at=clock_timestamp()
  WHERE environment_id=$1 AND ((state='prepared' AND ($2 OR created_at<=clock_timestamp()-interval '5 minutes'))
   OR (state='running' AND ($2 OR deadline_at<=clock_timestamp()))
   OR (state='unconfirmed' AND NOT EXISTS(SELECT 1 FROM expansion_advice_payloads p WHERE p.attempt_id=expansion_advice_attempts.id)
    AND EXISTS(SELECT 1 FROM expansion_native_retirement_receipts n WHERE n.attempt_id=expansion_advice_attempts.id AND n.state='done'))) RETURNING id`,[env,disabled])).rowCount??0;
 });}
export async function runExpansionAdviceCleanupTick(limit=100){
 maintenanceLimit(limit);const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 const jobs=await withTransaction(async db=>{
  await requireExpansionEnvironment(db,false,true);
  await db.query(`INSERT INTO expansion_advice_cleanup_jobs(id,attempt_id,request_digest,due_at)
   SELECT gen_random_uuid(),a.id,a.request_digest,LEAST(a.created_at+interval '30 days',COALESCE(r.retired_at+interval '24 hours','infinity'::timestamptz),s.expires_at+interval '24 hours')
   FROM expansion_advice_attempts a JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id LEFT JOIN expansion_advice_retirements r ON r.attempt_id=a.id
   WHERE a.environment_id=$1 AND EXISTS(SELECT 1 FROM expansion_advice_payloads p WHERE p.attempt_id=a.id)
   ON CONFLICT(attempt_id) DO UPDATE SET due_at=LEAST(expansion_advice_cleanup_jobs.due_at,EXCLUDED.due_at)`,[env]);
  return (await db.query(`WITH due AS(SELECT j.id FROM expansion_advice_cleanup_jobs j JOIN expansion_advice_attempts a ON a.id=j.attempt_id
   WHERE a.environment_id=$1 AND j.due_at<=clock_timestamp() AND (j.state='pending' OR j.state='leased' AND j.lease_until<=clock_timestamp())
   ORDER BY j.due_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $2)
   UPDATE expansion_advice_cleanup_jobs j SET state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
   FROM due WHERE j.id=due.id RETURNING j.id,j.lease_token`,[env,limit])).rows;
 });
 let purged=0;for(const job of jobs)if(await withTransaction(async db=>(await db.query('SELECT turas_purge_expansion_advice($1,$2) AS purged',[job.id,job.lease_token])).rows[0].purged))purged++;
 return {claimed:jobs.length,purged};
}

/** Remove native routing/dependency/read detail only after payload purge and reset.
 * Attempt identity remains for saved revision lineage and lifetime key replay fences. */
export async function minimizeExpansionAdviceMetadata(limit=100){
 maintenanceLimit(limit);return withTransaction(async db=>{await requireExpansionEnvironment(db,false,true);
  return Number((await db.query('SELECT turas_minimize_expansion_advice($1,$2) AS minimized',[getServerConfig().TURAS_ENVIRONMENT_ID,limit])).rows[0].minimized);
 });
}
