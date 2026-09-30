import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";
import { withTransaction } from "../../lib/server/db/client";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { listPlans,readPlan,readPlanHistory } from "../../lib/server/plans/read";
import { readPlanDiff } from "../../lib/server/plans/diff";
import { createProfileTestSession } from "../fixtures/profiles";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected=process.env.DATABASE_URL;
  if (!selected || selected!==process.env.DATABASE_URL_UNPOOLED ||
      selected!==process.env.TURAS_TEST_DATABASE_URL ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 authoring tests require the owned disposable clone");
  }
}

function noSourceContent() {
  const content=syntheticPlanContent();
  content.assertions=[];
  content.sourceDependencies=[];
  return content;
}

describe("manual delivery plan authoring",() => {
  it("creates, saves, reloads and submits immutable revisions",async () => {
    requireOwnedClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT authoring_fixture");
      try {
        const panel=await createProfileTestSession(db,"panel");
        const initial=await submitPlanCommand(panel,{action:"create",
          requestKey:`plan_${randomUUID()}`,
          workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.memberId,
          content:noSourceContent()},db);
        expect((await readPlan(panel,initial.planId,undefined,db)).title)
          .toBe("Synthetic Cedar public web plan");
        const changed={...noSourceContent(),title:"Synthetic Cedar revised design"};
        const saved=await submitPlanCommand(panel,{action:"save",
          requestKey:`plan_${randomUUID()}`,planId:initial.planId,
          expectedAggregateVersion:initial.aggregateVersion,
          parentRevisionId:initial.revisionId,baseAcceptedRevisionId:null,
          changeReason:"Reviewed a reversible design option",content:changed},db);
        expect(saved.revisionId).not.toBe(initial.revisionId);
        expect((await readPlan(panel,initial.planId,initial.revisionId,db)).title)
          .toBe("Synthetic Cedar public web plan");
        expect((await readPlan(panel,initial.planId,undefined,db)).title)
          .toBe("Synthetic Cedar revised design");
        const listed=await listPlans(panel,PLAN_FIXTURE_SCOPE.customerId,{},db);
        const summary=listed.items.find((item)=>item.planId===initial.planId);
        expect(summary?.title).toBe("Synthetic Cedar revised design");
        expect(summary).not.toHaveProperty("content");
        const comparison=await readPlanDiff(panel,initial.planId,
          initial.revisionId,saved.revisionId,db);
        expect(comparison.changes).toContainEqual({area:"scope",key:"title",
          kind:"changed",fields:["title"]});
        await expect(submitPlanCommand(panel,{action:"save",
          requestKey:`plan_${randomUUID()}`,planId:initial.planId,
          expectedAggregateVersion:1,parentRevisionId:initial.revisionId,
          baseAcceptedRevisionId:null,changeReason:"Stale edit",content:changed},db))
          .rejects.toMatchObject({status:409});
        const submitted=await submitPlanCommand(panel,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:initial.planId,
          expectedAggregateVersion:saved.aggregateVersion,revisionId:saved.revisionId,
          contentDigest:saved.contentDigest},db);
        expect(submitted.reviewState).toBe("in_review");
        await expect(submitPlanCommand(panel,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:initial.planId,
          expectedAggregateVersion:submitted.aggregateVersion,
          revisionId:saved.revisionId,contentDigest:saved.contentDigest},db))
          .rejects.toMatchObject({status:409});
        expect((await readPlanHistory(panel,initial.planId,{},db)).items.map((item) =>
          item.revisionId)).toEqual([saved.revisionId,initial.revisionId]);
        await db.query("DELETE FROM plan_revision_payloads WHERE revision_id=$1",
          [initial.revisionId]);
        await expect(readPlanDiff(panel,initial.planId,initial.revisionId,
          saved.revisionId,db)).rejects.toMatchObject({status:409,
            code:"plan_unavailable"});
      } finally { await db.query("ROLLBACK TO SAVEPOINT authoring_fixture"); }
    });
  },60_000);

  it("keeps another member's unaccepted delivery plan hidden from a partner",async () => {
    requireOwnedClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT authoring_fixture");
      try {
        const panel=await createProfileTestSession(db,"panel");
        const partner=await createProfileTestSession(db,"partner");
        const panelPlan=await submitPlanCommand(panel,{action:"create",
          requestKey:`plan_${randomUUID()}`,
          workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.memberId,
          content:noSourceContent()},db);
        await expect(readPlan(partner,panelPlan.planId,undefined,db))
          .rejects.toMatchObject({status:404});
        const own=await submitPlanCommand(partner,{action:"create",
          requestKey:`plan_${randomUUID()}`,
          workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:PLAN_FIXTURE_SCOPE.partnerId,
          content:noSourceContent()},db);
        expect((await readPlan(partner,own.planId,undefined,db)).revisionId)
          .toBe(own.revisionId);
      } finally { await db.query("ROLLBACK TO SAVEPOINT authoring_fixture"); }
    });
  },60_000);

  it("preserves incomplete work and rejects invalid owner or workload scope",async()=>{
    requireOwnedClone();
    await withTransaction(async(db)=>{
      await db.query("SAVEPOINT incomplete_authoring_fixture");
      try {
        const admin=await createProfileTestSession(db,"mcteer");
        const partner=await createProfileTestSession(db,"partner");
        const incomplete=noSourceContent() as PlanDraftContent;
        incomplete.sections[0]={key:"charter",state:"unknown",narrative:"",
          ownerRole:"Customer sponsor",discoveryAction:"Confirm delivery charter"};
        incomplete.diagrams=[];
        await expect(submitPlanCommand(partner,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:admin.membershipId,
          content:incomplete},db)).rejects.toMatchObject({status:404});
        await expect(submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:randomUUID(),
          audience:"delivery",ownerMembershipId:admin.membershipId,
          content:incomplete},db)).rejects.toMatchObject({status:404});
        const created=await submitPlanCommand(admin,{action:"create",
          requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,
          audience:"delivery",ownerMembershipId:admin.membershipId,
          content:incomplete},db);
        const loaded=await readPlan(admin,created.planId,undefined,db);
        expect((loaded.content as PlanDraftContent).sections[0]).toMatchObject({
          state:"unknown",ownerRole:"Customer sponsor",
          discoveryAction:"Confirm delivery charter"});
        await expect(submitPlanCommand(admin,{action:"submit",
          requestKey:`plan_${randomUUID()}`,planId:created.planId,
          expectedAggregateVersion:created.aggregateVersion,
          revisionId:created.revisionId,contentDigest:created.contentDigest},db))
          .rejects.toMatchObject({status:422});
      } finally {await db.query("ROLLBACK TO SAVEPOINT incomplete_authoring_fixture");}
    });
  },60_000);
});
