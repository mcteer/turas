import {prepareSupportAdvice} from '../../lib/server/support/advisory';
import {beforeAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '../../lib/server/db/client';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {getServerConfig} from '../../lib/server/config';
import {expansionScope} from '../../lib/server/expansion/repository';
import {expansionHash} from '../../lib/server/expansion/commands';
import type {CurrentSession} from '../../lib/server/auth/sessions';

describe('Expansion advice storage and exclusive conversations',()=>{
 let actor:CurrentSession;
 const env=()=>getServerConfig().TURAS_ENVIRONMENT_ID;
 beforeAll(async()=>{actor=await withExpansionDatabase(async db=>{
  await db.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[DEMO_IDS.sharedCustomer,DEMO_IDS.workspace]);
  return createProfileTestSession(db,'panel');
 });});
 async function fresh(){
  const conversation=(await createOwnedConversation(actor,{customerId:DEMO_IDS.sharedCustomer,requestKey:randomUUID()})).conversation;
  const scope=await withTransaction(db=>expansionScope(db,actor,DEMO_IDS.sharedCustomer,null,{create:true}));
  return {conversationId:conversation.id,scopeId:scope!.id,bindingId:randomUUID()};
 }
 async function bind(input:Awaited<ReturnType<typeof fresh>>,selected:string[]=[]){return withExpansionDatabase(db=>db.query(`INSERT INTO expansion_advice_bindings
  (id,scope_id,environment_id,workspace_id,customer_id,audience,conversation_id,owner_membership_id,selected_engagement_ids,selected_hypothesis_ids)
  VALUES($1,$2,$3,$4,$5,'internal',$6,$7,'{}',$8)`,[input.bindingId,input.scopeId,env(),actor.workspaceId,DEMO_IDS.sharedCustomer,input.conversationId,actor.membershipId,selected]));}
 it('accepts a fresh internal scope but rejects duplicates, incompatible scope and populated conversations',async()=>{
  const good=await fresh();await bind(good);
  const duplicate=await fresh(),id=randomUUID();await expect(bind(duplicate,[id,id])).rejects.toMatchObject({code:'23514'});
  const foreign=await fresh();foreign.scopeId=randomUUID();await expect(bind(foreign)).rejects.toMatchObject({code:'23514'});
  const populated=await fresh();await withExpansionDatabase(db=>db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,'Synthetic ordinary message')`,[randomUUID(),populated.conversationId,randomUUID(),expansionHash('Synthetic ordinary message')]));
  await expect(bind(populated)).rejects.toMatchObject({code:'23514'});
 });
 it('makes binding and conversation authority immutable and installs insert/update guards across every older feature',async()=>{
  const input=await fresh();await bind(input);
  const target=await fresh();
  await expect(withExpansionDatabase(db=>db.query('UPDATE expansion_advice_bindings SET conversation_id=$2 WHERE id=$1',[input.bindingId,target.conversationId]))).rejects.toMatchObject({code:'23514'});
  await expect(withExpansionDatabase(db=>db.query("UPDATE conversations SET context_audience='delivery' WHERE id=$1",[input.conversationId]))).rejects.toMatchObject({code:'23514'});
  const triggers=await withExpansionDatabase(db=>db.query(`SELECT tgname,tgtype FROM pg_trigger WHERE tgname=ANY($1::text[])`,[['planning_expansion_exclusive','staffing_expansion_exclusive','execution_expansion_exclusive','support_expansion_exclusive','research_expansion_exclusive']]));
  expect(triggers.rows).toHaveLength(5);for(const trigger of triggers.rows){expect(Number(trigger.tgtype)&4).toBe(4);expect(Number(trigger.tgtype)&16).toBe(16);}
 });
 it('permits only one active owner/scope attempt while keeping immutable paid receipts protected from runtime writes',async()=>{
  const first=await fresh(),second=await fresh();await bind(first);await bind(second);
  const values=(input:typeof first)=>[randomUUID(),input.bindingId,input.scopeId,env(),actor.workspaceId,input.conversationId,actor.membershipId,randomUUID(),expansionHash('Synthetic request')];
  const sql=`INSERT INTO expansion_advice_attempts(id,binding_id,scope_id,environment_id,workspace_id,conversation_id,owner_membership_id,request_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  await withExpansionDatabase(db=>db.query(sql,values(first)));await expect(withExpansionDatabase(db=>db.query(sql,values(second)))).rejects.toMatchObject({code:'23505'});
  await withExpansionDatabase(async db=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE turas_runtime');await expect(db.query('UPDATE expansion_model_step_receipts SET ordinal=1')).rejects.toMatchObject({code:'42501'});}finally{await db.query('ROLLBACK');}});
 });
 it('rejects mixed support/expansion bindings in both directions through real support preparation',async()=>{
  const expansion=await fresh();await bind(expansion);
  const supportRequest=(conversationId:string)=>({requestKey:randomUUID(),conversationId,workloadId:null,audience:'internal',selectedEngagementIds:[],sourceRefs:[]});
  await expect(prepareSupportAdvice(actor,DEMO_IDS.sharedCustomer,supportRequest(expansion.conversationId))).rejects.toMatchObject({status:409});
  const support=await fresh();expect((await prepareSupportAdvice(actor,DEMO_IDS.sharedCustomer,supportRequest(support.conversationId))).state).toBe('prepared');
  await expect(bind(support)).rejects.toMatchObject({code:'23514'});
  await expect(withExpansionDatabase(db=>db.query(`INSERT INTO support_advice_bindings(id,scope_id,environment_id,workspace_id,customer_id,workload_id,audience,conversation_id,owner_membership_id,selected_engagement_ids)
   SELECT $1,scope_id,environment_id,workspace_id,customer_id,workload_id,audience,$2,owner_membership_id,selected_engagement_ids FROM support_advice_bindings WHERE conversation_id=$3`,[randomUUID(),expansion.conversationId,support.conversationId]))).rejects.toMatchObject({code:'23514'});
 });

});
