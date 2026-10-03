import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { staffingExact } from "../fixtures/staffing/allocations";
import { createDemand, qualifyDemand } from "../../lib/server/staffing/demands";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { lockResearchOwner } from "../../lib/server/research/policy";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { registerFixture } from "../fixtures/execution/registers";
import { readExecutionOverview } from "../../lib/server/execution/service";
import { prepareExecutionAdvice } from "../../lib/server/execution/advisory";
import { executionAdviceSchema } from "../../lib/execution/advice";
import { conversationFeature, assertFreshFeatureConversation } from "../../lib/server/conversations/feature";
import { selectExecutionAdviceInputs } from "../../lib/server/execution/dependencies";
import { createProfileTestSession } from "../fixtures/profiles";

const request = (conversationId: string, generation: number) => ({ requestKey: randomUUID(), conversationId,
  expectedGeneration: generation, from: "2026-10-02", to: "2026-10-02" });
async function fresh(f: Awaited<ReturnType<typeof registerFixture>>, generation: number) {
  const created = await createOwnedConversation(f.author, { customerId: f.customerId, requestKey: randomUUID(), title: "Execution explanation" });
  return request(created.conversation.id, generation);
}

describe("execution advice admission", () => {
  it("rejects caller scope switches, oversized periods and loose instruction input", () => {
    const input = request(randomUUID(), 1);
    expect(executionAdviceSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ baselineId: randomUUID() }, { customerId: randomUUID() }, { model: "other" }, { expectedGeneration: 0 },
      { from: "2026-01-01", to: "2026-04-02" }, { instructions: "Caller instructions cannot expand the explanation" }])
      expect(executionAdviceSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("creates one fresh internal scope, reauthorizes exact replay and denies partner admission", async () => {
    const f = await registerFixture(), view = await readExecutionOverview(f.author, f.engagementId), input = await fresh(f, view.generation);
    const admitted = await prepareExecutionAdvice(f.author, f.engagementId, input);
    expect(admitted.state).toBe("prepared");
    expect(await prepareExecutionAdvice(f.author, f.engagementId, input)).toEqual(admitted);
    await expect(prepareExecutionAdvice(f.author, f.engagementId, { ...input, from: "2026-10-01" })).rejects.toMatchObject({ status: 409 });
    await expect(prepareExecutionAdvice(f.author, f.engagementId, { ...input, requestKey: randomUUID(), expectedGeneration: view.generation + 1 })).rejects.toMatchObject({ status: 409 });
    const partner = await withTransaction(db => createProfileTestSession(db, "partner"));
    await expect(prepareExecutionAdvice(partner, f.engagementId, { ...input, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await withTransaction(async db => {
      const feature = await conversationFeature(db, admitted.conversationId);
      if (feature.kind !== "execution") throw new Error("Missing execution binding");
      const before = (await db.query("SELECT count(*)::int AS n,COALESCE(sum(count),0)::text AS charged FROM rate_windows WHERE category='profile_read'")).rows;
      const context = await selectExecutionAdviceInputs(db, f.author, feature.scope, admitted.attemptId);
      expect(context.summary.effort.actualLifetimeMinutes).toBe("0");
      expect(context.dependencies.map(d => d.kind)).toEqual(expect.arrayContaining(["execution_collection", "profile_collection", "actual_ledger", "planned_period", "procedure", "baseline"]));
      expect((await db.query("SELECT count(*)::int AS n,COALESCE(sum(count),0)::text AS charged FROM rate_windows WHERE category='profile_read'")).rows).toEqual(before);
      expect(await conversationFeature(db, admitted.conversationId)).toMatchObject({ kind: "execution", scope: { engagementId: f.engagementId, baselineId: f.baselineId, generation: view.generation, ownerMembershipId: f.author.membershipId } });
      expect((await db.query("SELECT count(*)::int AS n FROM execution_advice_attempts WHERE conversation_id=$1", [admitted.conversationId])).rows[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1", [admitted.conversationId])).rows[0].n).toBe(0);
      await expect(assertFreshFeatureConversation(db, admitted.conversationId)).rejects.toMatchObject({ status: 409 });
    });
    // Independent database guard prevents a second feature even through direct SQL.
    await expect(withTransaction(async db => db.query(`INSERT INTO planning_conversation_bindings
      (conversation_id,environment_id,workspace_id,customer_id,workload_id,plan_id,audience,owner_membership_id)
      SELECT $1,environment_id,workspace_id,customer_id,workload_id,id,audience,$3 FROM delivery_plans WHERE id=$2`,
      [admitted.conversationId, f.created.planId, f.author.membershipId]))).rejects.toMatchObject({ code: "23514" });
  }, 120000);
  it("rejects populated and research conversations and serializes mixed feature bindings in both directions", async () => {
    const f = await registerFixture(), view = await readExecutionOverview(f.author, f.engagementId);
    const staffing = await withTransaction(async db => {
      const baseline = await createSyntheticDemandBaseline(db);
      const demand = await createDemand(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic binding guard", demand: baseline.demand }, db);
      await qualifyDemand(baseline.actor, demand.demandId, { ...staffingExact(demand), requestKey: randomUUID(), rationale: "Reviewed synthetic scope" }, db);
      return demand;
    });
    const bind = (kind: "execution" | "planning" | "staffing" | "research", conversationId: string) => withTransaction(async db => {
      if (kind === "execution") return db.query(`INSERT INTO execution_advice_bindings
        (id,environment_id,workspace_id,customer_id,engagement_id,conversation_id,owner_membership_id,baseline_id,generation,from_date,to_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-10-02','2026-10-02')`,
        [randomUUID(),process.env.TURAS_ENVIRONMENT_ID,f.author.workspaceId,f.customerId,f.engagementId,conversationId,f.author.membershipId,f.baselineId,view.generation]);
      if (kind === "planning") return db.query(`INSERT INTO planning_conversation_bindings
        (conversation_id,environment_id,workspace_id,customer_id,workload_id,plan_id,audience,owner_membership_id)
        SELECT $1,environment_id,workspace_id,customer_id,workload_id,id,audience,$3 FROM delivery_plans WHERE id=$2`, [conversationId,f.created.planId,f.author.membershipId]);
      if (kind === "staffing") {
        await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [conversationId]);
        await db.query("UPDATE conversations SET context_audience='delivery' WHERE id=$1", [conversationId]);
        return db.query(`INSERT INTO staffing_conversation_bindings
        (id,environment_id,workspace_id,conversation_id,owner_membership_id,customer_id,workload_id,demand_id,demand_revision_id,mode,scenario_id)
        SELECT $1,environment_id,workspace_id,$2,$3,customer_id,workload_id,id,current_revision_id,'operational',NULL FROM staffing_demands WHERE id=$4`,
        [randomUUID(),conversationId,f.author.membershipId,staffing.demandId]);
      }
      return db.query(`INSERT INTO research_requests(id,environment_id,workspace_id,customer_id,actor_membership_id,actor_principal_id,
        login_session_id,conversation_id,mode,public_fields,rendered_queries,idempotency_key,request_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'fit','{}','[]',$9,$10)`, [randomUUID(),process.env.TURAS_ENVIRONMENT_ID,f.author.workspaceId,
        f.customerId,f.author.membershipId,f.author.principalId,f.author.sessionId,conversationId,randomUUID(),"b".repeat(64)]);
    });
    for (const other of ["planning", "staffing", "research"] as const) {
      for (const executionFirst of [true, false]) {
        const input = await fresh(f, view.generation);
        await bind(executionFirst ? "execution" : other, input.conversationId);
        await expect(bind(executionFirst ? other : "execution", input.conversationId)).rejects.toMatchObject({ code: "23514" });
        if (!executionFirst) await expect(prepareExecutionAdvice(f.author, f.engagementId, input)).rejects.toMatchObject({ status: other === "staffing" ? 404 : 409 });
      }
      const input = await fresh(f, view.generation);
      const raced = await Promise.allSettled([bind("execution",input.conversationId),bind(other,input.conversationId)]);
      expect(raced.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(raced.filter(r => r.status === "rejected")).toHaveLength(1);
    }
    const populated = await fresh(f, view.generation);
    await withTransaction(db => db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
      VALUES($1,$2,$3,$4,'Synthetic existing question')`, [randomUUID(),populated.conversationId,randomUUID(),"a".repeat(64)]));
    await expect(prepareExecutionAdvice(f.author,f.engagementId,populated)).rejects.toMatchObject({status:409});
    await expect(bind("execution",populated.conversationId)).rejects.toMatchObject({code:"23514"});
  }, 120000);
  it("denies direct generic context and research fallthrough before any data or provider admission", async () => {
    const f = await registerFixture(), view = await readExecutionOverview(f.author,f.engagementId), input = await fresh(f,view.generation);
    const admitted = await prepareExecutionAdvice(f.author,f.engagementId,input), responseId = randomUUID();
    await withTransaction(async db => {
      const message = randomUUID();
      await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,'Synthetic boundary fixture')`,
        [message,input.conversationId,randomUUID(),"c".repeat(64)]);
      await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state)
        VALUES($1,$2,$3,$4,'prepared','pending')`,[responseId,input.conversationId,message,"c".repeat(64)]);
      await db.query("UPDATE execution_advice_attempts SET response_attempt_id=$2 WHERE id=$1",[admitted.attemptId,responseId]);
    });
    const principal = {principalId:f.author.principalId,attributes:{turasAttemptId:responseId}};
    await expect(withTransaction(db => boundToolActor(db,principal))).rejects.toMatchObject({status:403,code:"execution_tool_denied"});
    await expect(withTransaction(db => lockResearchOwner(db,f.author,f.customerId,input.conversationId))).rejects.toMatchObject({status:409});
    await withTransaction(async db => expect((await db.query("SELECT model_steps,read_calls FROM execution_advice_attempts WHERE id=$1",[admitted.attemptId])).rows[0])
      .toEqual({model_steps:0,read_calls:0}));
  }, 120000);
  it("serializes same-key admissions and enforces the rolling five-per-membership limit", async () => {
    const fixture = await registerFixture(), f = { ...fixture, author: fixture.reviewer }, view = await readExecutionOverview(f.author, f.engagementId), input = await fresh(f, view.generation);
    const attempts = await Promise.all(Array.from({ length: 4 }, () => prepareExecutionAdvice(f.author, f.engagementId, input)));
    expect(new Set(attempts.map(a => a.attemptId)).size).toBe(1);
    for (let i = 0; i < 4; i++) await prepareExecutionAdvice(f.author, f.engagementId, await fresh(f, view.generation));
    await expect(prepareExecutionAdvice(f.author, f.engagementId, { ...input, requestKey: randomUUID() })).rejects.toMatchObject({ status: 429 });
  }, 120000);
});
