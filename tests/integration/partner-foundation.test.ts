import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withPartnerDatabase } from "../fixtures/partners/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { partnerTestActors } from "../fixtures/partners/seed";
import { partnerCommand,partnerRead,partnerRate } from "../../lib/server/partners/commands";
import { partnerTransaction,partnerHash } from "../../lib/server/partners/repository";
import { readPartnerRequest,partnerActorHash } from "../../lib/server/partners/receipts";
import { partnerMetrics } from "../../lib/server/partners/telemetry";
import { lockPartnerActor, isPartnerReviewer } from "../../lib/server/partners/policy";

describe("partner foundation", () => {
  it("applies explicit 013 schema and rejects cross-scope guide persistence", async () => withPartnerDatabase(async db => {
    expect((await db.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBeGreaterThanOrEqual(50);
    await expect(db.query(`INSERT INTO partner_guides(id,environment_id,workspace_id,customer_id,engagement_id,plan_id,creator_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),process.env.TURAS_ENVIRONMENT_ID,DEMO_IDS.workspace,DEMO_IDS.deniedCustomer,randomUUID(),randomUUID(),DEMO_IDS.panelMembership])).rejects.toMatchObject({code:"23503"});
  }));
  it("allows current granted partners but only canonical mcteer is reviewer", async () => withPartnerDatabase(async db => {
    const partner=await createProfileTestSession(db,"partner"), panel=await createProfileTestSession(db,"panel"), reviewer=await createProfileTestSession(db,"mcteer");
    expect(isPartnerReviewer(panel)).toBe(false);expect(isPartnerReviewer(reviewer)).toBe(true);expect(isPartnerReviewer(partner)).toBe(false);
    await db.query("BEGIN");try { await lockPartnerActor(db,partner,DEMO_IDS.sharedCustomer);await expect(lockPartnerActor(db,partner,DEMO_IDS.deniedCustomer)).rejects.toMatchObject({status:404}); }finally {await db.query("ROLLBACK");}
  }));
  it("increments authority on deactivate/reactivate even through maintenance SQL", async () => withPartnerDatabase(async db => {
    await db.query("BEGIN");try {
      const member=Number((await db.query("SELECT revision FROM memberships WHERE id=$1",[DEMO_IDS.partnerMembership])).rows[0].revision);
      const org=Number((await db.query("SELECT authority_revision FROM partner_organizations WHERE id=$1",[DEMO_IDS.partnerOrganization])).rows[0].authority_revision);
      await db.query("UPDATE memberships SET active=false WHERE id=$1",[DEMO_IDS.partnerMembership]);await db.query("UPDATE memberships SET active=true WHERE id=$1",[DEMO_IDS.partnerMembership]);
      await db.query("UPDATE partner_organizations SET active=false WHERE id=$1",[DEMO_IDS.partnerOrganization]);await db.query("UPDATE partner_organizations SET active=true WHERE id=$1",[DEMO_IDS.partnerOrganization]);
      expect(Number((await db.query("SELECT revision FROM memberships WHERE id=$1",[DEMO_IDS.partnerMembership])).rows[0].revision)).toBe(member+2);
      expect(Number((await db.query("SELECT authority_revision FROM partner_organizations WHERE id=$1",[DEMO_IDS.partnerOrganization])).rows[0].authority_revision)).toBe(org+2);
      await db.query("UPDATE memberships SET revision=0 WHERE id=$1",[DEMO_IDS.partnerMembership]);await db.query("UPDATE partner_organizations SET authority_revision=1 WHERE id=$1",[DEMO_IDS.partnerOrganization]);expect(Number((await db.query("SELECT revision FROM memberships WHERE id=$1",[DEMO_IDS.partnerMembership])).rows[0].revision)).toBe(member+2);expect(Number((await db.query("SELECT authority_revision FROM partner_organizations WHERE id=$1",[DEMO_IDS.partnerOrganization])).rows[0].authority_revision)).toBe(org+2);
    }finally {await db.query("ROLLBACK");}
  }));
});

describe("partner command fences",()=>{
 it("reports request-lock contention as pending and serializes resolve against actual admission",async()=>withPartnerDatabase(async db=>{
  const {author}=await partnerTestActors(db),requestId=randomUUID();await db.query("BEGIN");try{await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[partnerHash([process.env.TURAS_ENVIRONMENT_ID,partnerActorHash(author),requestId])]);expect((await readPartnerRequest(author,requestId)).outcome).toBe("pending");}finally{await db.query("ROLLBACK");}
  let executed=0;const results=await Promise.allSettled([partnerCommand(author,{action:"guide.create",requestId,expectedVersion:0},{customerId:DEMO_IDS.sharedCustomer},async()=>{executed++;return {targetId:randomUUID(),version:1};}),readPartnerRequest(author,requestId,true)]);
  const final=await readPartnerRequest(author,requestId);expect(["committed","abandoned"]).toContain(final.outcome);expect(executed).toBe(final.outcome==="committed"?1:0);expect(results.some(r=>r.status==="fulfilled")).toBe(true);
  expect(JSON.stringify(partnerMetrics())).not.toContain("PRIVATE_SENTINEL");
 }));
 it("reauthorizes current inactive/revoked states without leaking customer scope",async()=>withPartnerDatabase(async db=>{
  const {partner}=await partnerTestActors(db);
  for(const statement of ["UPDATE principals SET active=false WHERE id='"+DEMO_IDS.partner+"'", "UPDATE memberships SET active=false WHERE id='"+DEMO_IDS.partnerMembership+"'", "UPDATE workspaces SET active=false WHERE id='"+DEMO_IDS.workspace+"'", "UPDATE login_sessions SET revoked_at=now() WHERE id='"+partner.sessionId+"'", "UPDATE partner_organizations SET active=false WHERE id='"+DEMO_IDS.partnerOrganization+"'", "UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE id='"+DEMO_IDS.partnerSharedGrant+"'"]){
   await db.query("BEGIN");try {await db.query(statement);await expect(lockPartnerActor(db,partner,DEMO_IDS.sharedCustomer)).rejects.toMatchObject({status:expect.any(Number)});}finally{await db.query("ROLLBACK");}
  }
 }));
 it("atomically commits once, conflicts on changed input and does not replay while revoked",async()=>withPartnerDatabase(async db=>{
  const {author}=await partnerTestActors(db),requestId=randomUUID(),targetId=randomUUID();let admitted=0;
  const input={action:"guide.create",requestId,expectedVersion:0};
  const run=async()=>{admitted++;return {targetId,version:1};};
  const first=await partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},run);
  expect(await partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},run)).toEqual(first);expect(admitted).toBe(1);
  await expect(partnerCommand(author,{...input,expectedVersion:1},{customerId:DEMO_IDS.sharedCustomer},run)).rejects.toMatchObject({status:409});
  await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",[author.sessionId]);
  await expect(partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},run)).rejects.toMatchObject({status:401});
 }));
 it("reconciles a rolled-back command and abandons it before a late original can run",async()=>withPartnerDatabase(async db=>{
  const {author}=await partnerTestActors(db),requestId=randomUUID();const input={action:"guide.create",requestId,expectedVersion:0};
  await expect(partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},async()=>{throw Error("Synthetic rollback");})).rejects.toThrow("Synthetic rollback");
  expect((await readPartnerRequest(author,requestId)).outcome).toBe("not_found");
  expect((await readPartnerRequest(author,requestId,true)).outcome).toBe("abandoned");
  let admitted=false;await expect(partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},async()=>{admitted=true;return {targetId:randomUUID(),version:1};})).rejects.toMatchObject({status:410});expect(admitted).toBe(false);
 }));
 it("preserves successful reconciliation while new work is disabled",async()=>withPartnerDatabase(async db=>{
  const {author}=await partnerTestActors(db),input={action:"guide.create",requestId:randomUUID(),expectedVersion:0};
  const first=await partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},async()=>({targetId:randomUUID(),version:1}));
  const before=process.env.TURAS_013_DISABLED;process.env.TURAS_013_DISABLED="1";
  try{expect(await readPartnerRequest(author,input.requestId)).toEqual(first);expect(await partnerCommand(author,input,{customerId:DEMO_IDS.sharedCustomer},async()=>{throw Error("No duplicate");})).toEqual(first);
   await expect(partnerCommand(author,{...input,requestId:randomUUID()},{customerId:DEMO_IDS.sharedCustomer},async()=>({targetId:randomUUID(),version:1}))).rejects.toMatchObject({status:503});
  }finally{if(before===undefined)delete process.env.TURAS_013_DISABLED;else process.env.TURAS_013_DISABLED=before;}
 }));
 it("enforces bounded actor quotas and two-second lock waits",async()=>withPartnerDatabase(async db=>{
  const {partner}=await partnerTestActors(db);
  for(let i=0;i<30;i++)await partnerTransaction(async tx=>{await lockPartnerActor(tx,partner);await partnerRate(tx,partner,"write");});
  await expect(partnerTransaction(tx=>partnerRate(tx,partner,"write"))).rejects.toMatchObject({status:429});
  await db.query("BEGIN");try{await db.query("SELECT id FROM memberships WHERE id=$1 FOR UPDATE",[partner.membershipId]);const began=Date.now();await expect(partnerRead(partner,DEMO_IDS.sharedCustomer,async()=>null)).rejects.toMatchObject({code:"55P03"});expect(Date.now()-began).toBeLessThan(3500);}finally{await db.query("ROLLBACK");}
 }));
});
