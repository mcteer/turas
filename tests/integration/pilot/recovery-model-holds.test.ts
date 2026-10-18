import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAuthorityEnvironment,coldAuthorityProof,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {reconcileOwnedCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';

it('retains missing post-backup token and dollar operations without refunding their original scopes',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary');
 const {conversation}=await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Synthetic recovery accounting'});
 const message=randomUUID(),attempt=randomUUID(),ordinary=randomUUID(),budget=randomUUID(),parity=randomUUID();
 await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Synthetic metadata test')",[message,conversation.id,randomUUID()]);
 await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','running',clock_timestamp()+interval '5 minutes')",[attempt,conversation.id,message]);
 await owner.query('INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens) VALUES($1,0)',[conversation.id]);
 await owner.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,8192)',[ordinary,conversation.id,attempt]);
 await owner.query("INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,reserved_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,1000000,200000,'{}',clock_timestamp()+interval '1 hour')",[budget,environmentId,f.actor.workspaceId,f.actor.principalId]);
 await owner.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd,actual_micro_usd,settled_at) VALUES($1,$2,'synthetic-no-provider',200000,150000,clock_timestamp())",[parity,budget]);
 const snapshot=await coldAuthorityProof(owner,environmentId);
 // Model an older backup lacking the later operation rows. This is an isolated
 // reconciliation test, not evidence of a hosted backup/restore or provider call.
 await owner.query('DELETE FROM ordinary_model_operations WHERE id=$1',[ordinary]);
 await owner.query('DELETE FROM parity_evaluation_operations WHERE id=$1',[parity]);
 const scope=await lockAuthorityTarget(owner,environmentId,snapshot,snapshot.capturedAt);
 const result=await reconcileOwnedCredentialDenials(owner,snapshot,scope);
 expect(result.typedModelHoldsAdded).toBe(2);
 const holds=(await owner.query('SELECT operation_kind,operation_id,scope_id,ceiling_tokens,ceiling_micro_usd,actual_micro_usd,settled_at FROM operations_recovery_model_holds ORDER BY operation_kind')).rows;
 expect(holds).toEqual([
  expect.objectContaining({operation_kind:'ordinary_tokens',operation_id:ordinary,scope_id:conversation.id,ceiling_tokens:8192,actual_micro_usd:null}),
  expect.objectContaining({operation_kind:'parity_dollars',operation_id:parity,scope_id:budget,ceiling_micro_usd:'200000',actual_micro_usd:'150000',settled_at:expect.any(Date)})
 ]);
 await expect(runtime.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,1)',[randomUUID(),conversation.id,attempt])).rejects.toThrow('Recovered model scope requires explicit accounting');
 await expect(runtime.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,'synthetic-no-provider',1)",[randomUUID(),budget])).rejects.toThrow('Recovered model scope requires explicit accounting');
 await expect(runtime.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=0 WHERE id=$1',[budget])).rejects.toThrow(/Recovered (?:budget cannot be refunded|permanent request cannot be repeated)/);
 await expect(runtime.query("UPDATE parity_evaluation_budgets SET state='open' WHERE id=$1",[budget])).rejects.toThrow(/Recovered (?:budget cannot be refunded|permanent request cannot be repeated)/);
 await expect(owner.query('DELETE FROM operations_recovery_model_holds')).rejects.toThrow('immutable');
 expect((await reconcileOwnedCredentialDenials(owner,snapshot,scope)).typedModelHoldsAdded).toBe(0);
 expect((await owner.query('SELECT reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[budget])).rows[0]).toEqual({reserved_micro_usd:'200000',state:'closed'});
}),210000);

it('quarantines existing unknown model holds and denies runtime zero settlements',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),budget=randomUUID(),operation=randomUUID();
 await owner.query("INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,reserved_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,1000000,200000,'{}',clock_timestamp()+interval '1 hour')",[budget,environmentId,f.actor.workspaceId,f.actor.principalId]);
 await owner.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,'synthetic-no-provider',200000)",[operation,budget]);
 const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision};
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyHeldParityOperations:1});
 await expect(runtime.query('UPDATE parity_evaluation_operations SET actual_micro_usd=0,settled_at=clock_timestamp() WHERE id=$1',[operation])).rejects.toThrow('requires owner accounting');
 expect((await owner.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[operation])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyHeldParityOperations:0});
}),210000);

it('preserves known accounting alongside an earlier unknown hold and inherits both observations',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),budget=randomUUID(),operation=randomUUID();
 await owner.query("INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,reserved_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,1000000,200000,'{}',clock_timestamp()+interval '1 hour')",[budget,environmentId,f.actor.workspaceId,f.actor.principalId]);
 await owner.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,'synthetic-no-provider',200000)",[operation,budget]);
 const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision};
 await quarantineRestoredAuthority(owner,scope);
 // An independently checked synthetic receipt becomes known after the original
 // quarantine. No provider is called and the original budget stays retired.
 await owner.query('UPDATE parity_evaluation_operations SET actual_micro_usd=150000,settled_at=clock_timestamp() WHERE id=$1',[operation]);
 const snapshot=await coldAuthorityProof(owner,environmentId),input={...scope,snapshotDigest:snapshot.snapshotDigest,backupCapturedAt:snapshot.capturedAt};
 await reconcileOwnedCredentialDenials(owner,snapshot,input);
 const observations=(await owner.query('SELECT evidence_kind,actual_micro_usd,settled_at FROM operations_recovery_model_observations WHERE operation_id=$1 ORDER BY evidence_kind',[operation])).rows;
 expect(observations).toEqual([{evidence_kind:'inherited_hold',actual_micro_usd:null,settled_at:null},{evidence_kind:'operation',actual_micro_usd:'150000',settled_at:expect.any(Date)}]);
 expect((await owner.query('SELECT actual_micro_usd FROM operations_recovery_model_holds WHERE operation_id=$1',[operation])).rows[0].actual_micro_usd).toBeNull();
 const originals=(await owner.query('SELECT observed_evidence_digest,evidence_kind,actual_micro_usd,settled_at FROM operations_recovery_model_observations WHERE operation_id=$1 ORDER BY evidence_kind',[operation])).rows;
 const later=await coldAuthorityProof(owner,environmentId);
 expect(later.tables.find(entry=>entry.name==='operations_recovery_model_observations')?.rows.filter(row=>row.identity.operation_id===operation)).toHaveLength(2);
 // Model a target predating the observation receipts. Their independently
 // retained provenance must repopulate it, not collapse to the unknown hold.
 await owner.query('TRUNCATE operations_recovery_model_observations');
 await reconcileOwnedCredentialDenials(owner,later,{...scope,snapshotDigest:later.snapshotDigest,backupCapturedAt:snapshot.capturedAt});
 for(const original of originals)expect((await owner.query('SELECT observed_evidence_digest,evidence_kind,actual_micro_usd,settled_at FROM operations_recovery_model_observations WHERE operation_id=$1 AND observed_evidence_digest=$2 AND evidence_kind=$3',[operation,original.observed_evidence_digest,original.evidence_kind])).rows).toEqual([original]);
 expect((await owner.query('SELECT reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[budget])).rows[0]).toEqual({reserved_micro_usd:'200000',state:'closed'});
}),210000);
