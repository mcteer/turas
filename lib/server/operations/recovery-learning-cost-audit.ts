import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {learningHash} from '../learning/repository';
import {auditRecoveryEffectGuards} from './recovery-effect-guards';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Preserve original learning journal and permanently held unknown reservations.
 * Captured settlements remain evidence, never synthesized during this audit. */
export async function auditRecoveryLearningCosts(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId),guards=await auditRecoveryEffectGuards(db,target);
 const budgets=(await db.query('SELECT to_jsonb(b) AS value FROM learning_budget_accounts b WHERE environment_id=$1 ORDER BY id LIMIT 10001',[target.environmentId])).rows.map(row=>row.value);
 const originalBudgets=source.snapshot.tables.find(table=>table.name==='learning_budget_accounts')!.rows;
 if(budgets.length>10000||budgets.length!==originalBudgets.length)throw Error('Complete original learning budget inventory differs');
 for(const row of originalBudgets){
  const actual=budgets.find(budget=>budget.id===row.identity.id);
  if(!actual||!['blocked','closed'].includes(actual.state)||['workspace_id','actor_membership_id','limit_micro_usd','price_digest','created_at'].some(key=>!(key in row.status)||String(actual[key])!==String(row.status[key]))||learningHash(actual.price_contract)!==actual.price_digest)throw Error('Original learning budget identity ceiling pricing or retirement differs');
 }
 const tables=[
  {name:'learning_budget_reservations',key:'id',join:'JOIN learning_budget_accounts b ON b.id=r.budget_id'},
  ...['learning_budget_settlements','learning_model_dispatches','learning_reservation_releases'].map(name=>({name,key:name==='learning_budget_settlements'?'id':'reservation_id',join:'JOIN learning_budget_reservations reservation ON reservation.id=r.reservation_id JOIN learning_budget_accounts b ON b.id=reservation.budget_id'})),
 ];
 const journal=[];
 for(const table of tables){
  const actual=(await db.query(`SELECT r.${table.key} AS key,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS digest FROM ${table.name} r ${table.join} WHERE b.environment_id=$1 ORDER BY r.${table.key} LIMIT 10001`,[target.environmentId])).rows;
  const original=source.snapshot.tables.find(entry=>entry.name===table.name)!.rows;
  if(actual.length>10000||actual.length!==original.length||original.some(row=>!actual.some(value=>value.key===row.identity[table.key]&&value.digest===row.rowDigest)))throw Error('Original immutable learning accounting differs: '+table.name);
  journal.push({table:table.name,rows:actual});
 }
 const unknown=(await db.query(`SELECT r.id,h.reservation_id AS hold FROM learning_budget_reservations r JOIN learning_budget_accounts b ON b.id=r.budget_id LEFT JOIN operations_recovery_paid_holds h ON h.reservation_id=r.id AND h.environment_id=b.environment_id
 WHERE b.environment_id=$1 AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id) AND NOT EXISTS(SELECT 1 FROM learning_reservation_releases released WHERE released.reservation_id=r.id) ORDER BY r.id LIMIT 10001`,[target.environmentId])).rows;
 if(unknown.length>10000||unknown.some(row=>row.hold!==row.id))throw Error('Original unknown learning reservation lacks immutable hold');
 const holds=(await db.query(`SELECT h.reservation_id,encode(sha256(convert_to(to_jsonb(h)::text,'UTF8')),'hex') AS digest FROM operations_recovery_paid_holds h WHERE h.environment_id=$1 ORDER BY h.reservation_id LIMIT 10001`,[target.environmentId])).rows;
 const originalHolds=source.snapshot.tables.find(table=>table.name==='operations_recovery_paid_holds')!.rows;
 if(holds.length>10000||originalHolds.some(row=>!holds.some(actual=>actual.reservation_id===row.identity.reservation_id&&actual.digest===row.rowDigest)))throw Error('Original learning recovery hold changed');
 if((await db.query(`SELECT 1 FROM operations_recovery_paid_holds h JOIN learning_reservation_releases r ON r.reservation_id=h.reservation_id WHERE h.environment_id=$1 LIMIT 1`,[target.environmentId])).rows.length)throw Error('Held learning reservation was refunded');
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-learning-cost-audit-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,guardDigest:guards.guardDigest,budgets:budgets.length,unknownReservationsHeld:unknown.length,journalDigest:recoveryDigest({budgets,journal,holds}),originalLearningCostAccountingVerified:true as const,providerExecutionClosed:false as const,allPaidEffectsVerified:false as const,restorationReady:false as const});
}
