import {withOperationalIo} from './admission';
import { randomUUID } from "node:crypto";
import { query } from "../db/client";
import catalog from "../../../scripts/pilot-catalog.json";

export const maintenanceClasses = Object.freeze(catalog.maintenance.map(row=>Object.freeze(row)));
export type MaintenanceClassId = typeof maintenanceClasses[number]["id"];
export type MaintenanceTick = (input:{limit:number;signal:AbortSignal})=>Promise<{backlog:number;truncated:boolean;oldestDueAt?:Date|null}>;
export type MaintenanceBinding = {id:MaintenanceClassId;enabled:boolean;optional:boolean;intervalMs?:number;tick:MaintenanceTick};
export function validateMaintenanceBindings(bindings:MaintenanceBinding[]) {
 const ids=new Set<string>();
 for(const binding of bindings){
  const definition=maintenanceClasses.find(row=>row.id===binding.id);
  if(!definition||ids.has(binding.id)||binding.optional||binding.intervalMs!==undefined&&(!Number.isSafeInteger(binding.intervalMs)||binding.intervalMs<1000||binding.intervalMs>definition.intervalMs))throw new Error("Invalid maintenance class binding");
  ids.add(binding.id);
 }
 return maintenanceClasses.map(row=>({ ...row, configured:ids.has(row.id), enabled:bindings.find(b=>b.id===row.id)?.enabled===true }));
}
export async function runMaintenanceClass(environmentId:string,codeVersion:string,binding:MaintenanceBinding) {
 const definition=maintenanceClasses.find(row=>row.id===binding.id);
 if(!definition||binding.optional||!binding.enabled||!/^[a-f0-9]{40}$/.test(codeVersion))throw new Error("Required maintenance unavailable");
 const leaseId=randomUUID(),deadlineMs=Math.min(30000,definition.staleAfterMs);
 await query(`INSERT INTO operations_maintenance_status(environment_id,class_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[environmentId,binding.id]);
 const claimed=await query(`UPDATE operations_maintenance_status SET lease_id=$3,
  lease_expires_at=clock_timestamp()+($4::int*interval '1 millisecond'),last_started_at=clock_timestamp(),generation=generation+1
  WHERE environment_id=$1 AND class_id=$2 AND (lease_id IS NULL OR lease_expires_at<=clock_timestamp()) RETURNING generation`,[environmentId,binding.id,leaseId,deadlineMs]);
 if(!claimed.rowCount)return {state:"busy" as const};
 const start=performance.now(),signal=AbortSignal.timeout(deadlineMs);
 try {
  const result=await withOperationalIo(()=>binding.tick({limit:definition.batchLimit,signal}),true);signal.throwIfAborted();
  if(!Number.isSafeInteger(result.backlog)||result.backlog<0||typeof result.truncated!=="boolean")throw new Error("Invalid maintenance result");
  const oldest=result.oldestDueAt??null;
  if(result.backlog>0&&(!(oldest instanceof Date)||!Number.isFinite(oldest.getTime())||oldest.getTime()>Date.now())||result.backlog===0&&oldest!==null)throw new Error('Invalid maintenance backlog age');
  const completed=await query(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS at)
   UPDATE operations_maintenance_status SET lease_id=NULL,lease_expires_at=NULL,
   last_completed_at=stamp.at,last_success_at=stamp.at,safe_failure=NULL,
   backlog_count=$4,backlog_truncated=$5,duration_ms=$6,code_version=$7,oldest_due_at=$8
   FROM stamp WHERE environment_id=$1 AND class_id=$2 AND lease_id=$3 AND lease_expires_at>clock_timestamp()`,[environmentId,binding.id,leaseId,Math.min(1000,result.backlog),result.truncated||result.backlog>1000,Math.min(360000,Math.ceil(performance.now()-start)),codeVersion,oldest]);
  return {state:completed.rowCount?"pass" as const:"lost_lease" as const};
 }catch{
  await query(`UPDATE operations_maintenance_status SET lease_id=NULL,lease_expires_at=NULL,last_completed_at=clock_timestamp(),
   safe_failure=$4,duration_ms=$5,code_version=$6 WHERE environment_id=$1 AND class_id=$2 AND lease_id=$3`,[environmentId,binding.id,leaseId,signal.aborted?"deadline":"unavailable",Math.min(360000,Math.ceil(performance.now()-start)),codeVersion]);
  return {state:"fail" as const};
 }
}

/** Every class gets its own lane; a slow/failing tick never serializes the others.
 * Stop prevents new work and waits for the already bounded domain ticks. */
export function startMaintenanceScheduler(environmentId:string,codeVersion:string,bindings:MaintenanceBinding[],onResult?:(classId:MaintenanceClassId,result:Awaited<ReturnType<typeof runMaintenanceClass>>)=>void){
 if(!environmentId||!/^[a-f0-9]{40}$/.test(codeVersion))throw Error('Exact maintenance identity required');
 const validated=validateMaintenanceBindings(bindings);
 if(validated.some(row=>!row.configured||!row.enabled))throw Error('All required maintenance classes must be bound');
 let stopping=false;const pending=new Map<string,Promise<unknown>>(),timers:ReturnType<typeof setInterval>[]=[];
 const schedule=(binding:MaintenanceBinding)=>{
  if(stopping||pending.has(binding.id))return;
  const running=runMaintenanceClass(environmentId,codeVersion,binding).catch(()=>({state:'fail' as const})).then(result=>{onResult?.(binding.id,result);return result;}).finally(()=>pending.delete(binding.id));
  pending.set(binding.id,running);
 };
 for(const binding of bindings){const interval=binding.intervalMs??maintenanceClasses.find(row=>row.id===binding.id)!.intervalMs;timers.push(setInterval(()=>schedule(binding),interval));schedule(binding);}
 return {async stop(){stopping=true;for(const timer of timers)clearInterval(timer);await Promise.allSettled([...pending.values()]);}};
}
