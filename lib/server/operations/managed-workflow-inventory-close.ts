import type {Client} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withRecoveryDatabaseCheckpoint} from './database-checkpoint';
import {bindingSchema,legacyToolRunWorkflow} from './managed-workflow-closure';
import {closeManagedRunBatch} from './managed-workflow-batch';
import {inventoryManagedRuns,managedRunIdentityDigest} from './managed-workflow-inventory';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const managedInventoryClosurePlanSchema=z.strictObject({contract:z.literal('pilot-managed-inventory-closure-plan-v1'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),target:z.enum(['preview','production']),expectedIdentityDigest:digest,expectedRuns:z.number().int().min(0).max(10000),maximumRuns:z.number().int().min(1).max(10000),maximumPages:z.number().int().min(1).max(200),expiresAt:z.iso.datetime({offset:true})}).superRefine((value,ctx)=>{
 if(value.expectedRuns>value.maximumRuns)ctx.addIssue({code:'custom',message:'Finite complete managed inventory bound required'});
});
/** Finite exact-inventory orchestration. Each <=50-run batch retains the
 * existing independent once-only intents. Drift/uncertainty stops the command;
 * resuming never retries a cancellation whose intent already exists. This is
 * terminal proof of the enumerated identities, not retired old deployments. */
export async function closeManagedRunInventory(input:{source:Client;archive:Client;installationId:string;plan:z.infer<typeof managedInventoryClosurePlanSchema>;signal:AbortSignal;provider:{list:(cursor:string|null)=>Promise<unknown>;read:(runId:string)=>Promise<unknown>;cancel:(runId:string)=>Promise<unknown>};beforeBatch:()=>Promise<void>;onBatch:(index:number,result:Awaited<ReturnType<typeof closeManagedRunBatch>>)=>Promise<void>}){
 const plan=managedInventoryClosurePlanSchema.parse(input.plan);z.uuid().parse(input.installationId);
 const scope={environmentId:plan.environmentId,recoveryId:plan.recoveryId,controlRevision:plan.controlRevision},version={sourceCommit:plan.sourceCommit,sourceDigest:plan.sourceDigest,catalogDigest:plan.catalogDigest};
 let connectionLost=false;const lost=()=>{connectionLost=true;};input.source.on('error',lost);
 async function heartbeat(){input.signal.throwIfAborted();if(connectionLost||Date.now()>=Date.parse(plan.expiresAt))throw Error('Managed inventory closure authority ended');await input.source.query('SELECT 1');input.signal.throwIfAborted();if(connectionLost)throw Error('Managed inventory closure owner lost');}
 async function inspect(){
  await heartbeat();
  return withRecoveryDatabaseCheckpoint(input.source,{...scope,signal:input.signal},async boundary=>{
   const role=(await input.source.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime'")).rows;
   if(role.length!==1||role[0].rolcanlogin!==false||(await input.source.query("SELECT 1 FROM pg_stat_activity WHERE usename='turas_runtime' LIMIT 1")).rowCount)throw Error('Legacy database admission must be retired before inventory closure');
   const rows=(await input.source.query('SELECT id,eve_session_id FROM conversations WHERE environment_id=$1 AND eve_session_id IS NOT NULL ORDER BY id LIMIT 10001',[scope.environmentId])).rows;
   if(rows.length>10000)throw Error('Managed application binding bound exceeded');
   const inventory=await inventoryManagedRuns({list:async cursor=>{await heartbeat();return input.provider.list(cursor);},signal:input.signal,maxRuns:plan.maximumRuns,maxPages:plan.maximumPages,expectedRunIds:[...new Set(rows.map(row=>String(row.eve_session_id)))]});
   await heartbeat();return {inventory,applicationDigest:recoveryDigest(rows),sourceStateDigest:boundary.currentStateDigest};
  });
 }
 try{
  const archive=(await input.archive.query("SELECT installation_id,version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) AS owner FROM turas_backup.contract")).rows;
  if(archive.length!==1||archive[0].installation_id!==input.installationId||archive[0].version!=='pilot-neon-archive-v1'||archive[0].owner!==true)throw Error('Exact independent closure archive required');
  const initial=await inspect();
  if(initial.inventory.runs.length!==plan.expectedRuns||initial.inventory.identityDigest!==plan.expectedIdentityDigest)throw Error('Exact planned managed inventory differs');
  // Validate every workflow kind before any cancellation, including provider-only runs.
  if(initial.inventory.runs.some(run=>run.workflowName===legacyToolRunWorkflow&&!['completed','failed','cancelled'].includes(run.status)))throw Error('Legacy tool workflow must already be terminal before any managed cancellation');
  const bindings=initial.inventory.runs.map(run=>bindingSchema.parse({...scope,projectId:plan.projectId,teamId:plan.teamId,runId:run.runId,deploymentId:run.deploymentId,workflowName:run.workflowName}));
  let batches=0,terminalRuns=0;
  for(let offset=0;offset<bindings.length;offset+=50){
   await heartbeat();await input.beforeBatch();await heartbeat();
   const result=await closeManagedRunBatch({source:input.source,archive:input.archive,installationId:input.installationId,bindings:bindings.slice(offset,offset+50),sourceVersion:version,signal:input.signal,provider:{read:async id=>{await heartbeat();return input.provider.read(id);},cancel:async id=>{await heartbeat();return input.provider.cancel(id);}}});
   await input.onBatch(batches,result);batches++;terminalRuns+=result.verifiedTerminalRuns;
   if(!result.batchTerminalVerified)throw Error('Managed inventory closure uncertain; existing intents must not be retried');
  }
  const final=await inspect();
  if(final.inventory.runs.length!==plan.expectedRuns||managedRunIdentityDigest(final.inventory.runs)!==plan.expectedIdentityDigest||final.applicationDigest!==initial.applicationDigest||final.sourceStateDigest!==initial.sourceStateDigest)throw Error('Managed inventory or source changed during closure');
  if(final.inventory.runs.some(run=>!['completed','failed','cancelled'].includes(run.status))||terminalRuns!==plan.expectedRuns)throw Error('Enumerated managed runs remain active');
  return {contract:'pilot-managed-inventory-closure-v1' as const,...scope,...version,projectId:plan.projectId,teamId:plan.teamId,target:plan.target,identityDigest:plan.expectedIdentityDigest,initialInventoryDigest:initial.inventory.inventoryDigest,finalInventoryDigest:final.inventory.inventoryDigest,sourceStateDigest:final.sourceStateDigest,applicationBindingsDigest:final.applicationDigest,requestedRuns:plan.expectedRuns,verifiedTerminalRuns:terminalRuns,batches,providerOnlyRuns:final.inventory.providerOnlyRunIds.length,pages:{initial:initial.inventory.pages,final:final.inventory.pages},completedAt:new Date().toISOString(),enumeratedInventoryTerminalVerified:true as const,independentClosureReceiptsRetained:true as const,independentPlacementVerified:false as const,oldDeploymentsClosed:false as const,allProviderRunsClosed:false as const,paidEffectsReconciled:false as const,workflowResumed:false as const,restorationReady:false as const};
 }finally{input.source.removeListener('error',lost);}
}
