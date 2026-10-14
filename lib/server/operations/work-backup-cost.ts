import type {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {admitCost,costBudgetSchema,type CostReservation} from '../../contracts/pilot-cost';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const workBackupCostBindingSchema=z.strictObject({installationId:z.uuid(),environmentId:z.string().min(1).max(256),scopeDigest:digest,pricingDigest:digest,hostingBudgetId:z.uuid(),blobBudgetId:z.uuid(),hostingCeilingMicroUsd:z.number().int().positive().max(1000000000),blobCeilingMicroUsd:z.number().int().positive().max(1000000000)});
export type WorkBackupCostBinding=z.infer<typeof workBackupCostBindingSchema>;
export const workBackupCostReviewSchema=z.strictObject({contract:z.literal('pilot-work-backup-cost-review-v1'),installationId:z.uuid(),environmentId:z.string().min(1).max(256),reservationIds:z.tuple([z.uuid(),z.uuid()]),operationDigest:digest,chargeEvidenceDigest:digest,operatorReviewDigest:digest}).refine(value=>value.reservationIds[0]!==value.reservationIds[1],'Distinct exact category reservations required');
/** Explicit owner-reviewed full ceilings. No invented invoice, unused release,
 * changed budget or automatic recovery of an unknown operation is permitted. */
export async function reviewWorkBackupCost(db:Client,raw:unknown){
 const input=workBackupCostReviewSchema.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[input.installationId]);
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.cost_reconciliations'::regclass")).rows[0]?.owner!==true)throw Error('Actual independent work review owner required');
  const rows=(await db.query('SELECT r.*,b.installation_id,b.environment_id,b.category FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR UPDATE OF r',[input.reservationIds])).rows;
  if(rows.length!==2||new Set(rows.map(row=>row.category)).size!==2||rows.some(row=>row.installation_id!==input.installationId||row.environment_id!==input.environmentId||row.operation_digest!==input.operationDigest))throw Error('Exact work cost review scope differs');
  let replayed=true;
  for(const row of rows){
   const previous=(await db.query('SELECT * FROM turas_backup.cost_reconciliations WHERE reservation_id=$1 FOR SHARE',[row.id])).rows[0];
   if(previous){if(row.state!=='settled'||previous.installation_id!==input.installationId||previous.environment_id!==input.environmentId||previous.operation_digest!==input.operationDigest||previous.charge_evidence_digest!==input.chargeEvidenceDigest||previous.operator_review_digest!==input.operatorReviewDigest||Number(previous.charged_micro_usd)!==Number(row.upper_bound_micro_usd)||row.charge_kind!=='estimate'||Number(row.charged_micro_usd)!==Number(row.upper_bound_micro_usd))throw Error('Immutable work cost review replay differs');continue;}
   if(row.state!=='unknown')throw Error('Exact unknown work cost review required');replayed=false;
   await db.query("INSERT INTO turas_backup.cost_reconciliations(id,reservation_id,installation_id,environment_id,operation_digest,charged_micro_usd,charge_kind,charge_evidence_digest,operator_review_digest) VALUES($1,$2,$3,$4,$5,$6,'estimate',$7,$8)",[randomUUID(),row.id,input.installationId,input.environmentId,input.operationDigest,row.upper_bound_micro_usd,input.chargeEvidenceDigest,input.operatorReviewDigest]);
   await db.query("UPDATE turas_backup.cost_reservations SET state='settled',charged_micro_usd=upper_bound_micro_usd,charge_kind='estimate' WHERE id=$1",[row.id]);
  }
  await db.query('COMMIT');return {contract:'pilot-work-cost-review-receipt-v1' as const,installationId:input.installationId,environmentId:input.environmentId,reservationIds:input.reservationIds,chargedMicroUsd:rows.reduce((sum,row)=>sum+Number(row.upper_bound_micro_usd),0),chargeKind:'estimate' as const,replayed,actualInvoiceVerified:false,providerDispatched:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
export const workBackupCostAuthoritySchema=z.strictObject({contract:z.literal('pilot-work-backup-cost-authority-v1'),installationId:z.uuid(),authorizationCapMicroUsd:z.number().int().positive().max(1000000000),budgets:z.tuple([costBudgetSchema,costBudgetSchema])}).superRefine((value,ctx)=>{
 const [hosting,blob]=value.budgets;
 if(hosting.category!=='hosting'||blob.category!=='blob'||hosting.id===blob.id||hosting.environmentId!==blob.environmentId||hosting.authorizationDigest!==blob.authorizationDigest||hosting.scopeDigest!==blob.scopeDigest||hosting.pricingDigest!==blob.pricingDigest||hosting.expiresAt!==blob.expiresAt||hosting.capMicroUsd+blob.capMicroUsd>value.authorizationCapMicroUsd)ctx.addIssue({code:'custom',message:'One applicable work authorization with bounded category allocations required'});
});
/** Explicit protected operator provisioning only. A replay cannot reset spend,
 * create a replacement budget for the same authorization, or expand its cap. */
export async function provisionWorkBackupCostAuthority(db:Client,raw:unknown){
 const input=workBackupCostAuthoritySchema.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[input.installationId]);
  const installation=(await db.query("SELECT installation_id,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.cost_budgets'::regclass)) AS owner,clock_timestamp() AS now FROM turas_backup.contract")).rows;
  if(installation.length!==1||installation[0].installation_id!==input.installationId||installation[0].owner!==true)throw Error('Exact independent work cost installation owner required');
  let replayed=true;
  for(const budget of input.budgets){
   if(Date.parse(budget.expiresAt)<=installation[0].now.getTime())throw Error('Fresh applicable work cost authorization required');
   const inserted=await db.query('INSERT INTO turas_backup.cost_budgets(id,installation_id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id',[budget.id,input.installationId,budget.environmentId,budget.category,budget.authorizationDigest,budget.scopeDigest,budget.pricingDigest,budget.capMicroUsd,budget.expiresAt]);
   if(inserted.rowCount)replayed=false;
   const row=(await db.query('SELECT * FROM turas_backup.cost_budgets WHERE authorization_digest=$1 AND category=$2 FOR SHARE',[budget.authorizationDigest,budget.category])).rows[0];
   if(!row||row.id!==budget.id||row.installation_id!==input.installationId||row.environment_id!==budget.environmentId||row.scope_digest!==budget.scopeDigest||row.pricing_digest!==budget.pricingDigest||Number(row.cap_micro_usd)!==budget.capMicroUsd||row.expires_at.toISOString()!==new Date(budget.expiresAt).toISOString())throw Error('Work authorization replay differs; retained budget cannot reset');
  }
  await db.query('COMMIT');return {contract:'pilot-work-cost-provision-v1' as const,installationId:input.installationId,budgetIds:input.budgets.map(row=>row.id),allocatedMicroUsd:input.budgets.reduce((sum,row)=>sum+row.capMicroUsd,0),replayed,providerDispatched:false,releaseApproved:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Independent owner-provisioned hosting/Blob authority. Registry or Sandbox
 * authorizations cannot admit a backup, and one unknown dispatch holds both. */
export async function reserveWorkBackupCost(db:Client,raw:WorkBackupCostBinding,operationDigest:string){
 const binding=workBackupCostBindingSchema.parse(raw);digest.parse(operationDigest);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[binding.installationId]);
  const owner=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.cost_budgets'::regclass")).rows[0]?.owner;
  if(owner!==true)throw Error('Independent work cost owner required');
  if((await db.query("SELECT 1 FROM pg_trigger WHERE tgrelid='turas_backup.cost_reservations'::regclass AND tgname='unknown_cost_review_fence' AND tgenabled='O' AND tgfoid='turas_backup.unknown_cost_review_fence'::regproc")).rowCount!==1)throw Error('Actual immutable work cost review guard required');
  if((await db.query('SELECT 1 FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id WHERE b.installation_id=$1 AND r.operation_digest=$2 LIMIT 1',[binding.installationId,operationDigest])).rowCount)throw Error('Work backup slot already admitted; no automatic retry');
  if((await db.query("SELECT 1 FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id WHERE b.installation_id=$1 AND r.state IN('reserved','dispatched','unknown') LIMIT 1",[binding.installationId])).rowCount)throw Error('Work cost reconciliation holds admission');
  const reservations:string[]=[];
  for(const [category,id,ceiling] of [['hosting',binding.hostingBudgetId,binding.hostingCeilingMicroUsd],['blob',binding.blobBudgetId,binding.blobCeilingMicroUsd]] as const){
   const row=(await db.query('SELECT *,clock_timestamp() AS now FROM turas_backup.cost_budgets WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row||row.installation_id!==binding.installationId||row.environment_id!==binding.environmentId||row.category!==category)throw Error('Applicable work cost authority unavailable');
   const budget=costBudgetSchema.parse({contract:'pilot-cost-v1',id:row.id,environmentId:row.environment_id,category:row.category,authorizationDigest:row.authorization_digest,scopeDigest:row.scope_digest,pricingDigest:row.pricing_digest,capMicroUsd:Number(row.cap_micro_usd),expiresAt:row.expires_at.toISOString()});
   const previous=(await db.query('SELECT * FROM turas_backup.cost_reservations WHERE budget_id=$1 ORDER BY id',[id])).rows;
   const mapped:CostReservation[]=previous.map(r=>({id:r.id,budgetId:r.budget_id,operationDigest:r.operation_digest,upperBoundMicroUsd:Number(r.upper_bound_micro_usd),state:r.state,chargedMicroUsd:r.charged_micro_usd===null?null:Number(r.charged_micro_usd),chargeKind:r.charge_kind}));
   if(previous.some(r=>r.operation_digest===operationDigest))throw Error('Work backup slot already admitted; no automatic retry');
   admitCost({budget,reservations:mapped,category,scopeDigest:binding.scopeDigest,pricingDigest:binding.pricingDigest,upperBoundMicroUsd:ceiling,now:row.now.getTime()});
   const reservation=randomUUID();await db.query("INSERT INTO turas_backup.cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd,state) VALUES($1,$2,$3,$4,'reserved')",[reservation,id,operationDigest,ceiling]);reservations.push(reservation);
  }
  await db.query('COMMIT');return reservations;
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Retain the complete published upper bound as an estimate only when the
 * bounded operation ended conclusively. Uncertain dispatch/cleanup stays held. */
export async function transitionWorkBackupCost(db:Client,binding:WorkBackupCostBinding,reservations:readonly string[],state:'dispatched'|'unknown'|'settled'|'released'){
 workBackupCostBindingSchema.parse(binding);if(reservations.length!==2||new Set(reservations).size!==2)throw Error('Exact work backup reservations required');for(const id of reservations)z.uuid().parse(id);
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[binding.installationId]);
  const owner=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.cost_reservations'::regclass")).rows[0]?.owner;if(owner!==true)throw Error('Independent work cost owner required');
  const rows=(await db.query('SELECT r.*,b.installation_id,b.environment_id,b.category,b.scope_digest,b.pricing_digest,b.expires_at,clock_timestamp() AS now FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR UPDATE OF r',[reservations])).rows;
  if(rows.length!==2||rows.some(row=>row.installation_id!==binding.installationId||row.environment_id!==binding.environmentId||row.scope_digest!==binding.scopeDigest||row.pricing_digest!==binding.pricingDigest)||new Set(rows.map(row=>row.budget_id)).size!==2||new Set(rows.map(row=>row.operation_digest)).size!==1||rows.some(row=>row.budget_id===binding.hostingBudgetId?(row.category!=='hosting'||Number(row.upper_bound_micro_usd)!==binding.hostingCeilingMicroUsd):(row.budget_id!==binding.blobBudgetId||row.category!=='blob'||Number(row.upper_bound_micro_usd)!==binding.blobCeilingMicroUsd)))throw Error('Work reservation scope differs');
  if(state==='dispatched'){
   if(rows.some(row=>row.expires_at<=row.now))throw Error('Work cost authority expired before dispatch');
   if((await db.query("SELECT 1 FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id WHERE b.installation_id=$1 AND r.id<>ALL($2::uuid[]) AND r.state IN('reserved','dispatched','unknown') LIMIT 1",[binding.installationId,reservations])).rowCount)throw Error('Concurrent work cost admission held');
  }
  for(const row of rows){await db.query(state==='settled'?"UPDATE turas_backup.cost_reservations SET state='settled',charged_micro_usd=upper_bound_micro_usd,charge_kind='estimate' WHERE id=$1":"UPDATE turas_backup.cost_reservations SET state=$2 WHERE id=$1",state==='settled'?[row.id]:[row.id,state]);}
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}
