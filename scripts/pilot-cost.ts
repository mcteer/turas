import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {Client,type PoolClient} from 'pg';
import {z} from 'zod';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {costBudgetSchema,costReservationSchema,microUsd,remainingCost} from '../lib/contracts/pilot-cost';
import {operatorRecoveryDatabase} from './pilot-control';
import {createEvidenceDirectory,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';
import {pilotSource} from './pilot-source';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const pilotCostCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({contract:z.literal('pilot-cost-operation-v1'),action:z.literal('status'),budgetId:z.uuid()}),
 z.strictObject({contract:z.literal('pilot-cost-operation-v1'),action:z.literal('provision'),budget:costBudgetSchema}),
 z.strictObject({contract:z.literal('pilot-cost-operation-v1'),action:z.literal('reconcile'),budgetId:z.uuid(),reservationId:z.uuid(),operationDigest:digest,expectedState:z.enum(['dispatched','unknown']),chargedMicroUsd:microUsd,chargeKind:z.enum(['actual','estimate']),chargeEvidenceDigest:digest,operatorReviewDigest:digest}),
]);
/** Explicit owner accounting only. No service creation, send, model invocation,
 * budget expansion, reservation retry, or release of dispatched work exists here. */
export async function recordPilotCost(db:Client|PoolClient,environmentId:string,raw:unknown){
 const input=pilotCostCommandSchema.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL transaction_timeout='15s'");await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
  const authority=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_cost_budgets'::regclass")).rows[0];
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(!authority?.owner||marker.length!==1||marker[0].environment_id!==environmentId||marker[0].schema_version!==CURRENT_SCHEMA_VERSION)throw Error('Exact cost owner/schema/environment required');
  const budgetId=input.action==='provision'?input.budget.id:input.budgetId;
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[budgetId]);
  let replayed=false;
  if(input.action==='provision'){
   const b=input.budget;if(b.environmentId!==environmentId)throw Error('Cost target differs');
   const inserted=await db.query('INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id',[b.id,b.environmentId,b.category,b.authorizationDigest,b.scopeDigest,b.pricingDigest,b.capMicroUsd,b.expiresAt]);replayed=inserted.rowCount===0;
  }
  const row=(await db.query('SELECT * FROM operations_cost_budgets WHERE id=$1 AND environment_id=$2 FOR UPDATE',[budgetId,environmentId])).rows[0];if(!row)throw Error('Applicable cost budget unavailable');
  const budget=costBudgetSchema.parse({contract:'pilot-cost-v1',id:row.id,environmentId:row.environment_id,category:row.category,authorizationDigest:row.authorization_digest,scopeDigest:row.scope_digest,pricingDigest:row.pricing_digest,capMicroUsd:Number(row.cap_micro_usd),expiresAt:row.expires_at.toISOString()});
  if(input.action==='provision'&&JSON.stringify(budget)!==JSON.stringify(costBudgetSchema.parse({...input.budget,expiresAt:new Date(input.budget.expiresAt).toISOString()})))throw Error('Budget identity replay differs');
  if(input.action==='reconcile'){
   const requestDigest=evidenceDigest(JSON.stringify(input));
   const receipt=(await db.query('SELECT request_digest FROM operations_cost_reconciliations WHERE reservation_id=$1',[input.reservationId])).rows[0];
   if(receipt&&receipt.request_digest!==requestDigest)throw Error('Charge reconciliation evidence replay differs');
   const reservation=(await db.query('SELECT * FROM operations_cost_reservations WHERE id=$1 AND budget_id=$2 FOR UPDATE',[input.reservationId,budgetId])).rows[0];
   if(!reservation||reservation.operation_digest!==input.operationDigest)throw Error('Exact cost reservation required');
   if(reservation.state==='settled'){
    if(!receipt||Number(reservation.charged_micro_usd)!==input.chargedMicroUsd||reservation.charge_kind!==input.chargeKind)throw Error('Charge reconciliation replay differs');replayed=true;
   }else{
    if(reservation.state!==input.expectedState)throw Error('Charge state changed');
    if(!receipt)await db.query('INSERT INTO operations_cost_reconciliations(reservation_id,request_digest,charge_evidence_digest,operator_review_digest,charged_micro_usd,charge_kind) VALUES($1,$2,$3,$4,$5,$6)',[input.reservationId,requestDigest,input.chargeEvidenceDigest,input.operatorReviewDigest,input.chargedMicroUsd,input.chargeKind]);
    await db.query("UPDATE operations_cost_reservations SET state='settled',charged_micro_usd=$2,charge_kind=$3 WHERE id=$1",[input.reservationId,input.chargedMicroUsd,input.chargeKind]);
   }
  }
  const reservations=(await db.query('SELECT * FROM operations_cost_reservations WHERE budget_id=$1 ORDER BY created_at,id LIMIT 100001',[budgetId])).rows;
  if(reservations.length>100000)throw Error('Cost inventory exceeds bound');
  const parsed=reservations.map(r=>costReservationSchema.parse({id:r.id,budgetId:r.budget_id,operationDigest:r.operation_digest,upperBoundMicroUsd:Number(r.upper_bound_micro_usd),state:r.state,chargedMicroUsd:r.charged_micro_usd===null?null:Number(r.charged_micro_usd),chargeKind:r.charge_kind}));
  const unknown=parsed.some(r=>r.state==='unknown'),remainingMicroUsd=unknown?null:remainingCost(budget,parsed);
  const result={contract:'pilot-cost-record-v1',environmentId,budget,budgetState:row.state,reservations:parsed,remainingMicroUsd,admissionHeld:unknown||row.state!=='active'||Date.parse(budget.expiresAt)<=Date.now()||remainingMicroUsd!==null&&remainingMicroUsd<0,replayed,operatorRecord:true,releaseApproved:false,providerCalls:0};
  await db.query('COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error;}
}
export async function pilotCost(args=process.argv.slice(2)){
 if(args.length!==6||args[0]!=='--environment'||args[2]!=='--input'||args[4]!=='--output')throw Error('Explicit cost environment, private input and new output required');
 const environmentId=args[1],file=resolve(args[3]),root=resolve(args[5]),input=pilotCostCommandSchema.parse(await readEvidence(dirname(file),basename(file)));
 const database=operatorRecoveryDatabase(environmentId);await createEvidenceDirectory(root);
 const source=await pilotSource(),requestDigest=evidenceDigest(JSON.stringify(input));
 // Preserve the exact private request before any owner accounting change.
 await writeEvidence(root,'request.json',{...source,environmentId,requestDigest,input});
 const db=new Client({connectionString:database,connectionTimeoutMillis:5000});
 try{
  await db.connect();const result=await recordPilotCost(db,environmentId,input),current=await pilotSource();
  if(source.sourceCommit!==current.sourceCommit||source.sourceDigest!==current.sourceDigest||source.catalogDigest!==current.catalogDigest)throw Error('Cost source changed; inspect exact owner ledger');
  await writeEvidence(root,'cost.json',{...source,requestDigest,...result});
  console.info(JSON.stringify({recorded:true,category:result.budget.category,admissionHeld:result.admissionHeld,providerCalls:0,releaseApproved:false}));
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotCost().catch(()=>{console.error('Cost recording failed; inspect exact budget/reservation before retry. No provider call was made.');process.exitCode=1;});
