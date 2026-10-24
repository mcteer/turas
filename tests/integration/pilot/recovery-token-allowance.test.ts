import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {reserveOrdinaryOutput} from '../../../lib/server/conversations/token-allowance';
async function fixture(run:(f:{owner:Client;runtime:Client;conversationId:string;attemptId:string;originalId:string})=>Promise<void>,options:{missing?:boolean;baselineMismatch?:boolean}={}){
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),{conversation}=await createOwnedConversation(f.actor,{requestKey:randomUUID()}),message=randomUUID(),attempt=randomUUID(),operation=randomUUID();
  await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Synthetic recovery allowance')",[message,conversation.id,randomUUID()]);
  await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','failed',clock_timestamp()+interval '5 minutes')",[attempt,conversation.id,message]);
  await owner.query('INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens) VALUES($1,5000)',[conversation.id]);
  if(!options.missing)await owner.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,8192)',[operation,conversation.id,attempt]);
  const locked=await lockAuthorityTarget(owner,environmentId);
  await owner.query("INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,ceiling_tokens,baseline_output_tokens,evidence_digest,evidence_digest_kind,source_captured_at,recovery_id,control_revision) VALUES($1,'ordinary_tokens',$2,$3,8192,$4,repeat('a',64),'operation_row',clock_timestamp(),$5,$6)",[environmentId,operation,conversation.id,options.baselineMismatch?4999:5000,locked.recoveryId,locked.controlRevision]);
  // Controlled owner fixture only, not real recovery or unlock acceptance.
  // There are no quarantine resolutions or fabricated verification receipts.
  await owner.query("UPDATE operations_control SET mode='open' WHERE environment_id=$1",[environmentId]);
  await run({owner,runtime,conversationId:conversation.id,attemptId:attempt,originalId:operation});
 });
}
it('counts an existing operation and its recovery hold once and retains its unknown ceiling',async()=>fixture(async f=>{
 expect((await f.runtime.query('SELECT turas_ordinary_output_used($1) AS used',[f.conversationId])).rows[0].used).toBe('13192');
 await f.runtime.query('BEGIN');const admitted=await reserveOrdinaryOutput(f.runtime as unknown as PoolClient,f.conversationId,f.attemptId,8192);await f.runtime.query('COMMIT');
 expect(admitted.ceiling).toBe(6808);
 await expect(f.runtime.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,1)',[randomUUID(),f.conversationId,f.attemptId])).rejects.toThrow('allowance exhausted');
 await expect(f.runtime.query('UPDATE ordinary_model_operations SET actual_tokens=0,settled_at=clock_timestamp() WHERE id=$1',[f.originalId])).rejects.toThrow('owner accounting');
 await f.runtime.query('UPDATE ordinary_model_operations SET actual_tokens=1000,settled_at=clock_timestamp() WHERE id=$1',[admitted.id]);
 expect((await f.runtime.query('SELECT turas_ordinary_output_used($1) AS used',[f.conversationId])).rows[0].used).toBe('14192');
 expect((await f.owner.query('SELECT actual_tokens,settled_at FROM ordinary_model_operations WHERE id=$1',[f.originalId])).rows[0]).toEqual({actual_tokens:null,settled_at:null});
}),210000);
it('counts post-backup missing operations against the same original allowance',async()=>fixture(async f=>{
 expect((await f.runtime.query('SELECT turas_ordinary_output_used($1) AS used',[f.conversationId])).rows[0].used).toBe('13192');
 await expect(f.runtime.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,6809)',[randomUUID(),f.conversationId,f.attemptId])).rejects.toThrow('allowance exhausted');
 await expect(f.runtime.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens,actual_tokens,settled_at) VALUES($1,$2,$3,1,0,clock_timestamp())',[randomUUID(),f.conversationId,f.attemptId])).rejects.toThrow('allowance differs');
 expect((await f.owner.query('SELECT count(*)::int AS n FROM operations_recovery_model_holds')).rows[0].n).toBe(1);
},{missing:true}),210000);
it('rejects conflicting immutable baselines without allocating a fresh allowance',async()=>fixture(async f=>{
 await expect(f.runtime.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,1)',[randomUUID(),f.conversationId,f.attemptId])).rejects.toThrow('allowance differs');
 expect((await f.owner.query('SELECT baseline_output_tokens FROM ordinary_conversation_allowances WHERE conversation_id=$1',[f.conversationId])).rows[0].baseline_output_tokens).toBe(5000);
},{baselineMismatch:true}),210000);
