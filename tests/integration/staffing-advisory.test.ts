import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { readEligibleContext, readStaffingDeliveryContext } from "../../lib/server/profiles/context";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createDemand, qualifyDemand, readDemand, reviseDemand } from "../../lib/server/staffing/demands";
import { staffingExact, resetStaffingFixtureRates, createConfirmedAllocationLedgerFixture } from "../fixtures/staffing/allocations";
import { createFreshStaffingConversation, requireStaffingConversation } from "../../lib/server/staffing/context";
import { createProfileTestSession } from "../fixtures/profiles";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { prepareStaffingAdvisory } from "../../lib/server/staffing/advisory";
import { requestCancellation } from "../../lib/server/conversations/cancel";
import { createStaffingScenario } from "../../lib/server/staffing/scenarios";
import { createFinanceInput, reviseFinanceInput } from "../../lib/server/staffing/economics";
import { settleDueStaffingAdvisories } from "../../lib/server/staffing/advisory-maintenance";
import { createSyntheticRunningAdvisoryFixture } from "../fixtures/staffing/advisory";
import { boundStaffingToolActor } from "../../lib/server/staffing/tool-actor";
import { reserveStaffingDomainRead, storeStaffingDomainRead } from "../../lib/server/staffing/read-budget";
import { admitStaffingModelStep } from "../../lib/server/staffing/model-admission";
import type { PoolClient } from "pg";
import { captureAttemptContext, readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { assertNativeContextCurrentInTransaction } from "../../lib/server/conversations/context-fence";
import { projectNativeEventInTransaction } from "../../lib/server/conversations/projection";
import { prepareAttempt } from "../../lib/server/conversations/dispatch";
import { executeStaffingRead } from "../../lib/server/staffing/tools";
import { staffingDemandToolResultSchema } from "../../lib/contracts/staffing-tools";
import { reviseSkill } from "../../lib/server/staffing/skills";
async function fixtureDemandFence(db: PoolClient, attemptId: string) {
  const scope = (await db.query(`SELECT b.demand_id FROM staffing_advisory_attempts a
    JOIN staffing_conversation_bindings b ON b.id=a.binding_id WHERE a.id=$1`, [attemptId])).rows[0];
  const head = (await db.query(`SELECT d.current_revision_id,d.aggregate_version,v.content_digest FROM staffing_demands d
    JOIN staffing_demand_revisions v ON v.id=d.current_revision_id WHERE d.id=$1 FOR SHARE OF d`, [scope.demand_id])).rows[0];
  const consumed = (await db.query("SELECT kind,input_id,revision_id,generation,content_digest FROM staffing_advisory_dependencies WHERE attempt_id=$1", [attemptId])).rows;
  if (consumed.some(row => row.kind !== "demand" || row.input_id !== scope.demand_id || row.revision_id !== head.current_revision_id ||
    Number(row.generation) !== Number(head.aggregate_version) || row.content_digest !== head.content_digest)) throw new Error("Synthetic fixture dependency changed");
}
describe("fresh owner-private staffing binding", () => {
  it("rechecks admitted delivery context without exhausting the user profile-read quota", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticRunningAdvisoryFixture(db);
      const count = async () => Number((await db.query("SELECT COALESCE(sum(count),0) AS n FROM rate_windows WHERE category='profile_read'")).rows[0].n);
      const before = await count();
      for (let index = 0; index < 125; index++) {
        const current = await readStaffingDeliveryContext(f.actor, f.demand.customerId, f.demand.workloadId, db);
        expect(current.customer.id).toBe(f.demand.customerId);
      }
      expect(await count()).toBe(before);
      await readEligibleContext(f.actor, f.demand.customerId, { audience: "delivery", workloadId: f.demand.workloadId ?? undefined }, db);
      expect(await count()).toBe(before + 1);
    });
  }, 120_000);
  it("settles exact synthetic native usage after cancellation and login revocation, retaining unknown counts and immutable receipts", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticRunningAdvisoryFixture(db);
      await admitStaffingModelStep(db, f.principal, { nativeSessionId: f.nativeSessionId, responseAttemptId: f.responseAttemptId,
        turnId: f.turnId, stepIndex: 0 }, fixtureDemandFence);
      // Explicit synthetic association for SQL settlement testing. Actual native
      // events/injection/provider proof belongs to staffing-native.test.ts.
      await db.query("UPDATE response_attempts SET input_event_id=$2 WHERE id=$1", [f.responseAttemptId, `evt_synthetic_input_${randomUUID()}`]);
      await requestCancellation(f.actor, f.nativeSessionId, f.turnId, db);
      await db.query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [f.actor.sessionId]);
      const event = { type: "step.completed", data: { turnId: f.turnId, stepIndex: 0, usage: { inputTokens: 0 },
        ignoredPrivatePayload: "PRIVATE_SYNTHETIC_UNRELEASED_OUTPUT" }, meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() } };
      const prior = process.env.TURAS_007_DISABLED;
      try {
        process.env.TURAS_007_DISABLED = "1";
        await projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, event);
        await projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, event);
        await expect(projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, { ...event,
          data: { ...event.data, usage: { inputTokens: 1 } } })).rejects.toMatchObject({ status: 404 });
        await projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, { type: "turn.cancelled",
          data: { turnId: f.turnId }, meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() } });
        const lateFailureId = `evt_${randomUUID()}`;
        await projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, { type: "turn.failed",
          data: { turnId: f.turnId, code: "MODEL_CALL_FAILED", message: "PRIVATE_SYNTHETIC_UNRELEASED_OUTPUT",
            details: { name: "HttpFailure", statusCode: 409, semanticErrorId: "safe-synthetic",
              detail: "HttpFailure { code: 'staffing_context_changed', message: 'PRIVATE_SYNTHETIC_UNRELEASED_OUTPUT' }" } },
          meta: { id: lateFailureId, at: new Date().toISOString() } });
        expect((await db.query("SELECT visible_payload FROM event_projections WHERE native_event_id=$1", [lateFailureId])).rows[0].visible_payload)
          .toEqual({ code: "MODEL_CALL_FAILED", errorName: "HttpFailure", domainCode: "staffing_context_changed",
            semanticErrorId: "safe-synthetic", statusCode: 409 });
      } finally { if (prior === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = prior; }
      expect((await db.query(`SELECT u.input_tokens,u.output_tokens FROM staffing_model_step_usage_receipts u
        JOIN staffing_model_step_receipts s ON s.id=u.step_receipt_id WHERE s.attempt_id=$1`, [f.attemptId])).rows)
        .toEqual([{ input_tokens: "0", output_tokens: null }]);
      expect((await db.query("SELECT visible_payload FROM event_projections WHERE native_event_id=$1", [event.meta.id])).rows[0].visible_payload)
        .toEqual({ usage: { inputTokens: 0, outputTokens: null } });
      expect((await db.query("SELECT state,model_steps,read_calls FROM staffing_advisory_attempts WHERE id=$1", [f.attemptId])).rows[0])
        .toEqual({ state: "cancelled", model_steps: 1, read_calls: 0 });
      expect((await db.query("SELECT response_state FROM response_attempts WHERE id=$1", [f.responseAttemptId])).rows[0].response_state).toBe("cancelled");
      await db.query("SAVEPOINT usage_receipt_immutable");
      await expect(db.query("UPDATE staffing_model_step_usage_receipts SET output_tokens=0 WHERE native_event_id=$1", [event.meta.id]))
        .rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK TO SAVEPOINT usage_receipt_immutable");
    });
  }, 120_000);
  it("uses the production read executor and complete resolver for exact replay, then denies a retired skill with no repeated read", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(async db => {
      const running = await createSyntheticRunningAdvisoryFixture(db), manager = await createProfileTestSession(db, "mcteer");
      const skillId = running.demand.demand!.requiredSkills[0].skillId;
      const row = (await db.query(`SELECT s.skill_key,s.current_revision_id,s.aggregate_version,p.name,p.definition,v.content_digest
        FROM workforce_skills s JOIN workforce_skill_payloads p ON p.revision_id=s.current_revision_id
        JOIN workforce_skill_revisions v ON v.id=s.current_revision_id WHERE s.id=$1`, [skillId])).rows[0];
      return { ...running, manager, skillId, row };
    });
    // Synthetic response metadata only. No provider, native transport or initial
    // context injection is represented by this real database read/replay case.
    const requestKey = `synthetic_tool_${randomUUID()}`;
    const result = staffingDemandToolResultSchema.parse(await executeStaffingRead(f.principal, requestKey, "read_staffing_demand", {}));
    expect(result.demandId).toBe(f.demand.demandId);
    expect(result.citations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "skill", inputId: f.skillId })]));
    expect(await executeStaffingRead(f.principal, requestKey, "read_staffing_demand", {})).toEqual(result);
    await withTransaction(async db => {
      expect((await db.query("SELECT read_calls,dependency_count FROM staffing_advisory_attempts WHERE id=$1", [f.attemptId])).rows[0])
        .toEqual({ read_calls: 1, dependency_count: 4 });
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_advisory_read_receipts WHERE attempt_id=$1", [f.attemptId])).rows[0].n).toBe(1);
    });
    await reviseSkill(f.manager, f.skillId, { requestKey: randomUUID(), rationale: "Synthetic authoritative skill retirement",
      revisionId: f.row.current_revision_id, contentDigest: f.row.content_digest, expectedAggregateVersion: Number(f.row.aggregate_version),
      skill: { key: f.row.skill_key, name: f.row.name, definition: f.row.definition, state: "retired" } });
    await expect(executeStaffingRead(f.principal, requestKey, "read_staffing_demand", {})).rejects.toMatchObject({ status: 409 });
    await withTransaction(async db => {
      expect((await db.query("SELECT read_calls FROM staffing_advisory_attempts WHERE id=$1", [f.attemptId])).rows[0].read_calls).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(0);
    });
  }, 120_000);
  it("denies unfenced content projection, in-transaction release without preflight and an unrelated dispatch key", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticRunningAdvisoryFixture(db);
      const denial = { status: 503, code: "staffing_release_preflight_required" };
      await expect(assertNativeContextCurrentInTransaction(db, f.actor, f.nativeSessionId)).rejects.toMatchObject(denial);
      await expect(prepareAttempt(f.actor, f.scope.conversationId, f.nativeSessionId, randomUUID(), "Synthetic closed dispatch", [], db))
        .rejects.toMatchObject({ status: 409 });
      for (const type of ["message.received", "message.appended", "message.completed"]) {
        await expect(projectNativeEventInTransaction(db, f.nativeSessionId, f.responseAttemptId, { type,
          data: { turnId: f.turnId, message: "PRIVATE_SYNTHETIC_UNFENCED_OUTPUT", messageDelta: "PRIVATE_SYNTHETIC_UNFENCED_OUTPUT" },
          meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() } })).rejects.toMatchObject(denial);
      }
      expect((await db.query("SELECT count(*)::int AS n FROM event_projections WHERE conversation_id=$1", [f.scope.conversationId])).rows[0].n).toBe(0);
      expect((await db.query("SELECT model_steps,read_calls FROM staffing_advisory_attempts WHERE id=$1", [f.attemptId])).rows[0])
        .toEqual({ model_steps: 0, read_calls: 0 });
    });
  }, 120_000);
  it("reserves reads before execution, retains uncertainty, stores exact dependencies and blocks a seventh read and finance widening", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticRunningAdvisoryFixture(db), input = { requestKey: randomUUID(), tool: "read_staffing_demand" as const, request: {} };
      await expect(captureAttemptContext(db, f.actor, f.scope.conversationId, f.responseAttemptId, f.demand.customerId))
        .rejects.toMatchObject({ status: 503, code: "staffing_native_unavailable" });
      await expect(readCurrentAttemptContext(db, f.responseAttemptId, f.actor.principalId))
        .rejects.toMatchObject({ status: 503, code: "staffing_native_unavailable" });
      expect((await db.query("SELECT count(*)::int AS n FROM context_snapshot_receipts WHERE attempt_id=$1", [f.responseAttemptId])).rows[0].n).toBe(0);
      const admission = await reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), input);
      expect(admission.state).toBe("admitted");
      expect(await reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), input))
        .toEqual({ state: "unconfirmed", receiptId: admission.receiptId });
      const result = { demandId: f.demand.demandId, revisionId: f.demand.revisionId, knownGap: "Synthetic explicitly bounded read" };
      const dependencies = [{ kind: "demand" as const, inputId: f.demand.demandId, revisionId: f.demand.revisionId,
        generation: f.demand.aggregateVersion, contentDigest: f.demand.contentDigest }];
      await storeStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), { ...input, receiptId: admission.receiptId, result, dependencies });
      expect(await reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), input))
        .toEqual({ state: "replayed", receiptId: admission.receiptId, result });
      await expect(reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), { ...input, request: { broaden: true } })).rejects.toMatchObject({ status: 409 });
      for (let i = 0; i < 5; i++) expect((await reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence),
        { ...input, requestKey: randomUUID() })).state).toBe("admitted");
      await expect(reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), { ...input, requestKey: randomUUID() }))
        .rejects.toMatchObject({ status: 429 });
      await expect(reserveStaffingDomainRead(db, await boundStaffingToolActor(db, f.principal, fixtureDemandFence), { ...input, tool: "read_staffing_scenario", requestKey: randomUUID() }))
        .rejects.toMatchObject({ status: 403 });
      expect((await db.query("SELECT read_calls,context_bytes,dependency_count FROM staffing_advisory_attempts WHERE id=$1", [f.attemptId])).rows[0])
        .toEqual({ read_calls: 6, context_bytes: Buffer.byteLength(JSON.stringify(result)), dependency_count: 1 });
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_advisory_read_payloads p JOIN staffing_advisory_read_receipts r ON r.id=p.receipt_id WHERE r.attempt_id=$1", [f.attemptId])).rows[0].n).toBe(1);
    });
  }, 120_000);
  it("reserves at most six exact synthetic native step identities and denies uncertainty, forged turns and stopped responses", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticRunningAdvisoryFixture(db), identity = { nativeSessionId: f.nativeSessionId, responseAttemptId: f.responseAttemptId,
        turnId: f.turnId, stepIndex: 0 };
      await expect(admitStaffingModelStep(db, f.principal, { ...identity, turnId: "foreign" }, fixtureDemandFence)).rejects.toMatchObject({ status: 404 });
      const disabled = process.env.TURAS_007_DISABLED;
      try {
        process.env.TURAS_007_DISABLED = "1";
        await expect(admitStaffingModelStep(db, f.principal, identity, fixtureDemandFence)).rejects.toMatchObject({ status: 503 });
      } finally { if (disabled === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = disabled; }
      await admitStaffingModelStep(db, f.principal, identity, fixtureDemandFence);
      await expect(admitStaffingModelStep(db, f.principal, identity, fixtureDemandFence)).rejects.toMatchObject({ status: 409 });
      for (let stepIndex = 1; stepIndex < 6; stepIndex++) await admitStaffingModelStep(db, f.principal, { ...identity, stepIndex }, fixtureDemandFence);
      await expect(admitStaffingModelStep(db, f.principal, { ...identity, stepIndex: 6 }, fixtureDemandFence)).rejects.toMatchObject({ status: 429 });
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_model_step_receipts WHERE attempt_id=$1", [f.attemptId])).rows[0].n).toBe(6);
      await db.query("UPDATE response_attempts SET response_state='stopping' WHERE id=$1", [f.responseAttemptId]);
      await expect(boundStaffingToolActor(db, f.principal, fixtureDemandFence)).rejects.toMatchObject({ status: 409 });
      // Database step receipts only; no provider or native transport was invoked.
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(0);
    });
  }, 120_000);
  it("settles an overdue ambiguous dispatch while disabled without a response, retry, or staffing write", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const staged = await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db), actor = await createProfileTestSession(db, "panel");
      const draft = await createDemand(actor, { requestKey: randomUUID(), rationale: "Synthetic settlement demand", demand: f.demand }, db);
      const qualified = await qualifyDemand(actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic exact settlement qualification" }, db);
      const demand = await readDemand(actor, qualified.demandId, db), fresh = await createFreshStaffingConversation(db, actor, demand, "operational", null);
      const id = randomUUID();
      // Synthetic durable ambiguous-dispatch metadata, not proof of a provider/native call.
      await db.query(`INSERT INTO staffing_advisory_attempts(id,environment_id,workspace_id,binding_id,conversation_id,request_key,request_digest,
        owner_membership_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared')`,
        [id, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, fresh.bindingId, fresh.conversationId, randomUUID(), "c".repeat(64), actor.membershipId]);
      await db.query(`UPDATE staffing_advisory_attempts SET dispatch_at=now()-interval '121 seconds',
        deadline_at=now()-interval '1 second',native_request_id=$2 WHERE id=$1`, [id, randomUUID()]);
      return { id, conversationId: fresh.conversationId, demandId: demand.demandId };
    });
    const disabled = process.env.TURAS_007_DISABLED;
    try {
      process.env.TURAS_007_DISABLED = "1";
      expect(await settleDueStaffingAdvisories()).toBeGreaterThanOrEqual(1);
      await settleDueStaffingAdvisories();
      await withTransaction(async db => {
        expect((await db.query("SELECT state,failure_code,model_steps,read_calls FROM staffing_advisory_attempts WHERE id=$1", [staged.id])).rows[0])
          .toEqual({ state: "unconfirmed", failure_code: "native_completion_unconfirmed", model_steps: 0, read_calls: 0 });
        expect((await db.query("SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1", [staged.conversationId])).rows[0].n).toBe(0);
        expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [staged.demandId])).rows[0].n).toBe(0);
      });
    } finally { if (disabled === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = disabled; }
  }, 120_000);
  it("allows an explicitly incomplete finance snapshot but rejects admission and scope replay after its rate changes", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      // Seeded confirmed ledger: tests advisory scope, not native output or the trusted journey.
      const f = await createConfirmedAllocationLedgerFixture(db), demand = await readDemand(f.actor, f.demand.demandId, db);
      const end = new Date(Date.parse(f.firstDate) + 86_400_000).toISOString().slice(0, 10);
      const entered = { requestKey: randomUUID(), rationale: "Synthetic advisory cost source", provenance: "Synthetic entered rate",
        input: { kind: "rate" as const, rateKind: "loaded_cost" as const, resourceId: f.resource.resourceId!, currency: "USD" as const,
          fromDate: f.firstDate, toDate: end, minorUnitsPerHour: "1500" } };
      const cost = await createFinanceInput(f.actor, entered, db);
      const scenario = await createStaffingScenario(f.actor, { requestKey: randomUUID(), rationale: "Synthetic advisory incomplete forecast",
        customerId: demand.customerId, engagementId: demand.engagementId, baselineId: demand.baselineId,
        baselineDigest: demand.baselineDigest, currency: "USD", fromDate: f.firstDate, toDate: f.firstDate }, db);
      const request = { requestKey: randomUUID(), customerId: demand.customerId, demandId: demand.demandId,
        revisionId: demand.revisionId, contentDigest: demand.contentDigest, expectedAggregateVersion: demand.aggregateVersion,
        mode: "finance", scenarioId: scenario.scenarioId, instructions: "Explain explicitly missing finance inputs without inventing amounts" };
      const prepared = await prepareStaffingAdvisory(f.actor, request, db);
      expect((await requireStaffingConversation(db, f.actor, prepared.conversationId!)).scope.scenarioId).toBe(scenario.scenarioId);
      await reviseFinanceInput(f.actor, cost.entityId, { ...entered, ...staffingExact(cost), requestKey: randomUUID(),
        input: { ...entered.input, minorUnitsPerHour: "1800" } }, db);
      await expect(requireStaffingConversation(db, f.actor, prepared.conversationId!)).rejects.toMatchObject({ status: 409 });
      await expect(prepareStaffingAdvisory(f.actor, request, db)).rejects.toMatchObject({ status: 409 });
      await expect(prepareStaffingAdvisory(f.actor, { ...request, requestKey: randomUUID() }, db)).rejects.toMatchObject({ status: 409 });
      expect((await db.query("SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1", [prepared.conversationId])).rows[0].n).toBe(0);
    });
  }, 120_000);
  it("serializes a rolling five-request admission limit and exact replay without creating a native response", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(async db => {
      const baseline = await createSyntheticDemandBaseline(db), panel = await createProfileTestSession(db, "panel");
      // Admission is principal-scoped. Give this case its own ordinary internal
      // member so earlier immutable advisory receipts remain intact.
      const principalId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
      const loginName = `staffing_admission_${principalId.replaceAll("-", "")}`;
      await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,$3)",
        [principalId, loginName, "Synthetic admission member"]);
      await db.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
        VALUES($1,$2,$3,'internal','member')`, [membershipId, principalId, panel.workspaceId]);
      await db.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
        VALUES($1,$2,$3,now()+interval '1 hour')`,
        [sessionId, principalId, createHash("sha256").update(sessionId).digest("hex")]);
      const actor = { ...panel, principalId, membershipId, sessionId, loginName };
      const draft = await createDemand(actor, { requestKey: randomUUID(), rationale: "Synthetic admission demand", demand: baseline.demand }, db);
      const qualified = await qualifyDemand(actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic admission qualification" }, db);
      const demand = await readDemand(actor, qualified.demandId, db);
      // This case requires a fresh owned clone; never rewrite immutable history
      // or erase admitted requests to make a rolling admission test pass.
      expect((await db.query(`SELECT count(*)::int AS n FROM staffing_advisory_attempts WHERE owner_membership_id=$1
        AND environment_id=$2 AND workspace_id=$3 AND created_at>clock_timestamp()-interval '1 hour'`,
        [actor.membershipId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0].n).toBe(0);
      return { actor, demand };
    });
    const body = { customerId: f.demand.customerId, demandId: f.demand.demandId, revisionId: f.demand.revisionId,
      contentDigest: f.demand.contentDigest, expectedAggregateVersion: f.demand.aggregateVersion,
      mode: "operational" as const, scenarioId: null, instructions: "Explain current staffing constraints" };
    const keys = Array.from({ length: 6 }, () => randomUUID());
    const outcomes = await Promise.allSettled(keys.map(requestKey => prepareStaffingAdvisory(f.actor, { ...body, requestKey })));
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(5);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    const index = outcomes.findIndex(result => result.status === "fulfilled"), accepted = outcomes[index];
    if (accepted.status !== "fulfilled") throw new Error("Synthetic admission unavailable");
    expect(await prepareStaffingAdvisory(f.actor, { ...body, requestKey: keys[index] })).toEqual(accepted.value);
    await expect(prepareStaffingAdvisory(f.actor, { ...body, requestKey: keys[index], instructions: "Changed input" })).rejects.toMatchObject({ status: 409 });
    await withTransaction(async db => {
      const native = await db.query(`SELECT count(*)::int AS n FROM response_attempts response JOIN staffing_advisory_attempts a
        ON a.conversation_id=response.conversation_id WHERE a.request_key=ANY($1::text[]) AND a.owner_membership_id=$2`, [keys, f.actor.membershipId]);
      expect(native.rows[0].n).toBe(0);
      const stored = await db.query(`SELECT count(*)::int AS n FROM staffing_advisory_attempts WHERE request_key=ANY($1::text[]) AND owner_membership_id=$2`, [keys, f.actor.membershipId]);
      expect(stored.rows[0].n).toBe(5);
      await db.query("SAVEPOINT advisory_identity_guard");
      await expect(db.query("UPDATE staffing_advisory_attempts SET created_at=created_at-interval '2 hours' WHERE id=$1", [accepted.value.attemptId]))
        .rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK TO SAVEPOINT advisory_identity_guard");
    });
  }, 120_000);
  it("fixes delivery audience, denies finance widening and generic tools, and fences a changed demand", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db), panel = await createProfileTestSession(db, "panel");
      const draft = await createDemand(f.actor, { requestKey: randomUUID(), rationale: "Synthetic staffing advice demand", demand: f.demand }, db);
      const qualified = await qualifyDemand(f.actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic staffing advice qualification" }, db);
      const demand = await readDemand(panel, draft.demandId, db);
      await expect(createFreshStaffingConversation(db, panel, demand, "finance", null)).rejects.toMatchObject({ status: 403 });
      const bound = await createFreshStaffingConversation(db, panel, demand, "operational", null);
      expect((await requireStaffingConversation(db, panel, bound.conversationId)).scope).toMatchObject({ ownerMembershipId: panel.membershipId,
        customerId: demand.customerId, demandRevisionId: demand.revisionId, mode: "operational", scenarioId: null });
      expect((await db.query("SELECT context_audience,owner_principal_id FROM conversations WHERE id=$1", [bound.conversationId])).rows[0])
        .toEqual({ context_audience: "delivery", owner_principal_id: panel.principalId });
      await expect(requireStaffingConversation(db, f.actor, bound.conversationId)).rejects.toMatchObject({ status: 404 });
      const messageId = randomUUID(), attemptId = randomUUID();
      await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
        VALUES($1,$2,$3,$4,'Synthetic staffing response attempt')`, [messageId, bound.conversationId, randomUUID(), "a".repeat(64)]);
      await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state)
        VALUES($1,$2,$3,$4,'prepared','pending')`, [attemptId, bound.conversationId, messageId, "a".repeat(64)]);
      // Synthetic DB identity only. This does not prove native transport or an
      // actual provider turn; those are separate required staffing-native cases.
      const advisoryId = randomUUID(), nativeSessionId = randomUUID(), turnId = `synthetic:${randomUUID()}`;
      await db.query(`INSERT INTO staffing_advisory_attempts(id,environment_id,workspace_id,binding_id,conversation_id,
        request_key,request_digest,owner_membership_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared')`,
        [advisoryId, process.env.TURAS_ENVIRONMENT_ID, panel.workspaceId, bound.bindingId, bound.conversationId, randomUUID(), "b".repeat(64), panel.membershipId]);
      await db.query("UPDATE staffing_advisory_attempts SET response_attempt_id=$2 WHERE id=$1", [advisoryId, attemptId]);
      await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1", [bound.conversationId, nativeSessionId]);
      await db.query("UPDATE response_attempts SET native_turn_id=$2 WHERE id=$1", [attemptId, turnId]);
      // Denial precedes default context retrieval; no private snapshot is needed.
      await expect(boundToolActor(db, { principalId: panel.principalId, attributes: { turasAttemptId: attemptId } }))
        .rejects.toMatchObject({ status: 403, code: "staffing_tool_denied" });
      await db.query("SAVEPOINT mixed_staffing_binding");
      await expect(db.query(`INSERT INTO planning_conversation_bindings(conversation_id,environment_id,workspace_id,customer_id,
        workload_id,plan_id,audience,owner_membership_id) VALUES($1,$2,$3,$4,$5,$6,'internal',$7)`,
        [bound.conversationId, process.env.TURAS_ENVIRONMENT_ID, panel.workspaceId, demand.customerId, demand.workloadId, f.demand.planId, panel.membershipId]))
        .rejects.toMatchObject({ code: "23514", message: "conversation has an immutable staffing binding" });
      await db.query("ROLLBACK TO SAVEPOINT mixed_staffing_binding");
      await reviseDemand(f.actor, draft.demandId, { ...staffingExact(qualified), requestKey: randomUUID(), rationale: "Synthetic changed advice demand",
        demand: { ...f.demand, title: "Synthetic changed request" } }, db);
      await expect(requireStaffingConversation(db, panel, bound.conversationId)).rejects.toMatchObject({ status: 409 });
      await requestCancellation(panel, nativeSessionId, turnId, db);
      expect((await db.query("SELECT state,response_attempt_id FROM staffing_advisory_attempts WHERE id=$1", [advisoryId])).rows[0])
        .toEqual({ state: "cancelled", response_attempt_id: attemptId });
      expect((await db.query("SELECT response_state FROM response_attempts WHERE id=$1", [attemptId])).rows[0].response_state).toBe("stopping");
    });
  }, 120_000);
});
