import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';

export const operationalDatabaseBindingSchema=z.strictObject({contract:z.literal('pilot-operational-database-binding-v1'),databaseBindingDigest:z.string().regex(/^[a-f0-9]{64}$/),environmentId:z.string().min(1).max(256),schemaVersion:z.literal(80),codeVersion:z.string().regex(/^[a-f0-9]{40}$/),mode:z.enum(['open','quiescing','locked']),controlRevision:z.number().int().positive(),recoveryId:z.uuid().nullable(),measuredAt:z.iso.datetime({offset:true}),effectiveRuntimeRole:z.boolean(),directRuntimeLogin:z.boolean()});
/** Compare endpoints without emitting host/database names or credentials. Owner
 * and runtime credentials and pooled/unpooled forms identify the same database. */
export function databaseTargetDigest(connection:string,environmentId:string,actualDatabaseName?:string){
 try{
  const url=new URL(connection),database=decodeURIComponent(url.pathname.slice(1));
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!database||!environmentId||environmentId.length>256||(actualDatabaseName!==undefined&&actualDatabaseName!==database))throw Error();
  return createHash('sha256').update(JSON.stringify({contract:'pilot-database-target-v1',host:url.hostname.toLowerCase().replace('-pooler.','.'),port:url.port||'5432',database,environmentId})).digest('hex');
 }catch{throw Error('Database target binding unavailable');}
}
/** Existing authenticated operator diagnostics only; no health assertion,
 * credential, raw endpoint or write is introduced. */
export async function readOperationalDatabaseBinding(db:PoolClient,input:{connection:string;environmentId:string;codeVersion:string}){
 const rows=(await db.query(`SELECT current_database() AS database_name,e.environment_id,e.schema_version,c.mode,c.revision,c.recovery_id,clock_timestamp() AS measured_at,
  current_user IN('turas_runtime','turas_runtime_016') AS effective_runtime_role,session_user=current_user AS direct_runtime_login
  FROM turas_environment e JOIN operations_control c USING(environment_id)`)).rows;
 if(rows.length!==1||rows[0].environment_id!==input.environmentId)throw Error('Operational database binding unavailable');
 const row=rows[0];
 return operationalDatabaseBindingSchema.parse({contract:'pilot-operational-database-binding-v1',databaseBindingDigest:databaseTargetDigest(input.connection,input.environmentId,row.database_name),environmentId:row.environment_id,schemaVersion:Number(row.schema_version),codeVersion:input.codeVersion,mode:row.mode,controlRevision:Number(row.revision),recoveryId:row.recovery_id,measuredAt:row.measured_at.toISOString(),effectiveRuntimeRole:row.effective_runtime_role,directRuntimeLogin:row.direct_runtime_login});
}
