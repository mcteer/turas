import { createResource, revisePartnerEligibility } from "../../lib/server/staffing/resources";
import { syntheticResource } from "../fixtures/staffing/seed";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withExecutionDatabase } from "../fixtures/execution/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { requireExecutionSubject, lockExecutionActor } from "../../lib/server/execution/policy";

describe("current execution authority", () => {
  it("gives mcteer sole review, panel proposal access and granted partner delivery access", async () => {
    await withExecutionDatabase(async db => {
      await db.query("BEGIN");
      try {
        const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel"),
          partner = await createProfileTestSession(db, "partner");
        await lockExecutionActor(db, manager, DEMO_IDS.sharedCustomer, "review");
        await lockExecutionActor(db, panel, DEMO_IDS.sharedCustomer, "read");
        await expect(lockExecutionActor(db, panel, DEMO_IDS.sharedCustomer, "review")).rejects.toMatchObject({ status: 403 });
        await lockExecutionActor(db, partner, DEMO_IDS.sharedCustomer, "contribute");
        await expect(lockExecutionActor(db, partner, DEMO_IDS.sharedCustomer, "review")).rejects.toMatchObject({ status: 403 });
        await expect(lockExecutionActor(db, partner, DEMO_IDS.deniedCustomer, "read")).rejects.toMatchObject({ status: 404 });
      } finally { await db.query("ROLLBACK"); }
    });
  });
  it("denies stale sessions, membership roles, grants and a spoofed administrator", async () => {
    await withExecutionDatabase(async db => {
      await db.query("BEGIN");
      try {
        const actor = await createProfileTestSession(db, "mcteer"), partner = await createProfileTestSession(db, "partner");
        await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
        await expect(lockExecutionActor(db, actor, DEMO_IDS.sharedCustomer, "review")).rejects.toMatchObject({ status: 401 });
        await db.query("UPDATE login_sessions SET revoked_at=NULL WHERE id=$1", [actor.sessionId]);
        await db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1", [partner.membershipId]);
        await expect(lockExecutionActor(db, partner, DEMO_IDS.sharedCustomer, "read")).rejects.toMatchObject({ status: 404 });
        await expect(lockExecutionActor(db, { ...actor, membershipId: randomUUID(), loginName: "mcteer" },
          DEMO_IDS.sharedCustomer, "review")).rejects.toMatchObject({ status: 401 });
      } finally { await db.query("ROLLBACK"); }
    });
  });
});

it("requires linked active subjects and current dated partner eligibility, while reviewer on-behalf lookup stays identity-only", async () => {
  await withExecutionDatabase(async db => {
    await db.query("BEGIN");
    try {
      const reviewer = await createProfileTestSession(db,"mcteer"), panel = await createProfileTestSession(db,"panel"), partner = await createProfileTestSession(db,"partner");
      const unlinked = await createResource(reviewer,{requestKey:randomUUID(),rationale:"Synthetic inactive subject identity",
        resource:{...syntheticResource(),state:"inactive"}},db);
      await lockExecutionActor(db,reviewer,DEMO_IDS.sharedCustomer,"review");
      expect(await requireExecutionSubject(db,reviewer,unlinked.resourceId!,{customerId:DEMO_IDS.sharedCustomer,onBehalf:true}))
        .toEqual({membershipId:null,active:false,kind:"internal"});
      await expect(requireExecutionSubject(db,panel,unlinked.resourceId!,{customerId:DEMO_IDS.sharedCustomer,onBehalf:true})).rejects.toMatchObject({status:403});
      const linked = await createResource(reviewer,{requestKey:randomUUID(),rationale:"Synthetic linked delivery partner",
        resource:{...syntheticResource(),kind:"partner",membershipId:partner.membershipId,partnerOrganizationId:DEMO_IDS.partnerOrganization}},db);
      const day = new Date().toISOString().slice(0,10);
      await lockExecutionActor(db,partner,DEMO_IDS.sharedCustomer,"contribute");
      await expect(requireExecutionSubject(db,partner,linked.resourceId!,{customerId:DEMO_IDS.sharedCustomer,serviceDate:day})).rejects.toMatchObject({status:404});
      await revisePartnerEligibility(reviewer,linked.resourceId,{requestKey:randomUUID(),rationale:"Reviewed exact customer/date assignment",
        expectedAggregateVersion:linked.aggregateVersion,revisionId:linked.revisionId,contentDigest:linked.contentDigest,
        customerId:DEMO_IDS.sharedCustomer,fromDate:day,toDate:day,state:"active"},db);
      expect((await requireExecutionSubject(db,partner,linked.resourceId!,{customerId:DEMO_IDS.sharedCustomer,serviceDate:day})).membershipId).toBe(partner.membershipId);
      await expect(requireExecutionSubject(db,panel,linked.resourceId!,{customerId:DEMO_IDS.sharedCustomer,serviceDate:day})).rejects.toMatchObject({status:403});
    } finally { await db.query("ROLLBACK"); }
  });
});
