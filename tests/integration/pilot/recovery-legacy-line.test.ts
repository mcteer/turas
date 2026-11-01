import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {expect,it} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {reconcileOwnedCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';
import {auditRecoveredRequestFences} from '../../../lib/server/operations/recovery-replay-audit';
import {lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';

it('keeps old whole-line denials across fact-index migration and audits inherited fences',async()=>withPilotEnvironment(async owned=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});
 await owner.connect();await runtime.connect();
 try{
  const customer=(await owner.query('SELECT id,workspace_id FROM customer_references LIMIT 1')).rows[0],principal=(await owner.query('SELECT id FROM principals LIMIT 1')).rows[0];
  const conversation=randomUUID(),native='wrun_'+randomUUID();
  await owner.query("INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title) VALUES($1,$2,$3,$4,$5,$6,'unbound','Recovery line')",[conversation,owned.environmentId,customer.workspace_id,customer.id,principal.id,randomUUID()]);
  await owner.query("INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,event_type,emitted_at) VALUES($1,$2,$3,7,'fixture',clock_timestamp())",[randomUUID(),conversation,native]);
  const old=await captureRecoveryDenialSnapshot(owner,owned.environmentId,owned.signal);
  expect(old.schemaVersion).toBe(82);
  await owned.upgradeToCurrent();
  const scope=await lockAuthorityTarget(owner,owned.environmentId,old,old.capturedAt);
  await reconcileOwnedCredentialDenials(owner,old,scope);
  // Delete only the owned restored fixture row, then try a different fact on
  // that same line. The old denial must remain broad, not fabricated fact zero.
  await owner.query('DELETE FROM event_projections WHERE conversation_id=$1',[conversation]);
  await expect(runtime.query("INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,stream_fact_index,event_type,emitted_at) VALUES($1,$2,$3,7,1,'fixture',clock_timestamp())",[randomUUID(),conversation,native])).rejects.toThrow('Recovered permanent request cannot be repeated');
  const inherited=await captureRecoveryDenialSnapshot(owner,owned.environmentId,owned.signal),currentScope={...scope,snapshotDigest:inherited.snapshotDigest};
  expect(inherited.tables.find(t=>t.name==='event_projections')!.replayKeyColumns).toContainEqual(['conversation_id','stream_fact_index','stream_index']);
  expect(inherited.tables.find(t=>t.name==='operations_replay_fences')!.rows.some(row=>JSON.stringify(row.identity.key_columns)===JSON.stringify(['conversation_id','stream_index']))).toBe(true);
  await reconcileOwnedCredentialDenials(owner,inherited,currentScope);
  expect(await auditRecoveredRequestFences(owner,inherited,currentScope)).toMatchObject({permanentRequestFencesVerified:true,authorityGranted:false});
  // Current snapshots must still declare the complete actual tuple inventory.
  const invalid=structuredClone(inherited),entry=invalid.tables.find(t=>t.name==='event_projections')!;
  entry.replayKeyColumns=entry.replayKeyColumns!.map(columns=>columns.includes('stream_fact_index')?['conversation_id','stream_index']:columns);
  const {snapshotDigest:_digest,currentAuthorityVerified:_authority,replayReconciled:_replay,restorationReady:_ready,...content}=invalid;
  invalid.snapshotDigest=recoveryDigest(content);
  await expect(auditRecoveredRequestFences(owner,invalid,{...currentScope,snapshotDigest:invalid.snapshotDigest})).rejects.toThrow('Complete actual business replay indexes required');
  await owner.query('ALTER TABLE event_projections DISABLE TRIGGER recovered_request_replay');
  await expect(reconcileOwnedCredentialDenials(owner,inherited,currentScope)).rejects.toThrow('Actual permanent replay guard unavailable');
  await owner.query('ALTER TABLE event_projections ENABLE TRIGGER recovered_request_replay');

 }finally{await runtime.end();await owner.end();}
},{priorSchema:82,postgresMajor:18,deadlineMs:180000}),210000);
