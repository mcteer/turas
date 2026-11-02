import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {withAuthorityEnvironment,coldAuthorityProof,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {reconcileOwnedCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';
import {remainingLockedSpecialistAllowance} from '../../../lib/server/research/specialists/discussion-budget';

it('restores a real older dump without replenishing specialist caps or replaying a native step',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId,owned)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary');
 const {conversation}=await createOwnedConversation(f.actor,{requestKey:randomUUID(),customerId:f.customerId,title:'Recovery accounting'});
 const parent='wrun_'+randomUUID(),message=randomUUID(),attempt=randomUUID(),discussion=randomUUID(),assignment=randomUUID();
 await owner.query("UPDATE conversations SET eve_session_id=$2,binding_state='bound' WHERE id=$1",[conversation.id,parent]);
 await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Recovery accounting')",[message,conversation.id,randomUUID()]);
 await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','running',clock_timestamp()+interval '5 minutes')",[attempt,conversation.id,message]);
 await owner.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,'solution','platform',$7,$8,$9,$10,$11,repeat('a',64),repeat('a',64),400000,32000,3000000,clock_timestamp()+interval '5 minutes')`,[discussion,conversation.id,environmentId,f.actor.workspaceId,f.actor.principalId,f.customerId,parent,randomUUID(),randomUUID(),attempt,randomUUID()]);
 await owner.query(`INSERT INTO specialist_assignments(id,discussion_id,parent_session_id,ordinal,attempt_id,request_key,input_digest,call_id,research_key,lease_id,authority_expires_at)
  SELECT $1,id,parent_session_id,1,$2,$3,repeat('a',64),$4,'fixture',$5,expires_at FROM specialist_discussions WHERE id=$6`,[assignment,attempt,randomUUID(),randomUUID(),randomUUID(),discussion]);
 const backupCapturedAt=(await owner.query('SELECT clock_timestamp() AS time')).rows[0].time.toISOString();
 const docker=(args:string[])=>execFileSync('docker',['exec',owned.databaseContainer,...args],{stdio:'pipe',timeout:30000});
 docker(['pg_dump','--username=postgres','--dbname='+owned.databaseName,'--format=custom','--file=/tmp/specialist-recovery.dump']);
 const unknown=randomUUID(),known=randomUUID(),step='opaque-step-'+randomUUID();
 const insert=`INSERT INTO specialist_operations(id,discussion_id,assignment_id,native_step_key,model,ceiling_input_tokens,ceiling_output_tokens,ceiling_micro_usd,pricing)
  VALUES($1,$2,$3,$4,'synthetic-no-provider',1000,100,10000,'{}')`;
 await owner.query(insert,[unknown,discussion,assignment,step]);
 // Execution finished, but no complete billing receipt arrived: keep all ceilings.
 await owner.query('UPDATE specialist_operations SET completed_at=clock_timestamp() WHERE id=$1',[unknown]);
 await owner.query(insert,[known,discussion,assignment,'opaque-step-'+randomUUID()]);
 await owner.query('UPDATE specialist_operations SET completed_at=clock_timestamp(),settled_at=clock_timestamp(),actual_input_tokens=200,actual_output_tokens=20,actual_micro_usd=2000 WHERE id=$1',[known]);
 const snapshot=await coldAuthorityProof(owner,environmentId);
 for(const table of snapshot.tables.filter(table=>table.name.startsWith('specialist_')))for(const row of table.rows){
  expect(Object.keys(row.status).some(key=>['control_hook_token','result_reference','pricing','workload','dependencies'].includes(key))).toBe(false);
 }
 docker(['pg_restore','--username=postgres','--dbname='+owned.databaseName,'--clean','--if-exists','--exit-on-error','/tmp/specialist-recovery.dump']);
 // Supported restore refreshes explicit runtime grants after object recreation.
 await owner.query(await readFile(resolve('scripts/db-role-setup.sql'),'utf8'));
 expect((await owner.query('SELECT count(*)::int AS n FROM specialist_operations')).rows[0].n).toBe(0);
 const scope=await lockAuthorityTarget(owner,environmentId,snapshot,backupCapturedAt);
 expect((await reconcileOwnedCredentialDenials(owner,snapshot,scope)).typedModelHoldsAdded).toBe(2);
 expect((await reconcileOwnedCredentialDenials(owner,snapshot,scope)).typedModelHoldsAdded).toBe(0);
 expect((await owner.query("SELECT state FROM specialist_discussions WHERE id=$1",[discussion])).rows[0].state).toBe('closed');
 expect((await owner.query("SELECT state FROM specialist_assignments WHERE id=$1",[assignment])).rows[0].state).toBe('unavailable');
 expect(await remainingLockedSpecialistAllowance(owner as any,discussion,conversation.id)).toEqual({inputTokens:398800,outputTokens:31880,microUsd:2988000});
 const holds=(await owner.query("SELECT operation_id,actual_micro_usd,ceiling_micro_usd FROM operations_recovery_model_holds WHERE operation_kind='specialist' ORDER BY operation_id")).rows;
 expect(holds).toEqual(expect.arrayContaining([{operation_id:unknown,actual_micro_usd:null,ceiling_micro_usd:'10000'},{operation_id:known,actual_micro_usd:'2000',ceiling_micro_usd:'10000'}]));
 await expect(runtime.query(insert,[randomUUID(),discussion,assignment,step])).rejects.toThrow('Recovered permanent request cannot be repeated');
 await expect(runtime.query('DELETE FROM operations_recovery_model_holds')).rejects.toMatchObject({code:'42501'});
 // A second authenticated capture retains both hold and observation dimensions.
 const inherited=await coldAuthorityProof(owner,environmentId);
 expect((await reconcileOwnedCredentialDenials(owner,inherited,{...scope,snapshotDigest:inherited.snapshotDigest})).typedModelHoldsAdded).toBe(0);
 expect(await remainingLockedSpecialistAllowance(owner as any,discussion,conversation.id)).toEqual({inputTokens:398800,outputTokens:31880,microUsd:2988000});
}),210000);
