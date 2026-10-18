import {it,expect} from 'vitest';
import {inventoryManagedRuns,managedRunIdentityDigest} from '../../../lib/server/operations/managed-workflow-inventory';
const run=(id:string,status='completed')=>({runId:'wrun_'+id,deploymentId:'dpl_synthetic',workflowName:'workflow//eve//taskRunWorkflow',status,input:{private:'discarded'}});
const page=(data:unknown[],cursor:string|null=null,hasMore=false)=>({data,cursor,hasMore});
const scope=()=>({signal:AbortSignal.timeout(1000),maxRuns:10,maxPages:4,expectedRunIds:['wrun_app']});
it('traverses every page twice and retains provider-only child runs without closure claims',async()=>{
 const calls:(string|null)[]=[];const result=await inventoryManagedRuns({...scope(),list:async cursor=>{calls.push(cursor);return cursor===null?page([run('app')],'next',true):page([run('child')],'last');}});
 expect(calls).toEqual([null,'next',null,'next']);expect(result.providerOnlyRunIds).toEqual(['wrun_child']);expect(result.repeatedTraversalVerified).toBe(true);expect(result.allProviderRunsClosed).toBe(false);expect(result.providerSnapshotVerified).toBe(false);expect(result.restorationReady).toBe(false);expect(JSON.stringify(result)).not.toContain('discarded');expect(result.identityDigest).toBe(managedRunIdentityDigest([run('child','running'),run('app','failed')]));
});
it('rejects a missing application binding and duplicate expected identities',async()=>{
 await expect(inventoryManagedRuns({...scope(),list:async()=>page([run('other')])})).rejects.toThrow('binding missing');
 await expect(inventoryManagedRuns({...scope(),expectedRunIds:['wrun_app','wrun_app'],list:async()=>page([])})).rejects.toThrow('Unique');
});
it('rejects repeated cursors and empty nonterminal pages',async()=>{
 await expect(inventoryManagedRuns({...scope(),list:async cursor=>page([run(cursor===null?'app':'child')],'same',true)})).rejects.toThrow('cursor did not advance');
 await expect(inventoryManagedRuns({...scope(),list:async()=>page([],'next',true)})).rejects.toThrow('cursor did not advance');
});
it('rejects duplicate provider identities rather than merging incomplete pages',async()=>{
 await expect(inventoryManagedRuns({...scope(),list:async cursor=>page([run('app')],cursor===null?'next':null,cursor===null)})).rejects.toThrow('Duplicate');
});
it('requires explicit pagination completion and a cursor while more pages remain',async()=>{
 await expect(inventoryManagedRuns({...scope(),list:async()=>({data:[run('app')],cursor:null})})).rejects.toThrow();
 await expect(inventoryManagedRuns({...scope(),list:async()=>page([run('app')],null,true)})).rejects.toThrow('cursor did not advance');
});
it('fails finite page run and metadata bounds without claiming a truncated inventory',async()=>{
 await expect(inventoryManagedRuns({...scope(),maxPages:1,list:async()=>page([run('app')],'next',true)})).rejects.toThrow('page bound');
 await expect(inventoryManagedRuns({...scope(),maxRuns:1,list:async()=>page([run('app'),run('child')])})).rejects.toThrow('run bound');
 let pages=0;await expect(inventoryManagedRuns({...scope(),maxRuns:10000,maxPages:200,list:async()=>{const start=pages++*100;return page(Array.from({length:100},(_,i)=>({...run('row'+(start+i)),workflowName:'x'.repeat(512)})),'cursor'+pages,true);}})).rejects.toThrow('metadata byte bound');
});
it('rejects changed run sets or metadata between complete traversals',async()=>{
 for(const changed of [run('other'),run('app','running')]){let calls=0;await expect(inventoryManagedRuns({...scope(),list:async()=>page([++calls===1?run('app'):changed])})).rejects.toThrow('changed between');}
});
it('stops on cancellation before metadata dispatch and rejects malformed run identities',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await expect(inventoryManagedRuns({...scope(),signal:controller.signal,list:async()=>{calls++;return page([]);}})).rejects.toThrow();expect(calls).toBe(0);
 await expect(inventoryManagedRuns({...scope(),list:async()=>page([{...run('app'),deploymentId:'../foreign'}])})).rejects.toThrow();
});
