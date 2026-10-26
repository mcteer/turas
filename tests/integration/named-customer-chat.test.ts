import {rankPassages} from '../../lib/server/retrieval/search';
import {authoredTool as sharedEvidenceTool} from '../../agent/tools/search_evidence';
import {createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate} from '../../lib/server/knowledge/service';
import {requireResearchAccount} from '../../lib/server/research/specialists/account';
import {searchNamedCustomerEvidence} from '../../lib/server/conversations/named-evidence-search';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {reservedSpecialistInvocation} from "../../agent/lib/legacy-research/workflow-progress";
import {prepareResearch} from '../../lib/server/research/specialists/research-cache/requests';
import {requestOwnedTaskCancellation} from '../../lib/server/conversations/cancel';
import {projectNativeEvent} from "../../lib/server/conversations/projection";
import {requestCancellation} from "../../lib/server/conversations/cancel";
import {readResearchRuntimeAuthority} from "../../lib/server/research/specialists/runtime-authority";
import { createHash, randomUUID } from "node:crypto";
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
    // A shared read must not inherit the stricter admission rule for NEW research.
    const sharedAdmin=await isolatedChatActor(owner,'internal','admin',actor.workspaceId);
    const syntheticCustomer=randomUUID(),sharedRecord=randomUUID(),sharedRevision=randomUUID();
    const sourceText='Synthetic accepted build timing evidence';
    const sourceDigest=createHash('sha256').update(sourceText).digest('hex');
    await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic shared tool account',true)",[syntheticCustomer,actor.workspaceId]);
    await owner.query("INSERT INTO profile_records(id,workspace_id,customer_id,kind,created_by) VALUES($1,$2,$3,'claim',$4)",[sharedRecord,actor.workspaceId,syntheticCustomer,sharedAdmin.membershipId]);
    await owner.query(`INSERT INTO profile_revisions(id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
      VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}',$6,'manual','internal','internal_operations',$7)`,
    [sharedRevision,sharedRecord,actor.workspaceId,syntheticCustomer,JSON.stringify({kind:'claim',text:sourceText,sourceType:'manual'}),sharedAdmin.membershipId,sourceDigest]);
    await owner.query("INSERT INTO profile_review_decisions(revision_id,decision,reviewer_membership_id,rationale,command_receipt_id) VALUES($1,'accept',$2,'Synthetic source review',$3)",[sharedRevision,sharedAdmin.membershipId,randomUUID()]);
    await owner.query('UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1',[sharedRecord,sharedRevision]);
    const publication=await withTransaction(async db=>{
      const draft=await createKnowledgeCandidate(db,sharedAdmin,{idempotencyKey:randomUUID(),customerId:syntheticCustomer,
        payload:{title:'Synthetic shared cache timing practice',productVersion:'2026.9',problem:'Build stages can be slow',prerequisites:'A supported build pipeline',solution:'Measure each build stage before tuning cache settings',reasoning:'Stage timing isolates the slowest step',applicability:'Build pipelines',limitations:'Validate for each workload',validation:'Compare stage durations before and after'},
        lineage:[{sourceKind:'accepted_profile',sourceRevisionId:sharedRevision,sourceGeneration:1,sourceDigest,rightsBasis:'Synthetic reusable source'}]});
      await submitKnowledgeCandidate(db,sharedAdmin,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest});
      return decideKnowledgeCandidate(db,sharedAdmin,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Only generic synthetic guidance',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
    });
    const sharedInput={query:'synthetic shared cache timing',scope:'shared' as const,use:'discovery' as const,limit:5};
    async function sharedTurn(session:typeof actor,customerId?:string,legacy=false){
      const operation=randomUUID(),created=await createOwnedConversation(session,{customerId,requestKey:operation});
      ownedConversationIds.push(created.conversation.id);
      if(legacy)await owner.query('UPDATE conversations SET live_customer_context=false WHERE id=$1',[created.conversation.id]);
      const binding=await claimBinding(session,created.conversation.id,operation);
      if(binding.state!=='claimed')throw Error('Shared fixture binding unavailable');
      const native=`wrun_${randomUUID()}`;await bindNativeSession(session,created.conversation.id,binding.claimToken,native);
      await owner.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'named-chat-test',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,[process.env.TURAS_ENVIRONMENT_ID]);
      const attempt=await prepareAttempt(session,created.conversation.id,native,randomUUID(),'Use shared cache timing guidance');
      await claimDispatch(session,created.conversation.id,attempt.attemptId,0);
      const principal={principalId:session.principalId,attributes:{turasAttemptId:attempt.attemptId}};
      return{conversationId:created.conversation.id,principal,context:{session:{id:native,auth:{current:principal}},abortSignal:new AbortController().signal}};
    }
    // Adding trusted field labels must not add a second lexical vote to old hits.
    const cacheRanking=await withTransaction(async db=>{
      const sources=(await db.query<Parameters<typeof rankPassages>[1][number]>(`
        SELECT id,source_kind,source_revision_id,source_generation,audience,
          content_digest,projection_contract FROM retrieval_sources
        WHERE source_kind='published_shared' AND source_revision_id=$1`,[publication.revisionId])).rows;
      return rankPassages(db,sources,'cache',null);
    });
    expect(cacheRanking).toHaveLength(2);
    cacheRanking.forEach((row,index)=>expect(Number(row.score)).toBeCloseTo(1/(61+index),12));
    for(const legacy of[false,true]){
      const turn=await sharedTurn(sharedAdmin,syntheticCustomer,legacy);
      if(!legacy)await withTransaction(db=>readCustomerAccountEvidence(db,turn.principal,syntheticCustomer));
      const result=await sharedEvidenceTool.execute!(sharedInput,turn.context as never) as {customerEvidence:{results:Array<{sourceKind:string;sourceRevisionId:string;citationId:string}>}};
      const shared=result.customerEvidence.results.find(row=>row.sourceKind==='published_shared'&&row.sourceRevisionId===publication.revisionId);
      expect(shared?.citationId).toBeTruthy();
      expect((await owner.query(`SELECT 1 FROM session_evidence_dependencies dependency JOIN retrieval_receipt_sources source ON source.source_kind=dependency.source_kind AND source.source_revision_id=dependency.source_revision_id AND source.source_generation=dependency.source_generation WHERE dependency.conversation_id=$1 AND source.id=$2 AND source.source_kind='published_shared'`,[turn.conversationId,shared!.citationId])).rowCount).toBeGreaterThan(0);
      // A named public field must be discoverable without knowing its hidden value.
      for(const query of['limitations','validate limitations']){
        const fieldResult=await sharedEvidenceTool.execute!({...sharedInput,query},turn.context as never) as {
          customerEvidence:{mode:string;results:Array<{sourceKind:string;sourceRevisionId:string;
            citationId:string;text:string;locators:Array<{kind:string;fieldPath?:string}>}>}};
        expect(fieldResult.customerEvidence.mode).toBe('lexical_degraded');
        const fields=fieldResult.customerEvidence.results.filter(row=>row.sourceRevisionId===publication.revisionId);
        expect(fields).toHaveLength(1);
        const limitation=fields[0];
        expect(limitation.sourceKind).toBe('published_shared');
        expect(limitation.text).toBe('Validate for each workload');
        expect(limitation.locators).toEqual([expect.objectContaining({kind:'shared_field',fieldPath:'limitations'})]);
        expect(limitation.citationId).not.toBe(publication.revisionId);
        expect((await owner.query(`SELECT 1 FROM session_evidence_dependencies dependency
          JOIN retrieval_receipt_sources source ON source.source_kind=dependency.source_kind
            AND source.source_revision_id=dependency.source_revision_id
            AND source.source_generation=dependency.source_generation
          WHERE dependency.conversation_id=$1 AND source.id=$2
            AND source.source_kind='published_shared' AND source.source_revision_id=$3`,
        [turn.conversationId,limitation.citationId,publication.revisionId])).rowCount).toBeGreaterThan(0);
      }
      // Explicit and implicit selections must use the same current grant checks.
      await expect(sharedEvidenceTool.execute!({...sharedInput,accountId:syntheticCustomer},turn.context as never)).resolves.toBeTruthy();
    }
    const unassigned=await sharedTurn(actor);
    await expect(sharedEvidenceTool.execute!({...sharedInput,accountId:syntheticCustomer},unassigned.context as never)).rejects.toMatchObject({status:404});
    await expect(requireResearchAccount({...sharedAdmin,userId:sharedAdmin.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!},syntheticCustomer)).rejects.toMatchObject({status:404});
    await owner.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[accessible,actor.membershipId]);
    await expect(withTransaction(db=>assertCustomerQuestionReads(db,actor,conversation.id,attempt.attemptId))).rejects.toMatchObject({status:404});
  } finally{try{await settleSyntheticConversationAttempts(owner,ownedConversationIds);}finally{await owner.end();}}
});
