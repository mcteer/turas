import {searchNamedCustomerEvidence} from '../../lib/server/conversations/named-evidence-search';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {reservedSpecialistInvocation} from "../../agent/lib/legacy-research/workflow-progress";
import {prepareResearch} from '../../lib/server/research/specialists/research-cache/requests';
import {requestOwnedTaskCancellation} from '../../lib/server/conversations/cancel';
import {projectNativeEvent} from "../../lib/server/conversations/projection";
import {requestCancellation} from "../../lib/server/conversations/cancel";
import {readResearchRuntimeAuthority} from "../../lib/server/research/specialists/runtime-authority";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { withTransaction } from "../../lib/server/db/client";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch } from "../../lib/server/conversations/dispatch";
import { resolveCustomerAccount, readCustomerAccountEvidence, assertCustomerQuestionReads } from "../../lib/server/conversations/customer-accounts";

const isolatedTestUrl = requireTestDatabaseUrl();
const ownedConversationIds:string[]=[];
beforeAll(() => { process.env.DATABASE_URL=isolatedTestUrl; process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID; });

it("resolves named customers inside private chat and rechecks grants and owner identity",async()=>{
  const owner=new Client({connectionString:isolatedTestUrl}); await owner.connect();
  try {
    const actor=await isolatedChatActor(owner,'partner','member');
    const accessible=randomUUID(),denied=randomUUID();
    await owner.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
      VALUES($1,$3,'Named chat fixture A',false),($2,$3,'Named chat fixture B',false)`,[accessible,denied,actor.workspaceId]);
    await owner.query(`INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by)
      VALUES($1,$2,$3,$4,'active',1,$5)`,[randomUUID(),actor.workspaceId,accessible,actor.membershipId,actor.principalId]);
    await owner.query(`INSERT INTO customer_reference_aliases(customer_id,alias,kind)
      VALUES($1,'Fixture alias','name'),($1,'Fixture storefront','documented_workload')`,[accessible]);
    const operationId=randomUUID();
    const {conversation}=await createOwnedConversation(actor,{requestKey:operationId});
    ownedConversationIds.push(conversation.id);
    const binding=await claimBinding(actor,conversation.id,operationId);
    if(binding.state!=="claimed")throw Error("Test binding unavailable");
    const nativeId=`wrun_${randomUUID()}`;
    await bindNativeSession(actor,conversation.id,binding.claimToken,nativeId);
    await owner.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
      VALUES($1,'named-chat-test',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,[process.env.TURAS_ENVIRONMENT_ID]);
    const attempt=await prepareAttempt(actor,conversation.id,nativeId,randomUUID(),"Which products does Fixture alias use?");
    await claimDispatch(actor,conversation.id,attempt.attemptId,0);
    const principal={principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId}};
    for(const name of ["Named chat fixture A","Fixture alias","Fixture storefront"]){
      expect(await withTransaction(db=>resolveCustomerAccount(db,principal,name))).toMatchObject({status:"resolved",account:{id:accessible}});
    }
    expect(await withTransaction(db=>resolveCustomerAccount(db,principal,"Named chat fixture B"))).toMatchObject({status:"not_found"});
    expect(await withTransaction(db=>readCustomerAccountEvidence(db,principal,accessible))).toMatchObject({customer:{id:accessible},entries:[]});
    await expect(withTransaction(db=>readCustomerAccountEvidence(db,principal,denied))).rejects.toMatchObject({status:404});
    await expect(searchNamedCustomerEvidence(principal,denied,
      {query:'Synthetic',scope:'customer',use:'accepted_fact',limit:5})).rejects.toMatchObject({status:404});
    const shared=await searchNamedCustomerEvidence(principal,undefined,
      {query:'Synthetic',scope:'shared',use:'accepted_fact',limit:5});
    expect(shared.mode).toBe('lexical_degraded');

    await expect(withTransaction(db=>resolveCustomerAccount(db,{...principal,principalId:randomUUID()},"Fixture alias"))).rejects.toMatchObject({status:404});
    // New public inventory must not freeze an otherwise authorized conversation.
    await owner.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1,delivery_generation=delivery_generation+1 WHERE customer_id=$1',[accessible]);
    await withTransaction(db=>assertCustomerQuestionReads(db,actor,conversation.id,attempt.attemptId));
    const event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()}});
    const originalTurn=`turn_${randomUUID()}`,backgroundTurn=`turn_${randomUUID()}`;
    await projectNativeEvent(nativeId,attempt.attemptId,event('message.received',{turnId:originalTurn,message:'Which products does Fixture alias use?'}));
    await projectNativeEvent(nativeId,attempt.attemptId,event('turn.completed',{turnId:originalTurn}));
    await owner.query(`INSERT INTO turas_research_requests(environment_id,workspace_id,owner_user_id,key,account_id,scope,context_hash,lease_id,lease_until,refresh,parent_session_id)
      VALUES($1,$2,$3,$4,$5,$8::jsonb,'fixture',$6,now()+interval '10 minutes',false,$7)`,
      [process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,randomUUID(),accessible,randomUUID(),nativeId,JSON.stringify({accountId:accessible,workload:"Public customer website",question:"Which products does Fixture alias use?",kind:"customer-update"})]);
    const identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,responseAttemptId:attempt.attemptId};
    const scope={accountId:accessible,kind:'customer-update' as const,workload:'Public customer website',question:'Which Vercel products are documented for this customer?'};
    const invocation=await reservedSpecialistInvocation('customer-update',{message:'Research the account without a copied identifier.'},
      {session:{id:nativeId,auth:{current:principal}},abortSignal:new AbortController().signal} as unknown as Parameters<typeof reservedSpecialistInvocation>[2]);
    expect(invocation.message).toContain(`"accountId":"${accessible}"`);
    expect(invocation.message).toContain('Which products does Fixture alias use?');
    const joined=await Promise.all([prepareResearch(identity,scope,new AbortController().signal,false,nativeId),prepareResearch(identity,{...scope,question:'Please check the documented public product stack.'},new AbortController().signal,false,nativeId)]);
    expect(joined.every(result=>result.status==='working')).toBe(true);
    expect(new Set(joined.map(result=>result.key)).size).toBe(1);
    expect(Number((await owner.query('SELECT count(*) FROM turas_research_requests WHERE parent_session_id=$1 AND lease_until>now()',[nativeId])).rows[0].count)).toBe(1);
    await expect(requestOwnedTaskCancellation({...actor,principalId:randomUUID()},nativeId)).rejects.toMatchObject({status:404});
    await requestOwnedTaskCancellation(actor,nativeId);
    expect(await withTransaction(db=>readResearchRuntimeAuthority(db,attempt.attemptId,actor.principalId))).toBe(null);
    expect((await owner.query('SELECT response_state FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].response_state).toBe('cancelled');
    expect(await withTransaction(db=>readResearchRuntimeAuthority(db,attempt.attemptId,actor.principalId,{parentSessionId:nativeId},true))).toBe(null);
    // New fixture phase: restore the pending cohort to exercise native delivery.
    await owner.query("UPDATE response_attempts SET response_state='completed' WHERE id=$1",[attempt.attemptId]);
    expect(await withTransaction(db=>readResearchRuntimeAuthority(db,attempt.attemptId,actor.principalId))).toBe(null);
    expect(await withTransaction(db=>readResearchRuntimeAuthority(db,attempt.attemptId,actor.principalId,{parentSessionId:nativeId},true))).toMatchObject({actor:{principalId:actor.principalId}});
    await owner.query("UPDATE turas_research_requests SET lease_until=now()+interval '10 minutes' WHERE parent_session_id=$1",[nativeId]);
    await projectNativeEvent(nativeId,attempt.attemptId,event('message.received',{kind:'execution.background_task',turnId:backgroundTurn,message:'Server-authored research completion'}));
    await projectNativeEvent(nativeId,attempt.attemptId,event('message.completed',{turnId:backgroundTurn,message:'A checked research reply.'}));
    expect((await owner.query('SELECT native_turn_id,response_state FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0]).toMatchObject({native_turn_id:originalTurn,response_state:'running'});
    expect((await owner.query("SELECT 1 FROM event_projections WHERE conversation_id=$1 AND visible_payload->>'message'='Server-authored research completion'",[conversation.id])).rowCount).toBe(0);
    await expect(projectNativeEvent(nativeId,attempt.attemptId,event('message.completed',{turnId:'unknown-turn',message:'Unassociated reply'}))).rejects.toThrow('Native turn does not match');
    await requestCancellation(actor,nativeId,backgroundTurn);
    expect(await withTransaction(db=>readResearchRuntimeAuthority(db,attempt.attemptId,actor.principalId))).toBe(null);
    await projectNativeEvent(nativeId,attempt.attemptId,event('turn.cancelled',{turnId:backgroundTurn}));
    await owner.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[accessible,actor.membershipId]);
    await expect(withTransaction(db=>assertCustomerQuestionReads(db,actor,conversation.id,attempt.attemptId))).rejects.toMatchObject({status:404});
  } finally{try{await settleSyntheticConversationAttempts(owner,ownedConversationIds);}finally{await owner.end();}}
});
