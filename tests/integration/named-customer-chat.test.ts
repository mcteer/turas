import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { POST as login } from "../../app/api/auth/login/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { withTransaction } from "../../lib/server/db/client";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch } from "../../lib/server/conversations/dispatch";
import { resolveCustomerAccount, readCustomerAccountEvidence, assertCustomerQuestionReads } from "../../lib/server/conversations/customer-accounts";

const isolatedTestUrl = requireTestDatabaseUrl();
beforeAll(() => { process.env.DATABASE_URL=isolatedTestUrl; process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID; });

it("resolves named customers inside private chat and rechecks grants and owner identity",async()=>{
  const owner=new Client({connectionString:isolatedTestUrl}); await owner.connect();
  try {
    const origin=process.env.TURAS_APP_ORIGIN!;
    const response=await login(new Request(`${origin}/api/auth/login`,{method:"POST",
      headers:{origin,"content-type":"application/json"},body:JSON.stringify({username:"partner",password:process.env.PARTNER_PASSWORD})}));
    expect(response.status).toBe(200);
    const actor=await getCurrentSession(new Request(origin,{headers:{cookie:response.headers.get("set-cookie")!.split(";")[0]}}));
    if(!actor) throw Error("Test identity unavailable");
    const accessible=randomUUID(),denied=randomUUID();
    await owner.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
      VALUES($1,$3,'Named chat fixture A',false),($2,$3,'Named chat fixture B',false)`,[accessible,denied,actor.workspaceId]);
    await owner.query(`INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by)
      VALUES($1,$2,$3,$4,'active',1,$5)`,[randomUUID(),actor.workspaceId,accessible,actor.membershipId,actor.principalId]);
    await owner.query(`INSERT INTO customer_reference_aliases(customer_id,alias,kind)
      VALUES($1,'Fixture alias','name'),($1,'Fixture storefront','documented_workload')`,[accessible]);
    const operationId=randomUUID();
    const {conversation}=await createOwnedConversation(actor,{requestKey:operationId});
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
    await expect(withTransaction(db=>resolveCustomerAccount(db,{...principal,principalId:randomUUID()},"Fixture alias"))).rejects.toMatchObject({status:404});
    await owner.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[accessible,actor.membershipId]);
    await expect(withTransaction(db=>assertCustomerQuestionReads(db,actor,conversation.id,attempt.attemptId))).rejects.toMatchObject({status:404});
  } finally {await owner.end();}
});
