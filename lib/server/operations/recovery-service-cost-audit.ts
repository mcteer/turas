import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {auditRecoveryEffectGuards} from './recovery-effect-guards';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Original operational service cost accounting, including uncertain effects.
 * Does not settle them or prove the associated compute stopped. */
export async function auditRecoveryServiceCosts(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId),guards=await auditRecoveryEffectGuards(db,target);
 const budgets=(await db.query('SELECT to_jsonb(b) AS value FROM operations_cost_budgets b WHERE environment_id=$1 ORDER BY id LIMIT 10001',[target.environmentId])).rows.map(row=>row.value);
 const reservations=(await db.query('SELECT to_jsonb(r) AS value FROM operations_cost_reservations r JOIN operations_cost_budgets b ON b.id=r.budget_id WHERE b.environment_id=$1 ORDER BY r.id LIMIT 10001',[target.environmentId])).rows.map(row=>row.value);
 const reconciliations=(await db.query('SELECT r.reservation_id,r.charged_micro_usd,r.charge_kind,encode(sha256(convert_to(to_jsonb(r)::text,\'UTF8\')),\'hex\') AS digest FROM operations_cost_reconciliations r JOIN operations_cost_reservations c ON c.id=r.reservation_id JOIN operations_cost_budgets b ON b.id=c.budget_id WHERE b.environment_id=$1 ORDER BY r.reservation_id LIMIT 10001',[target.environmentId])).rows;
 if([budgets,reservations,reconciliations].some(rows=>rows.length>10000))throw Error('Service accounting inventory bound exceeded');
 const capturedBudgets=source.snapshot.tables.find(table=>table.name==='operations_cost_budgets')!.rows,capturedReservations=source.snapshot.tables.find(table=>table.name==='operations_cost_reservations')!.rows;
 if(budgets.length!==capturedBudgets.length||reservations.length!==capturedReservations.length)throw Error('Complete original service accounting inventory differs');
 for(const row of capturedBudgets){
  const actual=budgets.find(budget=>budget.id===row.identity.id);
  if(!actual||actual.state!=='revoked'||['category','authorization_digest','scope_digest','pricing_digest','cap_micro_usd','created_at','expires_at'].some(key=>!(key in row.status)||String(actual[key])!==String(row.status[key])))throw Error('Original service budget identity ceiling or retirement differs');
 }
 for(const row of capturedReservations){
  const actual=reservations.find(reservation=>reservation.id===row.identity.id);
  if(!actual||['budget_id','operation_digest','upper_bound_micro_usd','job_id','created_at','dispatched_at','charged_micro_usd','charge_kind'].some(key=>!(key in row.status)||String(actual[key])!==String(row.status[key]))||actual.state!==(row.status.state==='dispatched'?'unknown':row.status.state))throw Error('Original service reservation exposure or provider identity differs');
  if(actual.state==='settled'&&!reconciliations.some(receipt=>receipt.reservation_id===actual.id&&String(receipt.charged_micro_usd)===String(actual.charged_micro_usd)&&receipt.charge_kind===actual.charge_kind))throw Error('Exact service settlement receipt missing');
 }
 const capturedReceipts=source.snapshot.tables.find(table=>table.name==='operations_cost_reconciliations')!.rows;
 if(reconciliations.length!==capturedReceipts.length||capturedReceipts.some(row=>!reconciliations.some(actual=>actual.reservation_id===row.identity.reservation_id&&actual.digest===row.rowDigest)))throw Error('Original immutable service settlement evidence differs');
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-service-cost-audit-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,guardDigest:guards.guardDigest,budgets:budgets.length,reservations:reservations.length,receipts:reconciliations.length,accountingDigest:recoveryDigest({budgets,reservations,reconciliations}),originalServiceCostAccountingVerified:true as const,providerExecutionClosed:false as const,allPaidEffectsVerified:false as const,restorationReady:false as const});
}
