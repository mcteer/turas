import type {Client} from 'pg';
import {z} from 'zod';
import {withRecoveryDatabaseCheckpoint} from './database-checkpoint';
import {bindingSchema,reconcileManagedRun,type ClosureBinding} from './managed-workflow-closure';
import {claimIndependentRunIntent,retainIndependentClosure} from './managed-workflow-journal';
export async function closeManagedRunBatch(input:{source:Client;archive:Client;installationId:string;bindings:ClosureBinding[];sourceVersion:{sourceCommit:string;sourceDigest:string;catalogDigest:string};signal:AbortSignal;provider:{read:(runId:string)=>Promise<unknown>;cancel:(runId:string)=>Promise<unknown>}}){
 const bindings=z.array(bindingSchema).min(1).max(50).parse(input.bindings),first=bindings[0];z.uuid().parse(input.installationId);z.object({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),catalogDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input.sourceVersion);
 if(new Set(bindings.map(row=>row.runId)).size!==bindings.length||bindings.some(row=>row.environmentId!==first.environmentId||row.recoveryId!==first.recoveryId||row.controlRevision!==first.controlRevision||row.projectId!==first.projectId||row.teamId!==first.teamId))throw Error('One exact unique managed closure batch required');
 let connectionLost=false;const onSourceError=()=>{connectionLost=true;};input.source.on('error',onSourceError);
 async function heartbeat(){input.signal.throwIfAborted();if(connectionLost)throw Error('Managed closure owner connection lost');await input.source.query('SELECT 1');input.signal.throwIfAborted();if(connectionLost)throw Error('Managed closure owner connection lost');}
 try{return await withRecoveryDatabaseCheckpoint(input.source,{environmentId:first.environmentId,recoveryId:first.recoveryId,controlRevision:first.controlRevision,signal:input.signal},async()=>{
  const legacy=(await input.source.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime'")).rows;
  if(legacy.length!==1||legacy[0].rolcanlogin!==false||(await input.source.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='turas_runtime'")).rows[0].n!==0)throw Error('Legacy database admission must be retired before native cancellation');
  const results=[];
  for(const binding of bindings){
   input.signal.throwIfAborted();
   const result=await reconcileManagedRun({binding,signal:input.signal,read:async()=>{await heartbeat();return input.provider.read(binding.runId);},cancel:async()=>{await heartbeat();return input.provider.cancel(binding.runId);},claimIntent:async scope=>{await heartbeat();return claimIndependentRunIntent(input.archive,input.installationId,scope,input.signal);}});
   await heartbeat();
   const journal=result.terminalVerified?await retainIndependentClosure(input.archive,input.installationId,result,input.sourceVersion,input.signal):null;
   results.push({...result,journal});if(!result.terminalVerified)break;
  }
  return {contract:'pilot-managed-run-closure-batch-v1',results,requestedRuns:bindings.length,verifiedTerminalRuns:results.filter(row=>row.terminalVerified).length,batchTerminalVerified:results.length===bindings.length&&results.every(row=>row.terminalVerified),allProviderRunsClosed:false,oldDeploymentsClosed:false,paidEffectsReconciled:false,workflowResumed:false,restorationReady:false};
 });}finally{input.source.removeListener('error',onSourceError);}
}
