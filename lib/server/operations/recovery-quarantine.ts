import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
export const requiredRecoveryQuarantineScopes=Object.freeze(['sessions','mcp','grants','sources','publications','external-effects','workflow'] as const);
/** No independently current authority is available. Preserve captured factual
 * histories, revoke restored credentials/partner grants, and retain a global
 * service fence. This is restricted recovery, never full readiness or unlock. */
export async function quarantineRestoredAuthority(db:Client|PoolClient,raw:z.infer<typeof scopeSchema>){
 const scope=scopeSchema.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Authority quarantine requires actual owner');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==79)throw Error('Authority quarantine marker differs');
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR UPDATE',[scope.environmentId])).rows[0];
  if(control?.mode!=='locked'||Number(control.revision)!==scope.controlRevision||control.recovery_id!==scope.recoveryId)throw Error('Exact locked authority quarantine required');
  for(const kind of requiredRecoveryQuarantineScopes){await db.query("INSERT INTO operations_recovery_quarantines(environment_id,recovery_id,control_revision,scope_kind,reason) VALUES($1,$2,$3,$4,'current_proof_unavailable') ON CONFLICT(environment_id,recovery_id,scope_kind) DO NOTHING",[scope.environmentId,scope.recoveryId,scope.controlRevision,kind]);}
  const quarantines=(await db.query('SELECT scope_kind,control_revision FROM operations_recovery_quarantines WHERE environment_id=$1 AND recovery_id=$2 ORDER BY scope_kind',[scope.environmentId,scope.recoveryId])).rows;
  if(quarantines.length!==requiredRecoveryQuarantineScopes.length||quarantines.some(row=>Number(row.control_revision)!==scope.controlRevision||!requiredRecoveryQuarantineScopes.includes(row.scope_kind)))throw Error('Exact durable quarantine scope differs');
  // A charge made after capture can be absent from a restored budget ledger.
  // Retire every captured service authority, including apparently unused caps.
  const serviceBudgets=await db.query("UPDATE operations_cost_budgets SET state='revoked' WHERE environment_id=$1 AND state='active'",[scope.environmentId]);
  // Record typed unknown effects without manufacturing settlement or borrowing
  // a learning reservation identity. Retire the original scope permanently.
  const ordinaryHolds=await db.query(`INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,ceiling_tokens,evidence_digest,evidence_digest_kind,source_captured_at,recovery_id,control_revision)
   SELECT $1,'ordinary_tokens',o.id,o.conversation_id,o.ceiling_tokens,encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex'),'operation_row',clock_timestamp(),$2,$3
   FROM ordinary_model_operations o JOIN conversations c ON c.id=o.conversation_id WHERE c.environment_id=$1 AND o.settled_at IS NULL
   ON CONFLICT(environment_id,operation_kind,operation_id) DO NOTHING`,[scope.environmentId,scope.recoveryId,scope.controlRevision]);
  const parityHolds=await db.query(`INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,ceiling_micro_usd,evidence_digest,evidence_digest_kind,source_captured_at,recovery_id,control_revision)
   SELECT $1,'parity_dollars',o.id,o.budget_id,o.ceiling_micro_usd,encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex'),'operation_row',clock_timestamp(),$2,$3
   FROM parity_evaluation_operations o JOIN parity_evaluation_budgets b ON b.id=o.budget_id WHERE b.environment_id=$1 AND o.settled_at IS NULL
   ON CONFLICT(environment_id,operation_kind,operation_id) DO NOTHING`,[scope.environmentId,scope.recoveryId,scope.controlRevision]);
  await db.query("UPDATE parity_evaluation_budgets SET state='closed' WHERE environment_id=$1 AND state='open'",[scope.environmentId]);
  const learningHolds=await db.query(`INSERT INTO operations_recovery_paid_holds(reservation_id,environment_id,recovery_id,control_revision)
   SELECT r.id,$1,$2,$3 FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id
   WHERE a.environment_id=$1 AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM learning_reservation_releases x WHERE x.reservation_id=r.id)
   ON CONFLICT(reservation_id) DO NOTHING`,[scope.environmentId,scope.recoveryId,scope.controlRevision]);
  await db.query("UPDATE learning_budget_accounts SET state='blocked',version=version+1 WHERE environment_id=$1 AND state='open'",[scope.environmentId]);
  await db.query("UPDATE learning_attempts SET state='unconfirmed',failure_code='recovery_current_proof_unavailable',version=version+1 WHERE environment_id=$1 AND state IN('prepared','admitted','running')",[scope.environmentId]);
  // A restored prepared/queued state may precede an effect that happened after
  // capture. Stop every old admission without inventing dispatch or settlement.
  const researchRequests=await db.query("UPDATE research_requests SET state='cancelled',revision_number=revision_number+1,updated_at=clock_timestamp() WHERE environment_id=$1 AND state IN('draft','admitted')",[scope.environmentId]);
  const researchRuns=await db.query("UPDATE research_runs SET state='unconfirmed',safe_reason_code='recovery_current_proof_unavailable',updated_at=clock_timestamp() WHERE environment_id=$1 AND state IN('queued','running')",[scope.environmentId]);
  let advisoryAttempts=0;
  for(const table of ['staffing_advisory_attempts','execution_advice_attempts','support_advice_attempts','expansion_advice_attempts']){
   const changed=await db.query(`UPDATE ${table} SET state='unconfirmed',failure_code='recovery_current_proof_unavailable',updated_at=clock_timestamp() WHERE environment_id=$1 AND state IN('prepared','running')`,[scope.environmentId]);advisoryAttempts+=changed.rowCount??0;
  }
  const schedules=await db.query("UPDATE report_schedules SET state='paused',version=version+1 WHERE environment_id=$1 AND state='active'",[scope.environmentId]);
  const sessions=await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL');
  // Credential removal is permanent under the existing MCP identity trigger.
  // Do not invent a human revoker membership for an owner recovery operation.
  const mcp=await db.query('UPDATE mcp_connections SET credential_hash=NULL WHERE environment_id=$1 AND credential_hash IS NOT NULL',[scope.environmentId]);
  const grants=await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1,changed_at=clock_timestamp() WHERE state='active' RETURNING customer_id");
  if(grants.rows.length)await db.query('UPDATE customer_profile_state SET delivery_generation=delivery_generation+1,updated_at=clock_timestamp() WHERE customer_id=ANY($1::uuid[])',[[...new Set(grants.rows.map(row=>row.customer_id))]]);
  // An actually dispatched but unreconciled charge cannot become retry authority.
  // Settled charges and their permanent reconciliation receipts remain intact.
  const paid=await db.query("UPDATE operations_cost_reservations r SET state='unknown' FROM operations_cost_budgets b WHERE r.budget_id=b.id AND b.environment_id=$1 AND r.state='dispatched'",[scope.environmentId]);
  // Preserve dispatch identities and results. An interrupted native turn is not
  // evidence that its provider did no work, and must never become retryable.
  const native=await db.query("UPDATE response_attempts a SET dispatch_state=CASE WHEN a.dispatch_state IN('dispatching','admitted','uncertain') THEN 'uncertain' ELSE a.dispatch_state END,response_state='failed',last_error_code='recovery_current_proof_unavailable',revision=a.revision+1,updated_at=clock_timestamp() FROM conversations c WHERE a.conversation_id=c.id AND c.environment_id=$1 AND a.response_state IN('pending','running','stopping','waiting_input') RETURNING a.id",[scope.environmentId]);
  if(native.rows.length)await db.query("UPDATE watchdog_jobs SET state='needs_attention',lease_owner=NULL,lease_expires_at=NULL,last_error_code='recovery_current_proof_unavailable',updated_at=clock_timestamp() WHERE attempt_id=ANY($1::uuid[])",[native.rows.map(row=>row.id)]);
  const sends=await db.query("UPDATE report_deliveries SET state='uncertain',next_attempt_at=NULL,lease_token=NULL,lease_until=NULL,failure_code=CASE WHEN audit_expired_at IS NULL THEN 'recovery_current_proof_unavailable' ELSE NULL END,version=version+1 WHERE environment_id=$1 AND state IN('authorized','queued','retryable_failure','dispatching')",[scope.environmentId]);
  await db.query('COMMIT');
  return {version:'pilot-authority-quarantine-v1' as const,...scope,mode:'locked' as const,newlyRevokedSessions:sessions.rowCount??0,newlyRevokedMcpConnections:mcp.rowCount??0,newlyRevokedGrants:grants.rowCount??0,
   newlyCancelledResearchRequests:researchRequests.rowCount??0,newlyInterruptedResearchRuns:researchRuns.rowCount??0,newlyInterruptedAdvisoryAttempts:advisoryAttempts,newlyPausedReportSchedules:schedules.rowCount??0,
   newlyHeldOrdinaryOperations:ordinaryHolds.rowCount??0,newlyHeldParityOperations:parityHolds.rowCount??0,newlyHeldLearningReservations:learningHolds.rowCount??0,newlyRevokedServiceBudgets:serviceBudgets.rowCount??0,newlyHeldPaidReservations:paid.rowCount??0,newlyInterruptedNativeAttempts:native.rowCount??0,newlyHeldReportDeliveries:sends.rowCount??0,quarantinedScopes:quarantines.map(row=>row.scope_kind),capturedHistoriesRetained:true,allRequiredScopesQuarantined:true,currentAuthorityVerified:false,permanentReplayProofAvailable:false,restorationReady:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
