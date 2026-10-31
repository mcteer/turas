import type {Client} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {auditRecoveryEffectGuards} from './recovery-effect-guards';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
const integer=z.coerce.number().int().nonnegative().safe();
type Exposure={kind:'ordinary_tokens'|'parity_dollars';id:string;scope:string;ceiling:number;actual:number|null;baseline:number|null};
/** Exhaustive typed model accounting component only. Unknown amounts remain
 * held; this never settles, refunds, recreates effects or proves execution end. */
export async function auditRecoveryModelHolds(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId),guards=await auditRecoveryEffectGuards(db,target);
 const baselines=new Map((source.snapshot.tables.find(table=>table.name==='ordinary_conversation_allowances')?.rows??[]).map(row=>[String(row.identity.conversation_id),integer.parse(row.status.baseline_output_tokens)]));
 const allowances=(await db.query('SELECT a.conversation_id,a.baseline_output_tokens FROM ordinary_conversation_allowances a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 ORDER BY a.conversation_id LIMIT 10001',[target.environmentId])).rows;
 if(allowances.length>10000)throw Error('Ordinary allowance inventory bound exceeded');
 const currentBaselines=new Map(allowances.map(row=>[String(row.conversation_id),integer.parse(row.baseline_output_tokens)]));
 for(const [conversationId,baseline] of baselines)if(currentBaselines.get(conversationId)!==baseline)throw Error('Retained ordinary conversation baseline missing or changed');
 const exposures:Exposure[]=[];
 function add(kind:Exposure['kind'],id:unknown,scope:unknown,ceiling:unknown,actual:unknown,baseline:unknown){exposures.push({kind,id:z.uuid().parse(id),scope:z.uuid().parse(scope),ceiling:integer.parse(ceiling),actual:actual==null?null:integer.parse(actual),baseline:kind==='ordinary_tokens'?integer.parse(baseline):null});}
 for(const table of source.snapshot.tables)for(const row of table.rows){
  if(table.name==='ordinary_model_operations')add('ordinary_tokens',row.identity.id,row.status.conversation_id,row.status.ceiling_tokens,row.status.actual_tokens,baselines.get(String(row.status.conversation_id)));
  if(table.name==='parity_evaluation_operations')add('parity_dollars',row.identity.id,row.status.budget_id,row.status.ceiling_micro_usd,row.status.actual_micro_usd,null);
  if(table.name==='operations_recovery_model_holds'){const kind=z.enum(['ordinary_tokens','parity_dollars']).parse(row.identity.operation_kind);add(kind,row.identity.operation_id,row.status.scope_id,kind==='ordinary_tokens'?row.status.ceiling_tokens:row.status.ceiling_micro_usd,kind==='ordinary_tokens'?row.status.actual_tokens:row.status.actual_micro_usd,row.status.baseline_output_tokens);}
 }
 const current=(await db.query(`SELECT 'ordinary_tokens' AS kind,o.id,o.conversation_id AS scope,o.ceiling_tokens AS ceiling,o.actual_tokens AS actual,a.baseline_output_tokens AS baseline FROM ordinary_model_operations o JOIN conversations c ON c.id=o.conversation_id LEFT JOIN ordinary_conversation_allowances a ON a.conversation_id=o.conversation_id WHERE c.environment_id=$1
 UNION ALL SELECT 'parity_dollars',o.id,o.budget_id,o.ceiling_micro_usd,o.actual_micro_usd,NULL FROM parity_evaluation_operations o JOIN parity_evaluation_budgets b ON b.id=o.budget_id WHERE b.environment_id=$1 LIMIT 10001`,[target.environmentId])).rows;
 if(current.length>10000)throw Error('Model accounting inventory bound exceeded');for(const row of current)add(row.kind,row.id,row.scope,row.ceiling,row.actual,row.baseline);
 const holds=(await db.query('SELECT * FROM operations_recovery_model_holds WHERE environment_id=$1 ORDER BY operation_kind,operation_id LIMIT 10001',[target.environmentId])).rows;
 if(holds.length>10000)throw Error('Model hold inventory bound exceeded');
 const byId=new Map(holds.map(row=>[row.operation_kind+':'+row.operation_id,row]));
 for(const hold of holds)add(hold.operation_kind,hold.operation_id,hold.scope_id,hold.operation_kind==='ordinary_tokens'?hold.ceiling_tokens:hold.ceiling_micro_usd,hold.operation_kind==='ordinary_tokens'?hold.actual_tokens:hold.actual_micro_usd,hold.baseline_output_tokens);
 for(const exposure of exposures){
  const hold=byId.get(exposure.kind+':'+exposure.id),ordinary=exposure.kind==='ordinary_tokens';
  if(!hold||hold.scope_id!==exposure.scope||integer.parse(ordinary?hold.ceiling_tokens:hold.ceiling_micro_usd)!==exposure.ceiling||(ordinary&&integer.parse(hold.baseline_output_tokens)!==exposure.baseline))throw Error('Original typed model hold missing or changed');
  // A smaller settlement cannot silently replace an uncertain original ceiling.
  const actual=ordinary?hold.actual_tokens:hold.actual_micro_usd,accounted=integer.parse(actual??(ordinary?hold.ceiling_tokens:hold.ceiling_micro_usd)),required=exposure.actual??exposure.ceiling;
  if(accounted<required)throw Error('Original model exposure is not conservatively held');
 }
 const observations=(await db.query(`SELECT o.*,to_jsonb(o)->>'observed_captured_at' AS observed_captured_at,to_jsonb(o)->>'settled_at' AS settled_at FROM operations_recovery_model_observations o WHERE environment_id=$1 ORDER BY operation_kind,operation_id,observed_evidence_digest,evidence_kind LIMIT 10001`,[target.environmentId])).rows;
 if(observations.length>10000)throw Error('Model observation inventory bound exceeded');
 const expectedObservations=source.snapshot.tables.find(table=>table.name==='operations_recovery_model_observations')!.rows;
 for(const row of expectedObservations){
  const found=observations.find(actual=>actual.operation_kind===row.identity.operation_kind&&actual.operation_id===row.identity.operation_id&&actual.observed_evidence_digest===row.identity.observed_evidence_digest&&actual.evidence_kind===row.identity.evidence_kind);
  if(!found||['ceiling_tokens','ceiling_micro_usd','actual_tokens','actual_micro_usd','observed_digest_kind'].some(key=>String(found[key])!==String(row.status[key]))||found&&(found.observed_captured_at!==row.status.observed_captured_at||found.settled_at!==row.status.settled_at))throw Error('Retained model observation missing or changed');
 }
 for(const observation of observations){
  const hold=byId.get(observation.operation_kind+':'+observation.operation_id),ordinary=observation.operation_kind==='ordinary_tokens';
  if(!hold)throw Error('Model observation has no original hold');
  if(integer.parse((ordinary?hold.actual_tokens:hold.actual_micro_usd)??(ordinary?hold.ceiling_tokens:hold.ceiling_micro_usd))<integer.parse((ordinary?observation.actual_tokens:observation.actual_micro_usd)??(ordinary?observation.ceiling_tokens:observation.ceiling_micro_usd)))throw Error('Known higher model exposure is not held');
 }
 const parityBudgets=(await db.query(`SELECT id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,reserved_micro_usd,state,to_jsonb(b)->>'expires_at' AS expires_at FROM parity_evaluation_budgets b WHERE environment_id=$1 ORDER BY id LIMIT 10001`,[target.environmentId])).rows;
 if(parityBudgets.length>10000)throw Error('Parity budget inventory bound exceeded');
 for(const row of source.snapshot.tables.find(table=>table.name==='parity_evaluation_budgets')!.rows){
  const budget=parityBudgets.find(actual=>actual.id===row.identity.id);
  if(!budget||['workspace_id','owner_principal_id','cap_micro_usd'].some(key=>String(budget[key])!==String(row.status[key]))||budget.expires_at!==row.status.expires_at||budget.state==='open'||integer.parse(budget.reserved_micro_usd)<integer.parse(row.status.reserved_micro_usd))throw Error('Retained parity budget identity or original reservation floor differs');
 }
 const reopened=(await db.query(`SELECT 1 FROM parity_evaluation_budgets b WHERE b.environment_id=$1 AND b.id IN(SELECT scope_id FROM operations_recovery_model_holds WHERE environment_id=$1 AND operation_kind='parity_dollars') AND (b.state='open' OR b.reserved_micro_usd<(SELECT COALESCE(sum(COALESCE(h.actual_micro_usd,h.ceiling_micro_usd)),0) FROM operations_recovery_model_holds h WHERE h.environment_id=$1 AND h.operation_kind='parity_dollars' AND h.scope_id=b.id)) LIMIT 1`,[target.environmentId])).rows;
 if(reopened.length)throw Error('Original parity scope reopened or refunded');
 const changedBaseline=(await db.query(`SELECT 1 FROM operations_recovery_model_holds h LEFT JOIN ordinary_conversation_allowances a ON a.conversation_id=h.scope_id WHERE h.environment_id=$1 AND h.operation_kind='ordinary_tokens' AND (a.conversation_id IS NULL OR a.baseline_output_tokens<>h.baseline_output_tokens) LIMIT 1`,[target.environmentId])).rows;
 if(changedBaseline.length)throw Error('Original conversation allowance changed');
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-model-hold-audit-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,guardDigest:guards.guardDigest,holdDigest:recoveryDigest(holds),observationDigest:recoveryDigest(observations),operations:new Set(exposures.map(row=>row.kind+':'+row.id)).size,holds:holds.length,observations:observations.length,typedModelAccountingVerified:true as const,permanentRequestFencesVerified:false as const,allPaidEffectsVerified:false as const,providerExecutionClosed:false as const,restorationReady:false as const});
}
