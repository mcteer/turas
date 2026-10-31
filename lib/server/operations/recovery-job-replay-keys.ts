import type {Client,PoolClient} from 'pg';
/** Authored schema079 identities for positive executor/index work. Semantic
 * identities intentionally do not pretend to be unconditional unique indexes:
 * retries may have distinct row IDs before recovery, but a recovered original
 * business intent cannot be re-admitted by inventing another row ID. */
const columns:Readonly<Record<string,Readonly<Record<string,string>>>>=Object.freeze({
 operations_hosted_jobs:Object.freeze({environment_id:'text',domain_kind:'text',domain_job_id:'uuid'}),
 operations_local_jobs:Object.freeze({environment_id:'text',domain_kind:'text',domain_job_id:'uuid'}),
 artifact_extraction_runs:Object.freeze({environment_id:'text',version_id:'uuid',lifecycle_generation:'bigint'}),
 workforce_import_jobs:Object.freeze({environment_id:'text',source_version_id:'uuid'}),
 report_jobs:Object.freeze({environment_id:'text',workspace_id:'uuid',kind:'text',input_digest:'text'}),
 gap_report_jobs:Object.freeze({environment_id:'text',report_id:'uuid',input_digest:'text'}),
 retrieval_jobs:Object.freeze({environment_id:'text',source_id:'uuid',source_generation:'bigint',contract_digest:'text',kind:'text'}),
});
const semantic=new Set(['operations_hosted_jobs','operations_local_jobs','artifact_extraction_runs','gap_report_jobs']);
export const recoveryJobReplayTables=Object.freeze(Object.keys(columns).sort());
export async function requireRecoveryJobReplayColumns(db:Client|PoolClient,name:string){
 const expected=Object.hasOwn(columns,name)?columns[name]:undefined;if(!expected)return [] as string[][];
 const actual=(await db.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[name])).rows;
 if(Object.entries(expected).some(([key,type])=>!actual.some(row=>row.column_name===key&&row.data_type===type&&row.is_nullable==='NO')))throw Error('Authored recovery job identity columns differ');
 return semantic.has(name)?[Object.keys(expected).sort()]:[];
}
export function requiredRecoveryJobSemanticKeys(name:string){return Object.hasOwn(columns,name)&&semantic.has(name)?[Object.keys(columns[name]).sort()]:[];}
/** Validate the authored semantic identities against actual typed columns and
 * each retained original value. SQL JSONB hashing matches the installed guard. */
export async function requireRecoveryJobSemanticRows(db:Client|PoolClient,entry:{name:string;replayKeyColumns?:string[][];rows:readonly {identity:Record<string,unknown>;status:Record<string,unknown>;replayKeys?:{columns:string[];digest:string}[]}[]},environmentId:string){
 const keys=await requireRecoveryJobReplayColumns(db,entry.name);if(!keys.length)return;
 for(const key of keys){
  if(!entry.replayKeyColumns?.some(value=>JSON.stringify(value)===JSON.stringify(key)))throw Error('Complete authored recovery job business keys required');
  const identities=entry.rows.map(row=>{
   const identity=Object.fromEntries(key.map(column=>[column,Object.hasOwn(row.identity,column)?row.identity[column]:row.status[column]])),proof=row.replayKeys?.find(value=>JSON.stringify(value.columns)===JSON.stringify(key));
   if(!proof||identity.environment_id!==environmentId||Object.values(identity).some(value=>value===null||value===undefined))throw Error('Exact original recovery job business identity required');
   return {identity,digest:proof.digest};
  });
  const invalid=(await db.query(`SELECT count(*)::int AS n FROM jsonb_array_elements($1::jsonb) item WHERE encode(sha256(convert_to((item->'identity')::text,'UTF8')),'hex')<>item->>'digest'`,[JSON.stringify(identities)])).rows[0]?.n;
  if(invalid!==0)throw Error('Original recovery job business identity digest differs');
 }
}
