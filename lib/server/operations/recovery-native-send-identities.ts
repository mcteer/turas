import type {Client} from 'pg';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
const tables=['response_attempts','plan_drafting_attempts','staffing_advisory_attempts','execution_advice_attempts','support_advice_attempts','expansion_advice_attempts','learning_attempts','report_deliveries'] as const;
const fields=['environment_id','workspace_id','principal_id','owner_principal_id','owner_membership_id','actor_membership_id','actor_session_id','membership_id','customer_id','conversation_id','message_id','publication_id','binding_id','request_key','request_digest','input_digest','native_request_id','native_session_id','native_turn_id','response_id','provider_id','provider_generation_id','provider_message_id','native_delivery_id','request_event_id','native_call_id','policy_revision_id'];
/** Preserve original provider/business identities without rewriting permitted
 * retirement state. An absent original row remains represented only by genuine
 * retained metadata AND every permanent tombstone; no delivery is reconstructed. */
export async function auditRecoveryNativeSendIdentities(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine native/send identity owner required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId);await currentRecoveryStateDigest(db);
 const observations=[];let currentRows=0,retainedOnlyRows=0;
 for(const name of tables){
  const original=source.snapshot.tables.find(table=>table.name===name);if(!original)throw Error('Complete original native/send inventory required');
  const applicable=(await db.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=ANY($2::text[]) ORDER BY column_name",[name,fields])).rows.map(row=>row.column_name);
  for(const row of original.rows)if(applicable.some(field=>!Object.hasOwn(row.identity,field)&&!Object.hasOwn(row.status,field)))throw Error('Complete original native/send identity metadata required');
  const rows=(await db.query(`SELECT (SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key) FROM jsonb_each(to_jsonb(r)) e WHERE e.key=ANY($1::text[])) AS identity,
   COALESCE((SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key) FROM jsonb_each(to_jsonb(r)) e WHERE e.key=ANY($2::text[])),'{}'::jsonb) AS status,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('columns',item.key_columns,'digest',encode(sha256(convert_to((SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key)::text FROM jsonb_each(to_jsonb(r)) e WHERE item.key_columns ? e.key),'UTF8')),'hex'))) FROM jsonb_array_elements($3::jsonb) item(key_columns)),'[]'::jsonb) AS keys
   FROM public."${name}" r LIMIT 10001`,[original.primaryKey,fields,JSON.stringify(original.replayKeyColumns??[])])).rows;
  if(rows.length>10000)throw Error('Native/send identity inventory bound exceeded');
  const originals=new Map(original.rows.map(row=>[recoveryDigest(row.identity),row])),current=new Map(rows.map(row=>[recoveryDigest(row.identity),row]));
  if(current.size!==rows.length||rows.some(row=>!originals.has(recoveryDigest(row.identity))))throw Error('Unretained current native/send effect identity');
  for(const row of original.rows){
   const actual=current.get(recoveryDigest(row.identity));
   if(actual){
    if(applicable.some(field=>JSON.stringify({...actual.status,...actual.identity}[field])!==JSON.stringify({...row.status,...row.identity}[field]))||row.replayKeys?.some(key=>!actual.keys.some((value:{columns:string[];digest:string})=>JSON.stringify(value.columns)===JSON.stringify(key.columns)&&value.digest===key.digest)))throw Error('Original native/send provider or business identity changed');currentRows++;
   }else{
    if(!row.replayKeys?.length)throw Error('Missing original effect has no permanent request identity');
    const missing=(await db.query(`SELECT count(*)::int AS n FROM jsonb_to_recordset($1::jsonb) expected(columns jsonb,digest text) WHERE NOT EXISTS(SELECT 1 FROM operations_replay_fences f WHERE f.environment_id=$2 AND f.table_name=$3 AND f.key_digest=expected.digest AND f.key_columns=ARRAY(SELECT jsonb_array_elements_text(expected.columns)))`,[JSON.stringify(row.replayKeys),target.environmentId,name])).rows[0]?.n;
    if(missing!==0)throw Error('Missing original native/send identity lacks tombstones');retainedOnlyRows++;
   }
   observations.push({name,identity:row.identity,originalRowDigest:row.rowDigest,currentRowPresent:!!actual});
  }
 }
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-native-send-identities-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,identityDigest:recoveryDigest(observations),currentRows,retainedOnlyRows,originalNativeSendIdentitiesPreserved:true as const,unknownDeliveryOrChargeSettled:false as const,providerExecutionClosed:false as const,restorationReady:false as const});
}
