import {Client} from 'pg';
import {vi} from 'vitest';
import {LocalJobExecutor} from '../../../lib/server/jobs/local-executor';
import type {ExecutionRequest} from '../../../lib/server/jobs/executor';
import type {WorkforceClaim} from '../../../lib/server/staffing/jobs';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {workforceRecoveryFailureMetadata} from '../../../scripts/ci-process-diagnostics';

/** Forward the original native calls unchanged. Buffer only fixed observations;
 * query the exact owned claim and emit them only after the original failure. */
export async function observeWorkforceRecovery(surface:string,claim:WorkforceClaim,run:()=>Promise<void>,verify:()=>Promise<void>){
 const native:Record<string,unknown>[]=[];
 const original=LocalJobExecutor.prototype.execute;
 const record=(value:Record<string,unknown>)=>{native.push(value);if(native.length>4)native.shift();};
 const descriptor=Object.getOwnPropertyDescriptor(LocalJobExecutor.prototype,'execute');
 let restore:()=>void=()=>undefined;
 try{const observer=vi.spyOn(LocalJobExecutor.prototype,'execute').mockImplementation(async function(this:LocalJobExecutor,request:ExecutionRequest){
  const selected=(request.kind==='artifact-scan'||request.kind==='workforce-parse')&&request.inputs[0]?.digest===claim.originalDigest;
  try{const output=await original.call(this,request);if(selected)try{record({kind:request.kind,exitCode:output.exitCode,durationMs:output.durationMs,safeFailure:output.safeFailure,error:'none',scanClean:request.kind==='artifact-scan'?/\/input: OK\b/.test(output.stdout.toString('utf8')):null,scanFound:request.kind==='artifact-scan'?output.stdout.includes('FOUND'):null});}catch{/* Preserve the original native result. */}return output;}
  catch(error){if(selected)try{const message=error instanceof Error&&typeof error.message==='string'?error.message:'';record({kind:request.kind,error:/deadline/i.test(message)?'deadline':message==='Owned execution cleanup unverified'?'cleanup':message==='Local execution unavailable'?'unavailable':/output exceeds|diagnostics exceed/i.test(message)?'output_limit':/source changed/i.test(message)?'source_changed':'other'});}catch{/* Preserve the original native failure. */}throw error;}
 });
 restore=()=>{try{observer.mockRestore();}finally{if(descriptor)Object.defineProperty(LocalJobExecutor.prototype,'execute',descriptor);}};
 }catch{try{if(descriptor)Object.defineProperty(LocalJobExecutor.prototype,'execute',descriptor);}catch{/* Preserve original execution if observation cannot be installed. */}}
 try{try{await run();}finally{try{restore();}catch{/* Preserve the original outcome if observer retirement fails. */}}await verify();}
 catch(error){
  let state:Record<string,unknown>={diagnosticUnavailable:true};
  try{
   const client=new Client({connectionString:requireOwnedPilotDatabase(process.env,true),connectionTimeoutMillis:500,query_timeout:500,statement_timeout:500,lock_timeout:200});
   client.on('error',()=>undefined);
   let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
   const read=(async()=>{try{await client.connect();if(closed)return {diagnosticUnavailable:true};const result=await client.query('SELECT s.state AS "sourceState",j.state AS "jobState",j.error_code AS "errorCode",j.attempt_number AS "attemptNumber",s.current_version_id=$2::uuid AS "currentVersionMatches",j.lease_expires_at>clock_timestamp() AS "leaseActive",j.deadline_at>clock_timestamp() AS "deadlineActive" FROM workforce_sources s JOIN workforce_import_jobs j ON j.id=$3 AND j.environment_id=s.environment_id AND j.workspace_id=s.workspace_id WHERE s.id=$1 AND s.environment_id=$4 AND s.workspace_id=$5 AND j.source_version_id=$2',[claim.sourceId,claim.sourceVersionId,claim.jobId,process.env.TURAS_ENVIRONMENT_ID,claim.workspaceId]);return result.rows[0]??{diagnosticUnavailable:true};}catch{return {diagnosticUnavailable:true};}})();
   try{state=await Promise.race([read,new Promise<Record<string,unknown>>(done=>{timer=setTimeout(()=>{closed=true;client.connection.stream.destroy();done({diagnosticUnavailable:true});},1000);})]);}
   finally{closed=true;clearTimeout(timer);client.connection.stream.destroy();void client.end().catch(()=>undefined);}
  }catch{/* Preserve the original failure even if observation is unavailable. */}
  try{process.stderr.write(JSON.stringify(workforceRecoveryFailureMetadata({surface,...state,native}))+'\n');}catch{/* Observation cannot replace the original failure. */}
  throw error;
 }
}
