import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openOwnedPilotSuite,requireOwnedPilotDatabase} from '../../fixtures/pilot/environment';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {closeManagedRunBatch} from '../../../lib/server/operations/managed-workflow-batch';
import {closeManagedRunInventory} from '../../../lib/server/operations/managed-workflow-inventory-close';
import {managedRunIdentityDigest} from '../../../lib/server/operations/managed-workflow-inventory';
import type {ClosureBinding} from '../../../lib/server/operations/managed-workflow-closure';
let sourceOwned:Awaited<ReturnType<typeof openOwnedPilotSuite>>,archiveOwned:Awaited<ReturnType<typeof openOwnedPilotSuite>>,source:Client,archive:Client,installationId:string,binding:ClosureBinding,sourceOwnerUrl:string;
let reads=0,cancels=0;const states=new Map<string,string>();
const provider={read:async(runId:string)=>{reads++;return {...binding,runId,status:states.get(runId)??'running'};},cancel:async(runId:string)=>{cancels++;states.set(runId,'cancelled');}};
const input=()=>({source,archive,installationId,bindings:[binding,{...binding,runId:'wrun_second'}],sourceVersion:{sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)},signal:sourceOwned.environment.signal,provider});
// Two actual owned databases with controlled provider responses. No real native
// run is cancelled, no independent cloud placement or full recovery is claimed.
beforeAll(async()=>{
 sourceOwned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:240000});sourceOwnerUrl=requireOwnedPilotDatabase(process.env,true);source=new Client({connectionString:sourceOwnerUrl});await source.connect();
 archiveOwned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:180000});archive=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await archive.connect();
 await archive.query(await readFile('infra/pilot/neon-archive.sql','utf8'));installationId=randomUUID();await archive.query('INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,$1,$2,8388608)',['pilot-neon-archive-v1',installationId]);await archive.query(await readFile('infra/pilot/neon-archive-007-native-closure.sql','utf8'));await archive.query(await readFile('infra/pilot/neon-archive-008-closure-source.sql','utf8'));
 const recoveryId=randomUUID();await source.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$1 WHERE environment_id=$2",[recoveryId,sourceOwned.environment.environmentId]);const revision=Number((await source.query('SELECT revision FROM operations_control')).rows[0].revision);
 binding={environmentId:sourceOwned.environment.environmentId,recoveryId,controlRevision:revision,projectId:'prj_synthetic',teamId:'team_synthetic',runId:'wrun_synthetic',deploymentId:'dpl_synthetic',workflowName:'workflow//eve//workflowEntry'};
},120000);
afterAll(async()=>{await archive?.end();await archiveOwned?.close();await source?.end();await sourceOwned?.close();});
it('withholds provider reads and cancellation until legacy database admission is retired',async()=>{await expect(closeManagedRunBatch(input())).rejects.toThrow('Legacy database admission');expect(reads).toBe(0);expect(cancels).toBe(0);});
it('cancels the exact bounded batch under a locked owner fence and retains independent terminal receipts',async()=>{
 await closeRuntimePool();await source.query('ALTER ROLE turas_runtime NOLOGIN');await source.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='turas_runtime'");const result=await closeManagedRunBatch(input());
 expect(result).toMatchObject({batchTerminalVerified:true,verifiedTerminalRuns:2,restorationReady:false,allProviderRunsClosed:false,paidEffectsReconciled:false});expect(cancels).toBe(2);expect(sourceOwned.environment.environmentId).not.toBe(archiveOwned.environment.environmentId);
 expect((await archive.query('SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents')).rows[0].n).toBe(2);expect((await archive.query('SELECT count(*)::int AS n FROM turas_backup.native_closure_observations')).rows[0].n).toBe(2);
});
it('reconciles a repeated batch with reads and existing receipts without another cancellation',async()=>{const result=await closeManagedRunBatch(input());expect(result.batchTerminalVerified).toBe(true);expect(cancels).toBe(2);expect(result.results.every(row=>row.journal?.replayed)).toBe(true);});
it('rejects a stale recovery control revision before any provider read',async()=>{const before=reads;await expect(closeManagedRunBatch({...input(),bindings:[{...binding,controlRevision:binding.controlRevision+1}]})).rejects.toThrow('Exact locked');expect(reads).toBe(before);});
it('rejects duplicated run identities before touching the provider',async()=>{const before=reads;await expect(closeManagedRunBatch({...input(),bindings:[binding,binding]})).rejects.toThrow('unique managed');expect(reads).toBe(before);});
function inventoryPlan(runs:{runId:string;deploymentId:string;workflowName:string;status:string}[]){
 return {contract:'pilot-managed-inventory-closure-plan-v1' as const,...input().sourceVersion,environmentId:binding.environmentId,recoveryId:binding.recoveryId,controlRevision:binding.controlRevision,projectId:binding.projectId,teamId:binding.teamId,target:'preview' as const,expectedIdentityDigest:managedRunIdentityDigest(runs),expectedRuns:runs.length,maximumRuns:Math.max(1,runs.length+1),maximumPages:2,expiresAt:new Date(Date.now()+120000).toISOString()};
}
const metadata=(runId:string,status='running'):{runId:string;deploymentId:string;workflowName:string;status:string}=>({runId,deploymentId:binding.deploymentId,workflowName:binding.workflowName,status});
it('closes and resumes a complete 53-run inventory through bounded batches without cancelling twice',async()=>{
 const rows=Array.from({length:53},(_,i)=>metadata('wrun_inventory_'+String(i).padStart(3,'0')));rows[25].workflowName='workflow//eve//workflowToolRunWorkflow';rows[25].status='completed';const plan=inventoryPlan(rows);let cancelled=0,before=0;const sizes:number[]=[];
 const provider={list:async()=>({data:rows,cursor:null,hasMore:false}),read:async(id:string)=>rows.find(row=>row.runId===id),cancel:async(id:string)=>{cancelled++;rows.find(row=>row.runId===id)!.status='cancelled';}};
 const run=()=>closeManagedRunInventory({source,archive,installationId,plan,signal:sourceOwned.environment.signal,provider,beforeBatch:async()=>{before++;},onBatch:async(_index,result)=>{sizes.push(result.requestedRuns);}});
 expect(await run()).toMatchObject({requestedRuns:53,verifiedTerminalRuns:53,batches:2,enumeratedInventoryTerminalVerified:true,independentClosureReceiptsRetained:true,allProviderRunsClosed:false,oldDeploymentsClosed:false,restorationReady:false});
 expect(sizes).toEqual([50,3]);expect(cancelled).toBe(52);expect(before).toBe(2);
 expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_closure_observations WHERE run_id LIKE 'wrun_inventory_%'")).rows[0].n).toBe(53);
 expect((await run()).enumeratedInventoryTerminalVerified).toBe(true);expect(cancelled).toBe(52);
});
it('stops on provider identity drift without cancelling newly discovered runs',async()=>{
 const row=metadata('wrun_drift_original'),extra=metadata('wrun_drift_new'),plan=inventoryPlan([row]);let introduced=false,cancelled=0;
 await expect(closeManagedRunInventory({source,archive,installationId,plan,signal:sourceOwned.environment.signal,provider:{list:async()=>({data:introduced?[row,extra]:[row],cursor:null,hasMore:false}),read:async()=>row,cancel:async()=>{cancelled++;row.status='cancelled';introduced=true;}},beforeBatch:async()=>{},onBatch:async()=>{}})).rejects.toThrow('inventory or source changed');
 expect(cancelled).toBe(1);expect(extra.status).toBe('running');
 expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents WHERE run_id='wrun_drift_new'")).rows[0].n).toBe(0);
});
it('retains an uncertain inventory cancellation intent and refuses automatic retry on resume',async()=>{
 const row=metadata('wrun_inventory_uncertain'),plan=inventoryPlan([row]);let cancelled=0;
 const run=()=>closeManagedRunInventory({source,archive,installationId,plan,signal:sourceOwned.environment.signal,provider:{list:async()=>({data:[row],cursor:null,hasMore:false}),read:async()=>row,cancel:async()=>{cancelled++;throw Error('Controlled provider timeout');}},beforeBatch:async()=>{},onBatch:async()=>{}});
 await expect(run()).rejects.toThrow('closure uncertain');await expect(run()).rejects.toThrow('closure uncertain');expect(cancelled).toBe(1);
 expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents WHERE run_id='wrun_inventory_uncertain'")).rows[0].n).toBe(1);
 expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_closure_observations WHERE run_id='wrun_inventory_uncertain'")).rows[0].n).toBe(0);
});
it('rejects a foreign planned identity digest and unsupported workflow kind before cancellation',async()=>{
 const row=metadata('wrun_unapproved_kind'),plan=inventoryPlan([row]);let rows=[row],cancelled=0;
 const run=(selected:typeof plan)=>closeManagedRunInventory({source,archive,installationId,plan:selected,signal:sourceOwned.environment.signal,provider:{list:async()=>({data:rows,cursor:null,hasMore:false}),read:async()=>row,cancel:async()=>{cancelled++;}},beforeBatch:async()=>{},onBatch:async()=>{}});
 await expect(run({...plan,expectedIdentityDigest:'f'.repeat(64)})).rejects.toThrow('planned managed inventory differs');
 row.workflowName='workflow//unknown//not-approved';await expect(run(inventoryPlan([row]))).rejects.toThrow();expect(cancelled).toBe(0);
 row.workflowName='workflow//eve//workflowToolRunWorkflow';rows=[metadata('wrun_earlier_normal'),row];
 await expect(run(inventoryPlan(rows))).rejects.toThrow('already be terminal');expect(cancelled).toBe(0);
 expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents WHERE run_id=ANY($1::text[])",[rows.map(item=>item.runId)])).rows[0].n).toBe(0);
});
it('verifies an explicitly empty provider inventory and still requires the independent archive',async()=>{
 const plan=inventoryPlan([]);let listed=0;
 const run=(installation=installationId)=>closeManagedRunInventory({source,archive,installationId:installation,plan,signal:sourceOwned.environment.signal,provider:{list:async()=>{listed++;return {data:[],cursor:null,hasMore:false};},read:async()=>{throw Error('No run expected');},cancel:async()=>{throw Error('No cancellation expected');}},beforeBatch:async()=>{throw Error('No batch expected');},onBatch:async()=>{throw Error('No batch expected');}});
 await expect(run(randomUUID())).rejects.toThrow('Exact independent closure archive');expect(listed).toBe(0);
 expect(await run()).toMatchObject({requestedRuns:0,verifiedTerminalRuns:0,batches:0,enumeratedInventoryTerminalVerified:true,oldDeploymentsClosed:false,allProviderRunsClosed:false,restorationReady:false});expect(listed).toBe(4);
});
it('stops provider reconciliation on actual owner connection loss and retains its uncertain independent intent',async()=>{
 const killer=new Client({connectionString:sourceOwnerUrl});await killer.connect();const pid=Number((await source.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);let providerReads=0,providerCancels=0;
 try{
  await expect(closeManagedRunBatch({...input(),bindings:[{...binding,runId:'wrun_owner_loss'}],provider:{read:async runId=>{providerReads++;return {...binding,runId,status:'running'};},cancel:async()=>{providerCancels++;await killer.query('SELECT pg_terminate_backend($1)',[pid]);}}})).rejects.toThrow();
  expect(providerReads).toBe(1);expect(providerCancels).toBe(1);
  expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents WHERE run_id='wrun_owner_loss'")).rows[0].n).toBe(1);
  expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_closure_observations WHERE run_id='wrun_owner_loss'")).rows[0].n).toBe(0);
 }finally{await killer.end();}
});
