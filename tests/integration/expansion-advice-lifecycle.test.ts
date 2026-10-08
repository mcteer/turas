import {beforeAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {startExpansionNative} from '../fixtures/expansion/native';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {readExpansionInitialContext} from '../../lib/server/expansion/native';
import {runExpansionAdviceCleanupTick,settleDueExpansionAdvice,minimizeExpansionAdviceMetadata} from '../../lib/server/expansion/maintenance';
import {processExpansionNativeRetirement,authorizeExpansionRetirement} from '../../lib/server/expansion/native-retirement';
import {admitGovernedModelStep} from '../../lib/server/conversations/model-admission';
import {readExpansionAdviceStatus} from '../../lib/server/expansion/advice-status';
import {getServerConfig} from '../../lib/server/config';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
/** Only the owned clock header is aged; preparation, owner change, withholding,
 * purge lease, source-bound reset authorization and cleanup use real domain code. */
async function age(table:string,trigger:string,column:string,id:string,age:string){
 const allowed=table==='expansion_advice_retirements'&&trigger==='expansion_retirements_immutable'&&column==='retired_at'||table==='expansion_advice_attempts'&&trigger==='expansion_attempt_identity'&&column==='created_at';if(!allowed)throw Error('Invalid owned advice clock fixture');
 await withExpansionDatabase(async db=>{await db.query('BEGIN');try{await db.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);await db.query(`UPDATE ${table} SET ${column}=clock_timestamp()-$2::interval WHERE ${table==='expansion_advice_retirements'?'attempt_id':'id'}=$1`,[id,age]);await db.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});
}
describe('Expansion advice retention and disabled settlement',()=>{
 let actor:CurrentSession,reviewer:CurrentSession;
 beforeAll(async()=>{({actor,reviewer}=await withExpansionDatabase(async db=>({actor:await createProfileTestSession(db,'panel'),reviewer:await createProfileTestSession(db,'mcteer')})));});
 it('withholds immediately on owner change and preserves the earliest 24-hour purge through a later reassignment',async()=>{
  const f=await startExpansionNative(actor);
  const owner=(expectedVersion:number,membershipId:string)=>({contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion,membershipId,rationale:'Explicit synthetic assignment'});
  await assignExpansionOwner(reviewer,DEMO_IDS.sharedCustomer,owner(0,reviewer.membershipId));
  await expect(readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId)).rejects.toMatchObject({code:'expansion_context_changed'});
  expect((await runExpansionAdviceCleanupTick()).purged).toBe(0);
  await age('expansion_advice_retirements','expansion_retirements_immutable','retired_at',f.attemptId,'25 hours');
  const before=(await withExpansionDatabase(db=>db.query('SELECT retired_at FROM expansion_advice_retirements WHERE attempt_id=$1',[f.attemptId]))).rows[0].retired_at;
  await assignExpansionOwner(reviewer,DEMO_IDS.sharedCustomer,owner(1,actor.membershipId));
  expect((await withExpansionDatabase(db=>db.query('SELECT retired_at FROM expansion_advice_retirements WHERE attempt_id=$1',[f.attemptId]))).rows[0].retired_at).toEqual(before);
  expect((await runExpansionAdviceCleanupTick()).purged).toBe(1);
  expect(Number((await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM expansion_advice_payloads WHERE attempt_id=$1',[f.attemptId]))).rows[0].n)).toBe(0);
 });
 it('uses the original created deadline for 30-day payload expiry and retries only a signed retired-session reset',async()=>{
  const f=await startExpansionNative(actor);await age('expansion_advice_attempts','expansion_attempt_identity','created_at',f.attemptId,'31 days');
  expect(await readExpansionAdviceStatus(actor,DEMO_IDS.sharedCustomer,f.attemptId)).toMatchObject({state:'expired',retained:false,result:null,evidence:[]});
  expect((await runExpansionAdviceCleanupTick()).purged).toBe(1);
  const prior=process.env.TURAS_EVE_INTERNAL_ORIGIN;process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:34567/';let calls=0,firstJob:string|null=null;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
   calls++;const job=new Headers(init.headers).get('x-turas-expansion-retire-attempt');if(calls===1)firstJob=job;else expect(job).toBe(firstJob);const session=new URL(url).pathname.split('/').at(-2)!;
   expect(await authorizeExpansionRetirement(new Request(url,init),session)).toBe(actor.principalId);
   return new Response(calls===1?'synthetic reset failure':'no_active_session',{status:calls===1?503:409});
  }));
  try{
   // The earlier retired attempt is also pending; reset exactly the returned session.
   expect(await processExpansionNativeRetirement()).toBe(true);
   await withExpansionDatabase(db=>db.query("UPDATE expansion_native_retirement_receipts SET next_attempt_at=CASE WHEN attempt_id=$1 THEN clock_timestamp() ELSE clock_timestamp()+interval '1 day' END WHERE state='pending'",[firstJob]));
   expect(await processExpansionNativeRetirement()).toBe(true);expect(calls).toBe(2);
   expect(Number((await withExpansionDatabase(db=>db.query("SELECT count(*) AS n FROM expansion_native_retirement_receipts WHERE state='done'"))).rows[0].n)).toBeGreaterThan(0);
  }finally{vi.unstubAllGlobals();process.env.TURAS_EVE_INTERNAL_ORIGIN=prior;}
 });
 it('minimizes native detail after 365 days only after payload purge and acknowledged reset, while retaining lineage and key identity',async()=>{
  const f=await startExpansionNative(actor);await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);await admitGovernedModelStep(f.principal,f.identity);
  await f.event('step.failed',{stepIndex:0,error:{message:'Synthetic failure'}});
  expect(await minimizeExpansionAdviceMetadata()).toBe(0);
  await age('expansion_advice_attempts','expansion_attempt_identity','created_at',f.attemptId,'366 days');
  expect(await minimizeExpansionAdviceMetadata()).toBe(0);expect((await runExpansionAdviceCleanupTick()).purged).toBeGreaterThan(0);
  expect(await minimizeExpansionAdviceMetadata()).toBe(0);
  const prior=process.env.TURAS_EVE_INTERNAL_ORIGIN;process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:34567/';
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:200})));
  try{for(let i=0;i<8;i++){await processExpansionNativeRetirement();if((await withExpansionDatabase(db=>db.query("SELECT 1 FROM expansion_native_retirement_receipts WHERE attempt_id=$1 AND state='done'",[f.attemptId]))).rowCount)break;}}
  finally{vi.unstubAllGlobals();process.env.TURAS_EVE_INTERNAL_ORIGIN=prior;}
  expect(await minimizeExpansionAdviceMetadata()).toBe(1);expect(await minimizeExpansionAdviceMetadata()).toBe(0);
  const rows=await withExpansionDatabase(db=>db.query(`SELECT a.id,a.request_key,a.request_digest,a.conversation_id,a.native_session_id,a.native_turn_id,a.response_attempt_id,
    (SELECT count(*)::int FROM expansion_model_step_receipts WHERE attempt_id=a.id) AS steps,
    (SELECT count(*)::int FROM expansion_advice_dependencies WHERE attempt_id=a.id) AS dependencies,
    (SELECT count(*)::int FROM expansion_advice_reads WHERE attempt_id=a.id) AS reads
    FROM expansion_advice_attempts a WHERE a.id=$1`,[f.attemptId]));
  expect(rows.rows[0]).toMatchObject({id:f.attemptId,conversation_id:f.conversationId,native_session_id:null,native_turn_id:null,response_attempt_id:null,steps:0,dependencies:0,reads:0});expect(rows.rows[0].request_key).toBeTruthy();expect(rows.rows[0].request_digest).toMatch(/^[a-f0-9]{64}$/);
 });
 it('settles disabled active work without deleting another feature or changing the environment marker',async()=>{
  const f=await startExpansionNative(actor),env=getServerConfig().TURAS_ENVIRONMENT_ID,prior=process.env.TURAS_011_DISABLED;
  try{process.env.TURAS_011_DISABLED='1';expect(await settleDueExpansionAdvice()).toBeGreaterThan(0);
   expect((await withExpansionDatabase(db=>db.query('SELECT state,failure_code FROM expansion_advice_attempts WHERE id=$1',[f.attemptId]))).rows[0]).toMatchObject({state:'unconfirmed',failure_code:'feature_disabled'});
   expect((await withExpansionDatabase(db=>db.query('SELECT environment_id FROM turas_environment'))).rows[0].environment_id).toBe(env);
  }finally{if(prior===undefined)delete process.env.TURAS_011_DISABLED;else process.env.TURAS_011_DISABLED=prior;}
  await age('expansion_advice_attempts','expansion_attempt_identity','created_at',f.attemptId,'31 days');
  await runExpansionAdviceCleanupTick();await settleDueExpansionAdvice();
  expect((await withExpansionDatabase(db=>db.query('SELECT state FROM expansion_advice_attempts WHERE id=$1',[f.attemptId]))).rows[0].state).toBe('unconfirmed');
  const origin=process.env.TURAS_EVE_INTERNAL_ORIGIN;process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:34567/';
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:200})));
  try{for(let index=0;index<8;index++)await processExpansionNativeRetirement();}finally{vi.unstubAllGlobals();process.env.TURAS_EVE_INTERNAL_ORIGIN=origin;}
  await settleDueExpansionAdvice();
  expect((await withExpansionDatabase(db=>db.query('SELECT state,failure_code FROM expansion_advice_attempts WHERE id=$1',[f.attemptId]))).rows[0]).toMatchObject({state:'expired',failure_code:'advice_expired'});
 });
});
