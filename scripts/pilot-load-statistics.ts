import type {PoolClient} from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {PilotEnvironment} from './pilot-environment';
import {requireOwnedPilotDatabase} from './pilot-environment';
const execute=promisify(execFile);
/** Owner-only disposable instrumentation. Never collect SQL text or literals. */
export async function prepareLoadStatistics(db:PoolClient){
 requireOwnedPilotDatabase(process.env,true);
 await db.query('CREATE SCHEMA pilot_observability AUTHORIZATION postgres');
 await db.query('REVOKE ALL ON SCHEMA pilot_observability FROM PUBLIC');
 await db.query('CREATE EXTENSION pg_stat_statements WITH SCHEMA pilot_observability');
 await db.query('REVOKE ALL ON ALL TABLES IN SCHEMA pilot_observability FROM PUBLIC');
 return {definition:'successful top-level statements executed by turas_runtime in the owned database; failed SQL executions excluded',postgres:(await db.query("SELECT current_setting('server_version') version,current_setting('max_connections') max_connections,current_setting('shared_buffers') shared_buffers,current_setting('work_mem') work_mem")).rows[0]};
}
export async function loadQueryCounter(db:PoolClient){
 const row=(await db.query("SELECT coalesce((SELECT sum(calls) FROM pilot_observability.pg_stat_statements WHERE toplevel AND userid=(SELECT oid FROM pg_roles WHERE rolname='turas_runtime') AND dbid=(SELECT oid FROM pg_database WHERE datname=current_database())),0)::text AS calls,dealloc::text,stats_reset FROM pilot_observability.pg_stat_statements_info")).rows[0];
 const calls=Number(row.calls);if(!Number.isSafeInteger(calls)||calls<0)throw Error('Invalid actual database query counter');return {calls,dealloc:String(row.dealloc),reset:new Date(row.stats_reset).toISOString()};
}
export function queryCounterDelta(before:Awaited<ReturnType<typeof loadQueryCounter>>,after:Awaited<ReturnType<typeof loadQueryCounter>>){
 if(before.reset!==after.reset||before.dealloc!==after.dealloc||after.calls<before.calls)throw Error('Database statistics reset or eviction invalidated load evidence');return after.calls-before.calls;
}
export async function loadResources(env:PilotEnvironment){
 const marker=await execute('docker',['inspect','--format','{{index .Config.Labels "turas.016.owner"}}',env.databaseContainer],{timeout:10000,maxBuffer:4096});if(marker.stdout.trim()!==env.databaseOwnerLabel)throw Error('Load container ownership changed');
 const engine=await execute('docker',['info','--format','{{json .NCPU}} {{json .MemTotal}} {{json .Architecture}}'],{timeout:10000,maxBuffer:4096});
 const stats=await execute('docker',['stats','--no-stream','--format','{{json .}}',env.databaseContainer],{timeout:10000,maxBuffer:8192});
 const pid=env.appPid();if(!pid)throw Error('Owned app process unavailable');const app=await execute('ps',['-o','pid=,pcpu=,rss=','-p',String(pid)],{timeout:5000,maxBuffer:4096});
 return {observedAt:new Date().toISOString(),dockerEngine:engine.stdout.trim(),database:JSON.parse(stats.stdout),appProcess:app.stdout.trim(),hostedResourceShapeVerified:false};
}
