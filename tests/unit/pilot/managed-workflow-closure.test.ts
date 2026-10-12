import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {reconcileManagedRun,type ClosureBinding} from '../../../lib/server/operations/managed-workflow-closure';
const binding:ClosureBinding={environmentId:'synthetic-owned',recoveryId:randomUUID(),controlRevision:2,projectId:'prj_synthetic',teamId:'team_synthetic',runId:'wrun_synthetic',deploymentId:'dpl_synthetic',workflowName:'workflow//eve//workflowEntry'};
it.each(['completed','failed','cancelled'] as const)('reads an already %s run without creating an intent or dispatching cancellation',async status=>{
 let writes=0;const result=await reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>({...binding,status}),claimIntent:async()=>{throw Error('Unexpected intent');},cancel:async()=>{writes++;}});
 expect(result.terminalVerified).toBe(true);expect(writes).toBe(0);expect(result.paidEffectsReconciled).toBe(false);expect(result.restorationReady).toBe(false);
});
it.each([false,true])('requires a fresh terminal read after cancellation with uncertain response %s',async fails=>{
 let reads=0,writes=0,intents=0;const result=await reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>({...binding,status:++reads===1?'running':'cancelled'}),claimIntent:async()=>{intents++;return true;},cancel:async()=>{expect(intents).toBe(1);writes++;if(fails)throw Error('Unknown response');}});
 expect(result.terminalVerified).toBe(true);expect(result.cancelOutcomeUncertain).toBe(fails);expect(writes).toBe(1);expect(reads).toBe(2);
});
it('reconciles an existing intent with reads only and withholds a still running run',async()=>{
 let writes=0;const result=await reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>({...binding,status:'running'}),claimIntent:async()=>false,cancel:async()=>{writes++;}});
 expect(result.terminalVerified).toBe(false);expect(result.cancelOutcomeUncertain).toBe(true);expect(writes).toBe(0);
});
it('rejects a different deployment before cancellation',async()=>{
 let writes=0;await expect(reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>({...binding,deploymentId:'dpl_foreign',status:'running'}),claimIntent:async()=>true,cancel:async()=>{writes++;}})).rejects.toThrow('binding differs');expect(writes).toBe(0);
});
it('does not accept a cancellation response when the independent terminal read fails',async()=>{
 let reads=0,writes=0;await expect(reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>{if(++reads===2)throw Error('Unavailable read');return {...binding,status:'running'};},claimIntent:async()=>true,cancel:async()=>{writes++;return {...binding,status:'cancelled'};}})).rejects.toThrow('Unavailable read');expect(writes).toBe(1);
});
it('rejects a different workflow definition before cancellation',async()=>{
 let writes=0;await expect(reconcileManagedRun({binding,signal:AbortSignal.timeout(1000),read:async()=>({...binding,workflowName:'workflow//foreign//entry',status:'running'}),claimIntent:async()=>true,cancel:async()=>{writes++;}})).rejects.toThrow('binding differs');expect(writes).toBe(0);
});
