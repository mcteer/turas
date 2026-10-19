import type {PoolClient} from 'pg';
import {z} from 'zod';
import {hostedLearningBindingSchema} from '../../contracts/pilot-hosted-learning';
import {HttpFailure} from '../../contracts/http';
import {operationalCodeVersion} from '../operations/code-version';
const denied=()=>new HttpFailure(429,'hosted_learning_authority_unavailable','Hosted learning acceptance is unavailable');
export function readHostedLearningConfiguration(){
 const raw=process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON;if(!raw)return null;
 if(Buffer.byteLength(raw)>8192)throw denied();
 try{return hostedLearningBindingSchema.parse(JSON.parse(raw));}catch{throw denied();}
}
/** Consumed in the same transaction as the existing domain provider claim.
 * The owner ticket is a subset of an already-held original local-journal arm. */
async function existingHostedScope(db:PoolClient,reservationId:string){return !!(await db.query(`SELECT 1 FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id
 JOIN operations_hosted_learning_admissions h ON h.workspace_id=a.workspace_id AND h.environment_id=a.environment_id WHERE r.id=$1 LIMIT 1`,[reservationId])).rowCount;}
export async function consumeHostedLearningAdmission(db:PoolClient,reservationId:string){
 const binding=readHostedLearningConfiguration();
 if(!binding){
  if((await db.query("SELECT to_regclass('public.operations_hosted_learning_admissions') AS relation")).rows[0]?.relation&&await existingHostedScope(db,reservationId))throw denied();
  return;
 }
 const row=(await db.query(`SELECT r.*,a.native_request_id,a.response_attempt_id,a.model_steps,a.actor_membership_id,
  b.evaluation_id,b.case_id,b.purpose,a.workspace_id,a.environment_id,c.owner_principal_id,c.eve_session_id,
  customer.synthetic AS customer_synthetic,w.classification,w.pilot_environment_id,w.active AS workspace_active,p.active AS principal_active,p.login_name,
  m.kind,m.role,m.active AS membership_active,q.price_digest
  FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id
  JOIN learning_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
  JOIN workspaces w ON w.id=a.workspace_id JOIN principals p ON p.id=c.owner_principal_id
  JOIN memberships m ON m.id=a.actor_membership_id AND m.principal_id=p.id AND m.workspace_id=w.id
  JOIN customer_references customer ON customer.id=a.customer_id AND customer.workspace_id=w.id
  JOIN learning_budget_accounts q ON q.id=r.budget_id WHERE r.id=$1`,[reservationId])).rows[0];
 if(!row)throw denied();if(row.workspace_id!==binding.workspaceId){if(await existingHostedScope(db,reservationId))throw denied();return;}
 if(row.environment_id!==binding.environmentMarker||row.pilot_environment_id!==binding.environmentMarker
  ||!row.customer_synthetic||row.classification!=='synthetic_pilot'||!row.workspace_active||!row.principal_active||!row.membership_active
  ||row.owner_principal_id!==binding.ownerPrincipalId||row.login_name!=='mcteer'||row.kind!=='internal'||row.role!=='admin'
  ||!['evaluation_baseline','evaluation_candidate'].includes(row.purpose)||Number(row.ordinal)!==1||Number(row.model_steps)!==1
  ||row.native_session_id!==row.eve_session_id||process.env.VERCEL_ENV!==binding.target||process.env.VERCEL_PROJECT_ID!==binding.projectId
  ||operationalCodeVersion()!==binding.sourceCommit||!/^dpl_[A-Za-z0-9]+$/.test(process.env.VERCEL_DEPLOYMENT_ID??'')
  ||Date.now()<Date.parse(binding.recordedAt)||Date.now()>=Date.parse(binding.expiresAt))throw denied();
 const ticket=(await db.query('SELECT * FROM operations_hosted_learning_admissions WHERE learning_attempt_id=$1 AND expires_at>clock_timestamp()',[row.attempt_id])).rows[0];
 if(!ticket||ticket.journal_budget_id!==binding.budgetId||ticket.original_authorization_digest!==binding.originalAuthorizationDigest
  ||Number(ticket.cap_micro_usd)!==binding.capMicroUsd||ticket.environment_id!==binding.environmentMarker||ticket.workspace_id!==binding.workspaceId
  ||ticket.owner_principal_id!==binding.ownerPrincipalId||ticket.actor_membership_id!==row.actor_membership_id
  ||ticket.evaluation_id!==row.evaluation_id||ticket.case_id!==row.case_id||ticket.purpose!==row.purpose
  ||ticket.native_session_id!==row.native_session_id||ticket.native_request_id!==row.native_request_id
  ||ticket.source_commit!==binding.sourceCommit||ticket.source_digest!==binding.sourceDigest||ticket.catalog_digest!==binding.catalogDigest
  ||ticket.deployment_id!==process.env.VERCEL_DEPLOYMENT_ID||ticket.project_id!==binding.projectId||ticket.target!==binding.target
  ||ticket.price_digest!==row.price_digest||ticket.ceiling_micro_usd!==row.ceiling_micro_usd
  ||ticket.expires_at.getTime()>Date.parse(binding.expiresAt))throw denied();
 await db.query(`INSERT INTO operations_hosted_learning_consumptions(journal_dispatch_id,reservation_id,response_attempt_id,native_turn_id)
  VALUES($1,$2,$3,$4)`,[ticket.journal_dispatch_id,reservationId,row.response_attempt_id,row.native_turn_id]);
}
/** Capture before finish/tool/error handling. Ordinary learning has no hosted
 * consumption and keeps its existing accounting; it cannot mint these tickets. */
export async function rememberHostedLearningIdentity(db:PoolClient,reservationId:string,kind:'provider_response'|'gateway_generation',value:unknown){
 if(!process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON)return;
 const consumed=(await db.query('SELECT 1 FROM operations_hosted_learning_consumptions WHERE reservation_id=$1',[reservationId])).rowCount;
 if(!consumed)return;
 const key=(kind==='gateway_generation'?z.string().regex(/^gen_[A-Za-z0-9_-]{1,240}$/):z.string().min(1).max(256)).parse(value);
 await db.query('INSERT INTO operations_hosted_learning_provider_identities(reservation_id,identity_kind,provider_key) VALUES($1,$2,$3) ON CONFLICT(reservation_id,identity_kind) DO NOTHING',[reservationId,kind,key]);
 const existing=(await db.query('SELECT provider_key FROM operations_hosted_learning_provider_identities WHERE reservation_id=$1 AND identity_kind=$2',[reservationId,kind])).rows[0];
 if(existing?.provider_key!==key)throw denied();
}
