import type {Client} from 'pg';
import {createRequire} from 'node:module';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
const required=Object.freeze([
 'recovery_paid_hold_immutable','recovery_paid_release_guard',
 'recovery_model_hold_immutable','recovery_model_hold_admission',
 'recovery_model_observation_immutable','recovery_model_observation_admission',
 'recovery_ordinary_model_admission','recovery_parity_model_admission',
 'recovery_parity_budget_guard','recovery_ordinary_settlement_guard','recovery_parity_settlement_guard',
 'cost_reconciliation_immutable','cost_budget_identity','cost_reservation_fence',
]);
function authored(){
 let sql='';createRequire(import.meta.url)('../../../migrations/079-pilot-operations.cjs').up({sql(value:string){sql+=value;}});
 const functions=new Map([...sql.matchAll(/CREATE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql( SECURITY DEFINER SET search_path=pg_catalog,public)? AS \$\$([\s\S]*?)\$\$;/g)].map(match=>[match[1],{body:match[3].trim(),security:!!match[2]}]));
 const output=/CREATE FUNCTION turas_ordinary_output_used\(conversation uuid\) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1];
 if(!output)throw Error('Authored ordinary held accounting function unavailable');
 const triggers=required.map(name=>{
  const trigger=new RegExp('CREATE TRIGGER '+name+' BEFORE ([A-Z ]+) ON (\\w+)\\s+FOR EACH ROW EXECUTE FUNCTION (\\w+)\\(\\);').exec(sql);
  if(!trigger)throw Error('Authored recovery effect trigger unavailable');const fn=functions.get(trigger[3]);if(!fn)throw Error('Authored recovery effect function unavailable');
  const events=trigger[1].split(' OR ');if(events.some(event=>!['INSERT','UPDATE','DELETE'].includes(event)))throw Error('Unsupported authored effect trigger');
  return {name,table:trigger[2],functionName:trigger[3],type:3+events.reduce((sum,event)=>sum+({INSERT:4,UPDATE:16,DELETE:8}[event]!),0),...fn};
 });
 return {triggers,output:output.trim()};
}
/** Inspect installed enforcement, never execute DDL or mutate a held effect.
 * This component proves neither exhaustive held accounting nor provider closure. */
export async function auditRecoveryEffectGuards(db:Client,target:LockedWorkRecoveryTarget){
 if(!isWorkRecoveryDecisionClient(db)||target.deadline<=Date.now())throw Error('Genuine current owner effect decision required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);
 const currentStateDigest=await currentRecoveryStateDigest(db),authoredFunctions=authored(),expected=authoredFunctions.triggers;
 for(const item of expected){
  const rows=(await db.query(`SELECT t.tgenabled,t.tgtype,t.tgnargs,t.tgqual IS NULL AS unconditional,t.tgattr::text AS attributes,t.tgisinternal,
   p.proname,p.prosrc,p.prosecdef,p.proconfig,p.pronargs,l.lanname,
   c.relowner=(SELECT relowner FROM pg_class WHERE oid='public.operations_control'::regclass) AS table_owner,p.proowner=c.relowner AS function_owner,
   p.prorettype='pg_catalog.trigger'::regtype AS trigger_return
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE n.nspname='public' AND pn.nspname='public' AND c.relname=$1 AND t.tgname=$2`,[item.table,item.name])).rows;
  const row=rows[0],config=item.security?['search_path=pg_catalog, public']:null;
  if(rows.length!==1||row.tgenabled!=='O'||Number(row.tgtype)!==item.type||Number(row.tgnargs)!==0||!row.unconditional||row.attributes!==''||row.tgisinternal!==false||row.proname!==item.functionName||row.prosrc.trim()!==item.body||row.prosecdef!==item.security||JSON.stringify(row.proconfig)!==JSON.stringify(config)||Number(row.pronargs)!==0||row.lanname!=='plpgsql'||!row.table_owner||!row.function_owner||!row.trigger_return)throw Error('Installed recovery effect enforcement differs: '+item.name);
 }
 const output=(await db.query(`SELECT p.prosrc,p.prosecdef,p.proconfig,p.provolatile,l.lanname,p.prorettype='pg_catalog.int8'::regtype AS result,
  p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.operations_control'::regclass) AS owner
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='public.turas_ordinary_output_used(uuid)'::regprocedure`)).rows;
 if(output.length!==1||output[0].prosrc.trim()!==authoredFunctions.output||output[0].prosecdef!==true||output[0].provolatile!=='s'||output[0].lanname!=='sql'||!output[0].result||!output[0].owner||JSON.stringify(output[0].proconfig)!==JSON.stringify(['search_path=pg_catalog, public']))throw Error('Installed ordinary held accounting function differs');
 for(const role of ['turas_runtime','turas_runtime_016'])for(const table of ['operations_recovery_paid_holds','operations_recovery_model_holds','operations_recovery_model_observations','operations_cost_reconciliations']){
  const privileges=(await db.query(`SELECT has_table_privilege($2,$1,'INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege($2,$1,'INSERT,UPDATE') AS writable`,['public.'+table,role])).rows[0];
  if(privileges?.writable!==false)throw Error('Runtime recovery accounting authority differs');
 }
 return Object.freeze({contract:'pilot-recovery-effect-guards-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,currentStateDigest,guards:expected.length,guardDigest:recoveryDigest(authoredFunctions),installedEffectGuardsVerified:true as const,heldAccountingVerified:false as const,providerExecutionClosed:false as const,restorationReady:false as const});
}
