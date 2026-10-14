import {randomUUID} from 'node:crypto';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {maintenanceClasses} from './maintenance';
import {operationalCodeVersion} from './code-version';

export type MaintenanceObservation={class_id:string;last_success_at:Date|null;last_completed_at:Date|null;safe_failure:string|null;code_version:string|null;duration_ms:number|null;backlog_count:number;backlog_truncated:boolean;oldest_due_at?:Date|null};
/** A start, another worker heartbeat, or caller-supplied prose cannot count as success. */
export function assessMaintenanceHealth(rows:MaintenanceObservation[],now:number,codeVersion:string){
 if(!Number.isFinite(now)||!/^[a-f0-9]{40}$/.test(codeVersion)||rows.length>maintenanceClasses.length||new Set(rows.map(r=>r.class_id)).size!==rows.length||rows.some(r=>!maintenanceClasses.some(c=>c.id===r.class_id)))throw Error('Invalid maintenance health inventory');
 const classes=maintenanceClasses.map(definition=>{
  const row=rows.find(r=>r.class_id===definition.id),success=row?.last_success_at?.getTime(),completed=row?.last_completed_at?.getTime();
  const fresh=success!==undefined&&Number.isFinite(success)&&success<=now&&now-success<definition.staleAfterMs&&completed!==undefined&&Number.isFinite(completed)&&completed>=success&&completed<=now;
  const oldest=row?.oldest_due_at?.getTime();
  const ageValid=!!row&&(row.backlog_count===0?oldest===undefined:oldest!==undefined&&Number.isFinite(oldest)&&oldest<=now);
  const valid=ageValid&&!!row&&Number.isSafeInteger(row.backlog_count)&&row.backlog_count>=0&&row.backlog_count<=1000&&typeof row.backlog_truncated==='boolean'&&(row.duration_ms===null||Number.isSafeInteger(row.duration_ms)&&row.duration_ms>=0&&row.duration_ms<=360000);
  const state=!row?'missing':!valid?'invalid':row.code_version!==codeVersion?'wrong_version':row.safe_failure!==null?'failed':!fresh?'stale':oldest!==undefined&&now-oldest>=definition.staleAfterMs?'backlogged':'healthy';
  return {classId:definition.id,state,staleAfterMs:definition.staleAfterMs,backlog:valid?row!.backlog_count:null,truncated:valid?row!.backlog_truncated:null,oldestDueAgeMs:valid&&oldest!==undefined?now-oldest:null,durationMs:valid?row!.duration_ms:null};
 });
 return {healthy:classes.every(c=>c.state==='healthy'),classes};
}

/** Observational lane only: retains immutable typed samples and expires at most
 * 100 old observations. It never starts domain work or changes success timestamps. */
export async function observeMaintenanceHealth(){
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID,codeVersion=operationalCodeVersion();
 return withTransaction(async db=>{
  await db.query("SET LOCAL statement_timeout='5000ms'");
  await db.query("SET LOCAL transaction_timeout='15s'");
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==environmentId||marker[0].schema_version!==57)throw Error('Exact health environment required');
  const rows=(await db.query<MaintenanceObservation>('SELECT class_id,last_success_at,last_completed_at,safe_failure,code_version,duration_ms,backlog_count,backlog_truncated,oldest_due_at FROM operations_maintenance_status WHERE environment_id=$1',[environmentId])).rows;
  // Sample the clock after reading ticks: a concurrent legitimate completion
  // must not look like a future success relative to an earlier query's clock.
  const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
  const result=assessMaintenanceHealth(rows,now,codeVersion);
  for(const row of result.classes)await db.query("INSERT INTO operations_health_samples(id,environment_id,kind,state,class_id,duration_ms,backlog_count,code_version,oldest_due_at) VALUES($1,$2,'maintenance',$3,$4,$5,$6,$7,$8)",[randomUUID(),environmentId,row.state==='healthy'?'pass':'fail',row.classId,row.durationMs,row.backlog,codeVersion,rows.find(source=>source.class_id===row.classId)?.oldest_due_at??null]);
  await db.query('SELECT turas_expire_store_observations($1,100)',[environmentId]);
  await db.query('SELECT turas_expire_backup_observations($1,100)',[environmentId]);
  const expired=Number((await db.query('SELECT turas_expire_health_samples($1,100) AS removed',[environmentId])).rows[0].removed);
  return {contract:'pilot-maintenance-health-v1',environmentId,codeVersion,observedAt:new Date(now).toISOString(),...result,expiredSamples:expired,fullReadinessVerified:false};
 });
}
