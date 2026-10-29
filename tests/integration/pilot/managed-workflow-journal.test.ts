import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openOwnedPilotSuite,requireOwnedPilotDatabase,withPilotEnvironment} from '../../fixtures/pilot/environment';
import {claimIndependentRunIntent,retainIndependentClosure} from '../../../lib/server/operations/managed-workflow-journal';
import type {ClosureBinding} from '../../../lib/server/operations/managed-workflow-closure';
let owned:Awaited<ReturnType<typeof openOwnedPilotSuite>>,owner:Client,cold:Client,runtime:Client,id:string,binding:ClosureBinding,observationId:string;
const commit={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)},signal=()=>owned.environment.signal;
const proof=()=>({binding,providerState:'cancelled',terminalVerified:true});
beforeAll(async()=>{
 owned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:180000});
 owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});cold=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await cold.connect();await runtime.connect();
 await owner.query(await readFile('infra/pilot/neon-archive.sql','utf8'));id=randomUUID();await owner.query('INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,$1,$2,8388608)',['pilot-neon-archive-v1',id]);
 await owner.query(await readFile('infra/pilot/neon-archive-007-native-closure.sql','utf8'));await owner.query(await readFile('infra/pilot/neon-archive-008-closure-source.sql','utf8'));
 binding={environmentId:owned.environment.environmentId,recoveryId:randomUUID(),controlRevision:2,projectId:'prj_synthetic',teamId:'team_synthetic',runId:'wrun_synthetic',deploymentId:'dpl_synthetic',workflowName:'workflow//eve//workflowEntry'};
},60000);
afterAll(async()=>{await runtime?.end();await cold?.end();await owner?.end();await owned?.close();});
it('admits exactly one durable cancellation intent across two concurrent owner connections',async()=>{
 const result=await Promise.all([claimIndependentRunIntent(owner,id,binding,signal()),claimIndependentRunIntent(cold,id,binding,signal())]);expect(result.filter(Boolean)).toHaveLength(1);
});
it('cold replays the existing exact intent without claiming another dispatch',async()=>{expect(await claimIndependentRunIntent(cold,id,binding,signal())).toBe(false);});
it('rejects a changed control revision for an existing run intent',async()=>{await expect(claimIndependentRunIntent(cold,id,{...binding,controlRevision:3},signal())).rejects.toThrow('intent differs');});
it('retains cancellation intents against deletion even under owner authority',async()=>{await expect(owner.query('DELETE FROM turas_backup.native_cancel_intents')).rejects.toThrow('immutable');});
it('retains the original cancellation scope against mutation',async()=>{await expect(owner.query('UPDATE turas_backup.native_cancel_intents SET control_revision=5')).rejects.toThrow('immutable');});
it('withholds cancellation replay records from the application runtime',async()=>{await expect(runtime.query('SELECT * FROM turas_backup.native_cancel_intents')).rejects.toMatchObject({code:'42501'});});
it('refuses a different independent archive installation without adding a row',async()=>{
 await expect(claimIndependentRunIntent(cold,randomUUID(),{...binding,runId:'wrun_foreign'},signal())).rejects.toThrow('owner required');expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.native_cancel_intents')).rows[0].n).toBe(1);
});
it('cold replays a terminal observation with the same immutable identity',async()=>{
 const first=await retainIndependentClosure(owner,id,proof(),commit,signal());observationId=first.id;expect(first.replayed).toBe(false);expect(await retainIndependentClosure(cold,id,proof(),commit,signal())).toEqual({id:observationId,replayed:true});
});
it('refuses a running or unverified run as terminal evidence',async()=>{await expect(retainIndependentClosure(owner,id,{...proof(),providerState:'running',terminalVerified:false},commit,signal())).rejects.toThrow();});
it('rejects a different terminal outcome rather than changing the existing observation',async()=>{await expect(retainIndependentClosure(owner,id,{...proof(),providerState:'completed'},commit,signal())).rejects.toThrow('closure differs');});
it('retains terminal observations against owner deletion',async()=>{await expect(owner.query('DELETE FROM turas_backup.native_closure_observations')).rejects.toThrow('immutable');});
it('withholds terminal observation payloads from application runtime',async()=>{await expect(runtime.query('SELECT * FROM turas_backup.native_closure_observations')).rejects.toMatchObject({code:'42501'});});

it('refuses an older source proof when code changed under the same Git head',async()=>{await expect(retainIndependentClosure(owner,id,proof(),{...commit,sourceDigest:'d'.repeat(64)},signal())).rejects.toThrow('closure differs');});
it('refuses to invent provenance when upgrading an archive with an existing legacy closure observation',async()=>{
 await withPilotEnvironment(async environment=>{
  const legacy=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await legacy.connect();
  try{
   await legacy.query(await readFile('infra/pilot/neon-archive.sql','utf8'));const installation=randomUUID();await legacy.query('INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,$1,$2,8388608)',['pilot-neon-archive-v1',installation]);await legacy.query(await readFile('infra/pilot/neon-archive-007-native-closure.sql','utf8'));
   // Explicit old-schema metadata fixture, not a real terminal provider proof.
   await legacy.query("INSERT INTO turas_backup.native_closure_observations(id,installation_id,project_id,run_id,environment_id,recovery_id,control_revision,binding_digest,provider_state,source_commit,provider_proof_digest) VALUES($1,$2,'prj_synthetic','wrun_legacy',$3,$4,2,$5,'cancelled',$6,$7)",[randomUUID(),installation,environment.environmentId,randomUUID(),'a'.repeat(64),commit.sourceCommit,'b'.repeat(64)]);
   const before=(await legacy.query('SELECT * FROM turas_backup.native_closure_observations')).rows;
   await expect(legacy.query(await readFile('infra/pilot/neon-archive-008-closure-source.sql','utf8'))).rejects.toThrow('explicit reconciliation');await legacy.query('ROLLBACK');
   expect((await legacy.query('SELECT * FROM turas_backup.native_closure_observations')).rows).toEqual(before);
   expect((await legacy.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='turas_backup' AND table_name='native_closure_observations' AND column_name IN('source_digest','catalog_digest')")).rows[0].n).toBe(0);
  }finally{await legacy.end();}
 },{postgresMajor:18,deadlineMs:120000});
},60000);
