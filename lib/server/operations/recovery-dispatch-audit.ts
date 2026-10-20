import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {recoveryLeasesOutstanding} from './recovery-drain';
import {auditRecoveryEffectGuards} from './recovery-effect-guards';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Current database dispatch state only. Provider-side work, original financial
 * exposure, permanent identities and ingress require their independent proofs. */
export async function auditRecoveryDispatchState(db:Client,target:LockedWorkRecoveryTarget){
 const guards=await auditRecoveryEffectGuards(db,target);
 const checks=[
  ['native',`SELECT 1 FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 AND (a.response_state IN('pending','running','stopping','waiting_input') OR a.dispatch_state IN('admitted','dispatching'))`],
  ['watchdogs',`SELECT 1 FROM watchdog_jobs j JOIN response_attempts a ON a.id=j.attempt_id JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 AND (j.state NOT IN('settled','needs_attention') OR j.lease_owner IS NOT NULL OR j.lease_expires_at IS NOT NULL)`],
  ['sends',`SELECT 1 FROM report_deliveries WHERE environment_id=$1 AND (state IN('authorized','queued','retryable_failure','dispatching') OR next_attempt_at IS NOT NULL OR lease_token IS NOT NULL OR lease_until IS NOT NULL)`],
  ['schedules',`SELECT 1 FROM report_schedules WHERE environment_id=$1 AND state='active'`],
  ['research-requests',`SELECT 1 FROM research_requests WHERE environment_id=$1 AND state IN('draft','admitted')`],
  ['research-runs',`SELECT 1 FROM research_runs WHERE environment_id=$1 AND state IN('queued','running')`],
  ...['plan_drafting_attempts','staffing_advisory_attempts','execution_advice_attempts','support_advice_attempts','expansion_advice_attempts','learning_attempts'].map(table=>[table,`SELECT 1 FROM ${table} WHERE environment_id=$1 AND state IN('prepared','admitted','running')`]),
  ['artifact-processing',`SELECT 1 FROM artifact_extraction_runs WHERE environment_id=$1 AND state IN('queued','leased')`],
  ['workforce-processing',`SELECT 1 FROM workforce_import_jobs WHERE environment_id=$1 AND state IN('queued','running')`],
  ['report-rendering',`SELECT 1 FROM report_jobs WHERE environment_id=$1 AND kind='render' AND state IN('queued','leased')`],
  ['gap-processing',`SELECT 1 FROM gap_report_jobs WHERE environment_id=$1 AND state IN('queued','running')`],
  ['retrieval-indexing',`SELECT 1 FROM retrieval_jobs WHERE environment_id=$1 AND kind='index' AND state IN('queued','leased')`],
  ['learning-budgets',`SELECT 1 FROM learning_budget_accounts WHERE environment_id=$1 AND state='open'`],
  ['service-budgets',`SELECT 1 FROM operations_cost_budgets WHERE environment_id=$1 AND state='active'`],
  ['service-reservations',`SELECT 1 FROM operations_cost_reservations r JOIN operations_cost_budgets b ON b.id=r.budget_id WHERE b.environment_id=$1 AND r.state='dispatched'`],
  ['hosted-jobs',`SELECT 1 FROM operations_hosted_jobs WHERE environment_id=$1 AND state IN('admitted','starting','running','reconciling')`],
  ['local-jobs',`SELECT 1 FROM operations_local_jobs WHERE environment_id=$1 AND state IN('running','reconciling')`],
 ];
 const observed=[];
 for(const [name,query] of checks){const result=await db.query('SELECT EXISTS('+query+') AS dispatchable',[target.environmentId]);if(result.rows[0]?.dispatchable!==false)throw Error('Recovery database effect remains dispatchable: '+name);observed.push(name);}
 if(await recoveryLeasesOutstanding(db))throw Error('Recovery database effect lease remains active');
 return Object.freeze({contract:'pilot-recovery-dispatch-audit-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,guardDigest:guards.guardDigest,dispatchStateDigest:recoveryDigest({state:guards.currentStateDigest,checks:observed}),checks:observed.length,currentDatabaseDispatchClosed:true as const,providerExecutionClosed:false as const,originalPaidExposureVerified:false as const,cronAdmissionClosed:false as const,restorationReady:false as const});
}
