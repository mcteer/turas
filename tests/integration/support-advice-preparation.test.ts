import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { prepareSupportAdvice } from "../../lib/server/support/advisory";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { supportAdvicePrompt } from "../../lib/support/advice";
import { messageDigest } from "../../lib/server/conversations/dispatch";
import { projectSupportNativeEventInTransaction } from "../../lib/server/support/native-events";
import { readSupportInitialContext } from "../../lib/server/support/native";
import { admitSupportModelStep, assertSupportProviderRelease } from "../../lib/server/support/native-admission";
import { runSupportRead } from "../../lib/server/support/tools";
import { saveSupportSuggestion } from "../../lib/server/support/suggestions";
import { supportDigest } from "../../lib/server/support/commands";
import { runSupportAdviceCleanupTick } from "../../lib/server/support/maintenance";
import { authorizeSupportRetirement, processSupportNativeRetirement } from "../../lib/server/support/native-retirement";
import { boundSupportToolActor } from "../../lib/server/support/tool-actor";
import { createSupportOutcomeEvidence } from "../fixtures/support/outcome";
import { createPublishedPlanPractice } from "../fixtures/plans/journey";
import { submitProfileCommand } from "../../lib/server/profiles/service";

describe("atomic support advice preparation", () => {
  let actor: CurrentSession;
  beforeAll(async () => { actor = await withSupportDatabase(db => createProfileTestSession(db, "panel")); });
  async function fresh(owner = actor.principalId) {
    const customerId = randomUUID(), conversationId = randomUUID();
    await withSupportDatabase(async db => {
      await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic advice preparation',true)", [customerId, DEMO_IDS.workspace]);
      await db.query(`INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,
        creation_operation_id,binding_state,title,context_audience,context_generation,context_snapshot_schema,context_login_session_id,context_membership_id)
        VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic support advice','delivery',0,'customer-context-v1',$7,$8)`,
      [conversationId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, owner, randomUUID(), actor.sessionId, actor.membershipId]);
    });
    return { customerId, input: { requestKey: randomUUID(), conversationId, workloadId: null,
      audience: "delivery", selectedEngagementIds: [], sourceRefs: [] } };
  }
  it("captures no-engagement unknowns without provider work and replays one exact attempt", async () => {
    const f = await fresh(), saved = await prepareSupportAdvice(actor, f.customerId, f.input);
    expect(saved.state).toBe("prepared");
    expect(await prepareSupportAdvice(actor, f.customerId, f.input)).toEqual(saved);
    await withSupportDatabase(async db => {
      const context = (await db.query("SELECT payload FROM support_advice_payloads WHERE attempt_id=$1 AND kind='context'", [saved.attemptId])).rows[0].payload;
      expect(context.snapshot.readiness).toBe("not_assessed");
      expect(context.snapshot.engagements).toEqual([]);
      expect(context.snapshot.unknowns.externalResolution).toBe("unknown");
      expect((await db.query("SELECT 1 FROM support_model_step_receipts WHERE attempt_id=$1", [saved.attemptId])).rowCount).toBe(0);
      await db.query("UPDATE support_advice_attempts SET state='cancelled',settled_at=clock_timestamp()-interval '31 days' WHERE id=$1", [saved.attemptId]);
    });
    expect((await runSupportAdviceCleanupTick()).purged).toBe(1);
    await withSupportDatabase(async db => {
      expect((await db.query("SELECT 1 FROM support_advice_payloads WHERE attempt_id=$1", [saved.attemptId])).rowCount).toBe(0);
      expect((await db.query("SELECT 1 FROM support_advice_retirements WHERE attempt_id=$1", [saved.attemptId])).rowCount).toBe(1);
      await expect(db.query("INSERT INTO support_advice_payloads(attempt_id,kind,content_digest,payload) VALUES($1,'output',$2,'{}'::jsonb)",
        [saved.attemptId, "a".repeat(64)])).rejects.toMatchObject({ code: "23514" });
    });
    expect((await runSupportAdviceCleanupTick()).purged).toBe(0);
    const previousOrigin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
    const nativeSession = `synthetic-retirement-${randomUUID()}`;
    await withSupportDatabase(db => db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1", [f.input.conversationId, nativeSession]));
    process.env.TURAS_EVE_INTERNAL_ORIGIN = "http://127.0.0.1:34567/";
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`http://127.0.0.1:34567/eve/v1/session/${nativeSession}/reset`);
      expect(await authorizeSupportRetirement(new Request(url, init), nativeSession)).toBe(actor.principalId);
      expect(await authorizeSupportRetirement(new Request(url, init), "wrong-session")).toBeNull();
      const headers = new Headers(init.headers);
      headers.set("x-turas-support-retire-signature", "0".repeat(64));
      expect(await authorizeSupportRetirement(new Request(url, { ...init, headers }), nativeSession)).toBeNull();
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await processSupportNativeRetirement()).toBe(true);
      expect(await processSupportNativeRetirement()).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (previousOrigin === undefined) delete process.env.TURAS_EVE_INTERNAL_ORIGIN;
      else process.env.TURAS_EVE_INTERNAL_ORIGIN = previousOrigin;
    }
  }, 60_000);
  it("refuses a conversation owned by another principal", async () => {
    const f = await fresh(DEMO_IDS.mcteer);
    await expect(prepareSupportAdvice(actor, f.customerId, f.input)).rejects.toMatchObject({ status: 404 });
  });
  it("tracks shared knowledge's private original for withdrawal without exposing its lineage", async () => {
    const f = await fresh(), reviewer = await withSupportDatabase(db => createProfileTestSession(db, "mcteer"));
    const practice = await withSupportDatabase(db => createPublishedPlanPractice(db, actor, reviewer, actor.workspaceId));
    const input = { ...f.input, sourceRefs: [practice.reference] };
    const saved = await prepareSupportAdvice(actor, f.customerId, input);
    const version = await withSupportDatabase(async db => {
      const dependencies = (await db.query("SELECT kind,revision_id FROM support_advice_dependencies WHERE attempt_id=$1 ORDER BY kind", [saved.attemptId])).rows;
      expect(dependencies).toEqual([
        { kind: "accepted_profile", revision_id: practice.originRevisionId },
        { kind: "shared_knowledge", revision_id: practice.reference.sourceRevisionId },
      ]);
      expect((await db.query("SELECT dependency_count FROM support_advice_attempts WHERE id=$1", [saved.attemptId])).rows[0].dependency_count).toBe(2);
      const context = JSON.stringify((await db.query("SELECT payload FROM support_advice_payloads WHERE attempt_id=$1 AND kind='context'", [saved.attemptId])).rows[0].payload.snapshot);
      for (const hidden of [practice.privateOriginName, practice.originCustomerId, practice.originRevisionId, "Synthetic private build-stage observation"])
        expect(context).not.toContain(hidden);
      return Number((await db.query(`SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1`, [practice.originRevisionId])).rows[0].version);
    });
    await submitProfileCommand(reviewer, practice.originCustomerId, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: practice.originRevisionId, expectedRecordVersion: version, rationale: "Original synthetic evidence withdrawn" });
    await withSupportDatabase(async db => expect((await db.query("SELECT 1 FROM support_advice_retirements WHERE attempt_id=$1", [saved.attemptId])).rowCount).toBe(1));
    await expect(prepareSupportAdvice(actor, f.customerId, input)).rejects.toMatchObject({ code: "support_context_changed" });
    await withSupportDatabase(db => db.query("UPDATE support_advice_attempts SET state='cancelled',settled_at=clock_timestamp() WHERE id=$1", [saved.attemptId]));
  }, 60_000);
  it("checks discovery permission, original source identity and canonical evidence reads with exact replay", async () => {
    const f = await fresh();
    const reviewer = await withSupportDatabase(db => createProfileTestSession(db, "mcteer"));
    const evidence = await createSupportOutcomeEvidence(actor, reviewer, f.customerId);
    const reference = evidence.reference;
    if (!("locator" in reference) || !reference.citationId) throw new Error("Original discovery citation required by fixture");
    await withSupportDatabase(db => db.query(`UPDATE conversations SET context_generation=(
      SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$2 AND workspace_id=$3) WHERE id=$1`,
    [f.input.conversationId, f.customerId, actor.workspaceId]));
    await expect(prepareSupportAdvice(actor, f.customerId, { ...f.input,
      sourceRefs: [{ ...reference, citationId: randomUUID() }] })).rejects.toThrow();
    const saved = await prepareSupportAdvice(actor, f.customerId, { ...f.input, sourceRefs: [reference] });
    try {
      await withSupportDatabase(async db => {
        const refs = (await db.query("SELECT payload FROM support_advice_payloads WHERE attempt_id=$1 AND kind='source_map'", [saved.attemptId])).rows[0].payload;
        const { citationId: _citationId, ...original } = reference;
        expect(refs).toEqual([original]);
        expect(refs[0]).not.toHaveProperty("citationId");
      });
      const responseAttemptId = randomUUID(), messageId = randomUUID(), nativeSessionId = `synthetic-evidence-${randomUUID()}`, turnId = "synthetic-evidence-turn";
      const principal = { principalId: actor.principalId, attributes: { turasAttemptId: responseAttemptId } };
      await withSupportDatabase(async db => {
        await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1", [f.input.conversationId, nativeSessionId]);
        await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)",
          [messageId, f.input.conversationId, saved.nativeRequestId, messageDigest(supportAdvicePrompt), supportAdvicePrompt]);
        await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at)
          VALUES($1,$2,$3,$4,'dispatching','pending',now()+interval '120 seconds')`, [responseAttemptId, f.input.conversationId, messageId, messageDigest(supportAdvicePrompt)]);
        await db.query("UPDATE support_advice_attempts SET response_attempt_id=$2,state='running',dispatch_at=now(),deadline_at=now()+interval '120 seconds' WHERE id=$1", [saved.attemptId, responseAttemptId]);
        await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.received",
          meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId, message: supportAdvicePrompt } });
      });
      const injected = await readSupportInitialContext(principal, turnId, nativeSessionId);
      expect(injected).toMatchObject({
        currentDate: new Date().toISOString().slice(0, 10),
        evidence: [{ citationKey: reference.id, text: expect.stringContaining("Synthetic operating ownership verification outcome"),
          observationDate: evidence.observedAt }],
      });
      expect(JSON.stringify(injected)).not.toContain(reference.citationId);
      const sourceKeys = [reference.id];
      const result = await runSupportRead(principal, "support_evidence", { sourceKeys }, "synthetic-evidence-read");
      expect(result).toMatchObject({ evidence: [{ citationKey: reference.id, text: expect.any(String) }] });
      expect(await runSupportRead(principal, "support_evidence", { sourceKeys }, "synthetic-evidence-read")).toEqual(result);
      await expect(runSupportRead(principal, "support_evidence", { sourceKeys: [randomUUID()] }, "synthetic-forged-read"))
        .rejects.toMatchObject({ code: "support_source_denied" });
    } finally {
      await withSupportDatabase(db => db.query("UPDATE support_advice_attempts SET state='cancelled',settled_at=clock_timestamp() WHERE id=$1", [saved.attemptId]));
    }
  }, 60_000);
  it("charges injected bound reads and durable steps, rejects paid retries and withholds deltas", async () => {
    const f = await fresh(), saved = await prepareSupportAdvice(actor, f.customerId, f.input);
    const responseAttemptId = randomUUID(), messageId = randomUUID(), nativeSessionId = `synthetic-support-${randomUUID()}`, turnId = "synthetic-turn";
    await withSupportDatabase(async db => {
      await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1", [f.input.conversationId, nativeSessionId]);
      await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)",
        [messageId, f.input.conversationId, saved.nativeRequestId, messageDigest(supportAdvicePrompt), supportAdvicePrompt]);
      await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at)
        VALUES($1,$2,$3,$4,'dispatching','pending',now()+interval '120 seconds')`, [responseAttemptId, f.input.conversationId, messageId, messageDigest(supportAdvicePrompt)]);
      await db.query("UPDATE support_advice_attempts SET response_attempt_id=$2,state='running',dispatch_at=now(),deadline_at=now()+interval '120 seconds' WHERE id=$1", [saved.attemptId, responseAttemptId]);
      const principal = { principalId: actor.principalId, attributes: { turasAttemptId: responseAttemptId } };
      await expect(boundSupportToolActor(db, principal, undefined, true)).rejects.toMatchObject({ code: "support_advice_unavailable" });
      expect((await boundSupportToolActor(db, principal, undefined, true, true)).responseAttemptId).toBe(responseAttemptId);
      await expect(boundSupportToolActor(db, principal, undefined, false, true)).rejects.toMatchObject({ code: "support_advice_unavailable" });
      await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.received",
        meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId, message: supportAdvicePrompt } });
    });
    const principal = { principalId: actor.principalId, attributes: { turasAttemptId: responseAttemptId } };
    await readSupportInitialContext(principal, turnId, nativeSessionId);
    const identity = { nativeSessionId, responseAttemptId, turnId, stepIndex: 0 };
    expect((await admitSupportModelStep(principal, identity)).mode).toBe("support");
    await assertSupportProviderRelease(principal, identity);
    await expect(assertSupportProviderRelease(principal, { ...identity, nativeSessionId: "synthetic-other-native" }))
      .rejects.toMatchObject({ status: 404 });
    await withSupportDatabase(db => db.query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [actor.sessionId]));
    try {
      await expect(assertSupportProviderRelease(principal, identity)).rejects.toThrow();
    } finally {
      await withSupportDatabase(db => db.query("UPDATE login_sessions SET revoked_at=NULL WHERE id=$1", [actor.sessionId]));
    }
    await expect(admitSupportModelStep(principal, identity)).rejects.toMatchObject({ code: "support_step_uncertain" });
    await withSupportDatabase(async db => {
      const eventId = `evt_${randomUUID()}`;
      await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.completed",
        meta: { id: eventId, at: new Date().toISOString() },
        data: { turnId, finishReason: "tool-calls", message: "Synthetic unvalidated pre-tool narration" } }, undefined,
      { principal, conversationId: f.input.conversationId, responseAttemptId, nativeSessionId });
      expect((await db.query("SELECT state,failure_code FROM support_advice_attempts WHERE id=$1", [saved.attemptId])).rows[0])
        .toEqual({ state: "running", failure_code: null });
      expect((await db.query("SELECT visible_payload FROM event_projections WHERE native_event_id=$1", [eventId])).rows[0].visible_payload).toEqual({});
      expect((await db.query("SELECT 1 FROM support_advice_payloads WHERE attempt_id=$1 AND kind='output'", [saved.attemptId])).rowCount).toBe(0);
    });
    const read = await runSupportRead(principal, "support_summary", {}, "synthetic-summary");
    expect(await runSupportRead(principal, "support_summary", {}, "synthetic-summary")).toEqual(read);
    await expect(runSupportRead(principal, "load_skill", { name: "research" }, "synthetic-forbidden")).rejects.toMatchObject({ status: 400 });
    await withSupportDatabase(async db => {
      await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.appended",
        meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId, messageDelta: "Unvalidated customer output" } });
      const projection = (await db.query("SELECT visible_payload FROM event_projections WHERE conversation_id=$1 AND event_type='message.appended'", [f.input.conversationId])).rows[0];
      expect(projection.visible_payload).toEqual({});
      expect((await db.query("SELECT read_calls,model_steps FROM support_advice_attempts WHERE id=$1", [saved.attemptId])).rows[0]).toEqual({ read_calls: 1, model_steps: 1 });
    });
    const today = new Date().toISOString().slice(0, 10), next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const content = { contractVersion: "support-v1", title: "Confirm operating owner", observationDate: today, nextReviewDate: next,
      timezone: "UTC", desiredOutcome: "Document the responsible role", rationale: "Ownership is unknown",
      validationCriterion: "Review an accepted stakeholder record", priority: "normal", owner: { kind: "unassigned", reason: "Confirm the owner" },
      disposition: "open", outcomeSourceKeys: [] };
    const output = { contractVersion: "support-advice-v1", summary: "Confirm missing operating evidence", facts: [], unknowns: ["Operating owner"],
      actionSuggestions: [{ content, citationKeys: [] }] };
    await withSupportDatabase(async db => {
      await db.query("BEGIN");
      try {
        await db.query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [actor.sessionId]);
        const eventId = `evt_${randomUUID()}`;
        await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.completed",
          meta: { id: eventId, at: new Date().toISOString() }, data: { turnId, message: JSON.stringify(output) } }, undefined,
        { principal, conversationId: f.input.conversationId, responseAttemptId, nativeSessionId });
        expect((await db.query("SELECT visible_payload FROM event_projections WHERE native_event_id=$1", [eventId])).rows[0].visible_payload).toEqual({});
        expect((await db.query("SELECT state FROM support_advice_attempts WHERE id=$1", [saved.attemptId])).rows[0].state).toBe("failed");
        expect((await db.query("SELECT 1 FROM support_advice_payloads WHERE attempt_id=$1 AND kind='output'", [saved.attemptId])).rowCount).toBe(0);
        await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "step.completed",
          meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId, stepIndex: 0, usage: { inputTokens: 11, outputTokens: 7 } } });
        expect((await db.query(`SELECT u.outcome,u.input_tokens::int,u.output_tokens::int FROM support_advice_usage u
          JOIN support_model_step_receipts s ON s.id=u.step_id WHERE s.attempt_id=$1`, [saved.attemptId])).rows)
          .toEqual([{ outcome: "confirmed", input_tokens: 11, output_tokens: 7 }]);
      } finally { await db.query("ROLLBACK"); }
    });
    await withSupportDatabase(async db => {
      await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "message.completed",
        meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId, message: JSON.stringify(output) } }, undefined,
      { principal, conversationId: f.input.conversationId, responseAttemptId, nativeSessionId });
      await projectSupportNativeEventInTransaction(db, nativeSessionId, responseAttemptId, { type: "turn.completed",
        meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() }, data: { turnId } });
    });
    const saveInput = { contractVersion: "support-v1", operation: "save_suggestion", requestKey: randomUUID(), workloadId: null,
      expectedVersion: 0, attemptId: saved.attemptId, outputDigest: supportDigest(output), suggestionIndex: 0, content };
    const receipt = await saveSupportSuggestion(actor, f.customerId, saveInput);
    expect(receipt.outcome).toBe("proposed");
    expect(await saveSupportSuggestion(actor, f.customerId, saveInput)).toEqual(receipt);
    await withSupportDatabase(async db => expect((await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [receipt.recordId])).rows[0].accepted_revision_id).toBeNull());
    // The normal first save changes the support scope generation. Probe the real
    // retained output, not a fabricated digest, with a fresh command identity.
    const staleKey = randomUUID();
    const before = await withSupportDatabase(async db => (await db.query(`SELECT
      (SELECT count(*) FROM support_records WHERE scope_id=$1) AS records,
      (SELECT count(*) FROM support_revisions WHERE scope_id=$1) AS revisions,
      (SELECT count(*) FROM support_command_receipts WHERE scope_id=$1) AS receipts`, [receipt.scopeId])).rows[0]);
    await expect(saveSupportSuggestion(actor, f.customerId, { ...saveInput, requestKey: staleKey,
      expectedVersion: 1 })).rejects.toMatchObject({ status: 409, code: "support_context_changed" });
    await withSupportDatabase(async db => {
      const retained = (await db.query("SELECT payload,content_digest FROM support_advice_payloads WHERE attempt_id=$1 AND kind='output'", [saved.attemptId])).rows[0];
      expect(retained.payload).toEqual(output);
      expect(retained.content_digest).toBe(saveInput.outputDigest);
      const after = (await db.query(`SELECT
        (SELECT count(*) FROM support_records WHERE scope_id=$1) AS records,
        (SELECT count(*) FROM support_revisions WHERE scope_id=$1) AS revisions,
        (SELECT count(*) FROM support_command_receipts WHERE scope_id=$1) AS receipts`, [receipt.scopeId])).rows[0];
      expect(after).toEqual(before);
      expect((await db.query("SELECT 1 FROM support_command_receipts WHERE request_key=$1", [staleKey])).rowCount).toBe(0);
    });
  }, 90_000);
});
