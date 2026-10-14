import {z} from 'zod';
export const bindingSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),runId:z.string().regex(/^wrun_[A-Za-z0-9_-]{1,240}$/),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),workflowName:z.enum(['workflow//eve//workflowEntry','workflow//eve//sessionTimeoutWorkflow','workflow//eve//taskRunWorkflow','workflow//eve//turnWorkflow'])});
const metadata=z.object({runId:z.string(),deploymentId:z.string(),workflowName:z.string(),status:z.enum(['pending','running','completed','failed','cancelled'])});
export type ClosureBinding=z.infer<typeof bindingSchema>;
export type RunMetadata=z.infer<typeof metadata>;
/** Caller must hold exact locked owner fence and verify retired admission. The
 * durable claim happens before cancellation; an existing claim permits reads
 * only, even if the earlier process died before dispatch. No cost is settled. */
export async function reconcileManagedRun(input:{binding:ClosureBinding;signal:AbortSignal;read:()=>Promise<unknown>;cancel:()=>Promise<unknown>;claimIntent:(binding:ClosureBinding)=>Promise<boolean>}){
 const binding=bindingSchema.parse(input.binding);input.signal.throwIfAborted();let dispatched=false,uncertain=false;
 async function current(){input.signal.throwIfAborted();const run=metadata.parse(await input.read());if(run.runId!==binding.runId||run.deploymentId!==binding.deploymentId||run.workflowName!==binding.workflowName)throw Error('Exact managed run binding differs');return run;}
 const initial=await current();
 const terminal=(state:RunMetadata['status'])=>state==='completed'||state==='failed'||state==='cancelled';
 if(!terminal(initial.status)){
  const claimed=await input.claimIntent(binding);input.signal.throwIfAborted();
  if(claimed){dispatched=true;try{await input.cancel();}catch{uncertain=true;}}
  // Never use a cancellation response alone as terminal proof. A failed read or
  // still-active status preserves an unknown outcome, and no retry is admitted.
  const final=await current();
  return {binding,providerState:final.status,terminalVerified:terminal(final.status),cancelDispatched:dispatched,cancelOutcomeUncertain:uncertain||!terminal(final.status),paidEffectsReconciled:false,workflowResumed:false,restorationReady:false};
 }
 return {binding,providerState:initial.status,terminalVerified:true,cancelDispatched:false,cancelOutcomeUncertain:false,paidEffectsReconciled:false,workflowResumed:false,restorationReady:false};
}
