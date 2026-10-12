import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Client} from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';

const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),password:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
async function restrictedPermissionRole(db:Client,role:string){
 return (await db.query(`SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  AND NOT has_schema_privilege(rolname,'public','CREATE') AND NOT has_database_privilege(rolname,current_database(),'CREATE')
  AND NOT has_table_privilege(rolname,'operations_control','UPDATE')
  AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(rolname,c.relowner,'MEMBER'))
  AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_has_role(rolname,p.proowner,'MEMBER')) AS valid
  FROM pg_roles WHERE rolname=$1`,[role])).rows[0]?.valid===true;
}
/** Exercise deployment credential retirement only in an independently owned
 * disposable target. This never edits hosted credentials or unlocks recovery.
 * A new login inherits the existing restricted permission role; the old login
 * loses LOGIN and every old backend is terminated before returning success. */
export async function retireOwnedLegacyRuntime(db:Client,input:z.infer<typeof scopeSchema>){
 const scope=scopeSchema.parse(input),url=new URL(requireOwnedPilotDatabase(process.env,true));
 const identity=(await db.query('SELECT current_database() AS name,current_user AS role')).rows[0];
 const token=String(identity?.name??'').slice('turas_test_016_eval_'.length);
 if(identity?.name!==url.pathname.slice(1)||identity.role!==decodeURIComponent(url.username))throw Error('Owned runtime retirement target required');
 const label=await promisify(execFile)('docker',['inspect','--format','{{index .Config.Labels "turas.016.owner"}}','turas-016-check-'+token],{timeout:5000,maxBuffer:8192});
 if(label.stdout.trim()!==token)throw Error('Owned runtime retirement target required');
 const result=await retireLockedLegacyRuntime(db,scope,{databaseName:identity.name,ownerRole:identity.role});
 return {...result,contract:'pilot-owned-runtime-retirement-v1' as const};
}
/** Explicit operator-only database operation. The independently selected owner
 * connection and exact locked revision are required. This does not cancel
 * provider runs, update deployment secrets, verify recovery or open service. */
export async function retireLockedLegacyRuntime(db:Client,input:z.infer<typeof scopeSchema>,expected:{databaseName:string;ownerRole:string}){
 const scope=scopeSchema.parse(input);
 if(!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(expected.databaseName)||!expected.ownerRole)throw Error('Explicit retirement database owner required');
 const binding=JSON.stringify({contract:'pilot-runtime-retirement-v1',databaseName:expected.databaseName,environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,passwordDigest:createHash('sha256').update(scope.password).digest('hex')});
 const identity=(await db.query(`SELECT current_database() AS name,current_user AS role,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner`)).rows[0];
 if(identity?.owner!==true||identity.name!==expected.databaseName||identity.role!==expected.ownerRole)throw Error('Exact retirement database owner required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'; SET LOCAL transaction_timeout='30s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR UPDATE',[scope.environmentId])).rows[0];
  if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==57||control?.mode!=='locked'||Number(control.revision)!==scope.controlRevision||control.recovery_id!==scope.recoveryId)throw Error('Exact locked runtime retirement required');
  if(!await restrictedPermissionRole(db,'turas_runtime'))throw Error('Restricted legacy permission role required');
  // The owner-bound role comment makes interruption after commit repeatable.
  // Never upsert a password or adopt an unrelated pre-existing login.
  const existing=(await db.query("SELECT shobj_description(oid,'pg_authid') AS binding FROM pg_roles WHERE rolname='turas_runtime_016'")).rows[0];
  if(existing&&existing.binding!==binding)throw Error('Replacement runtime already exists with different binding');
  if(!existing){
   const statement=(await db.query("SELECT format('CREATE ROLE turas_runtime_016 LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD %L',$1::text) AS sql",[scope.password])).rows[0].sql;
   await db.query(statement);
   await db.query('GRANT turas_runtime TO turas_runtime_016');
   await db.query((await db.query("SELECT format('COMMENT ON ROLE turas_runtime_016 IS %L',$1::text) AS sql",[binding])).rows[0].sql);
  }
  if(!await restrictedPermissionRole(db,'turas_runtime_016')||(await db.query("SELECT pg_has_role('turas_runtime_016','turas_runtime','USAGE') AS inherited")).rows[0]?.inherited!==true)throw Error('Restricted replacement permission role required');
  await db.query('ALTER ROLE turas_runtime NOLOGIN');
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
 // LOGIN closes reconnection first. Termination is deliberately after commit:
 // rollback cannot reopen the legacy login after killing its backends.
 await db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='turas_runtime' AND pid<>pg_backend_pid()");
 const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows;
 if(roles.length!==2||roles[0].rolcanlogin!==false||roles[1].rolcanlogin!==true||roles.some(row=>row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolbypassrls)||(await db.query("SELECT 1 FROM pg_stat_activity WHERE usename='turas_runtime'")).rowCount)throw Error('Runtime retirement incomplete; recovery remains locked');
 return {contract:'pilot-runtime-retirement-v1' as const,environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,oldLoginDisabled:true,oldBackendsTerminated:true,replacementRole:'turas_runtime_016',mode:'locked' as const,hostedCredentialsChanged:false,restorationReady:false};
}
