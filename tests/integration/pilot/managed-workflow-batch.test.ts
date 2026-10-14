import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openOwnedPilotSuite,requireOwnedPilotDatabase} from '../../fixtures/pilot/environment';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {closeManagedRunBatch} from '../../../lib/server/operations/managed-workflow-batch';
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
it('stops provider reconciliation on actual owner connection loss and retains its uncertain independent intent',async()=>{
 const killer=new Client({connectionString:sourceOwnerUrl});await killer.connect();const pid=Number((await source.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);let providerReads=0,providerCancels=0;
 try{
  await expect(closeManagedRunBatch({...input(),bindings:[{...binding,runId:'wrun_owner_loss'}],provider:{read:async runId=>{providerReads++;return {...binding,runId,status:'running'};},cancel:async()=>{providerCancels++;await killer.query('SELECT pg_terminate_backend($1)',[pid]);}}})).rejects.toThrow();
  expect(providerReads).toBe(1);expect(providerCancels).toBe(1);
  expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents WHERE run_id='wrun_owner_loss'")).rows[0].n).toBe(1);
  expect((await archive.query("SELECT count(*)::int AS n FROM turas_backup.native_closure_observations WHERE run_id='wrun_owner_loss'")).rows[0].n).toBe(0);
 }finally{await killer.end();}
});
