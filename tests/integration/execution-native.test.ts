import {query} from "../../lib/server/db/client";
import {runExecutionCleanupTick} from "../../lib/server/execution/maintenance";
import { expect, it } from "vitest";
import { withExecutionNativeCase } from "../fixtures/execution/native";

it("runs the native read-only catalog, fences every release and replays without a second provider call", async () => {
  await withExecutionNativeCase("normal", async f => {
    expect(await f.send()).toBe(202);
    const settled = await f.settled();
    expect(settled).toMatchObject({ state: "completed", outputReadable: true, inputTokens: 22, outputTokens: 14 });
    const calls = await f.providerCalls();
    expect(calls.length).toBeGreaterThan(0); expect(calls.length).toBeLessThanOrEqual(6);
    for (const call of calls) {
      expect(call.maxOutputTokens).toBe(4096); expect(call.deadlineMs).toBeGreaterThan(0); expect(call.deadlineMs).toBeLessThanOrEqual(120000);
      expect(call.tools.sort()).toEqual(["execution_effort", "execution_records", "execution_summary", "load_skill"]);
    }
    expect(await f.historyText()).toContain("Synthetic reviewed execution explanation");
    await f.send(); await f.reconnect();
    expect(await f.providerCalls()).toHaveLength(calls.length);
    expect(await f.otherOwnerHistoryStatus()).toBe(404);
    expect(await f.secondTurnStatus()).toBe(409);
  });
}, 240000);
it("withdraws saved history, reconnect and exact POST replay after a consumed source changes", async () => {
  await withExecutionNativeCase("normal", async f => {
    await f.send(); await f.settled(); const count = (await f.providerCalls()).length;
    const context=(await query("SELECT r.snapshot,p.snapshot AS content FROM context_snapshot_receipts r JOIN execution_advice_attempts a ON a.response_attempt_id=r.attempt_id JOIN execution_advice_context_payloads p ON p.attempt_id=a.id WHERE a.id=$1",[f.reserved.attemptId])).rows[0];
    expect(context.snapshot).toEqual({contractVersion:"execution-context-retained-v1",attemptId:f.reserved.attemptId});
    expect(context.content.execution.engagementId).toBe(f.source.engagementId);
    const usage=(await query("SELECT to_jsonb(u) AS row FROM execution_advice_usage u WHERE attempt_id=$1 ORDER BY step_id",[f.reserved.attemptId])).rows;
    await f.withdrawEvidence();
    await query("UPDATE execution_cleanup_jobs SET ineligible_at=now()-interval '31 days',due_at=now()-interval '1 day' WHERE engagement_id=$1",[f.source.engagementId]);
    expect((await runExecutionCleanupTick()).purged).toBeGreaterThan(0);
    expect((await query("SELECT 1 FROM execution_advice_context_payloads WHERE attempt_id=$1",[f.reserved.attemptId])).rowCount).toBe(0);
    expect((await query("SELECT 1 FROM execution_advice_read_payloads p JOIN execution_advice_reads r ON r.id=p.receipt_id WHERE r.attempt_id=$1",[f.reserved.attemptId])).rowCount).toBe(0);
    expect((await query("SELECT to_jsonb(u) AS row FROM execution_advice_usage u WHERE attempt_id=$1 ORDER BY step_id",[f.reserved.attemptId])).rows).toEqual(usage);
    expect((await f.status()).outputReadable).toBe(false);
    expect(await f.historyStatus()).toBe(409); expect(await f.reconnect()).toBe(409); expect(await f.send()).toBe(409);
    expect(await f.admissionReplayStatus()).toBe(409);
    expect(await f.providerCalls()).toHaveLength(count);
  });
}, 240000);
it("fences an attached native stream after withdrawal and still records terminal usage", async () => {
  await withExecutionNativeCase("barrier", async f => {
    await f.send(); await f.waitAtProvider(); const stream = await f.attachStream();
    await f.withdrawEvidence(); await f.releaseProvider();
    expect(await stream.text).not.toContain("Synthetic reviewed execution explanation");
    expect((await f.settled()).outputReadable).toBe(false);
    expect(await f.usageCount()).toBeLessThanOrEqual((await f.providerCalls()).length);
  });
}, 240000);
it("counts procedure loads in the shared read limit and forbids generic or write tools", async () => {
  await withExecutionNativeCase("limits", async f => {
    await f.send(); const state = await f.settled();
    expect(state.readCalls).toBe(6); expect(state.stepsAdmitted).toBeLessThanOrEqual(6);
    expect(state.contextBytes).toBeLessThanOrEqual(24576); expect(state.dependencyCount).toBeLessThanOrEqual(200);
    expect(await f.forbiddenToolEffects()).toBe(0); expect(await f.profileReadCharges()).toBe(0);
  });
}, 240000);
it("cancels without redispatch or releasing late model content", async () => {
  await withExecutionNativeCase("barrier", async f => {
    await f.send(); await f.waitAtProvider(); await f.cancel(); await f.releaseProvider();
    expect((await f.settled()).outputReadable).toBe(false);
    expect(await f.historyText()).not.toContain("Synthetic reviewed execution explanation");
    const count = (await f.providerCalls()).length; await f.reconnect(); await f.send();
    expect(await f.providerCalls()).toHaveLength(count);
  });
}, 240000);
it("allows metadata settlement after login revocation or disable while suppressing output", async () => {
  await withExecutionNativeCase("barrier", async f => {
    await f.send(); await f.waitAtProvider(); await f.revokeLogin(); await f.releaseProvider();
    expect((await f.settled()).outputReadable).toBe(false);
    expect(await f.historyStatus()).toBe(401); expect(await f.providerCalls()).toHaveLength(1);
  });
  await withExecutionNativeCase("normal", async f => {
    await f.send(); const before = await f.settled(), calls = (await f.providerCalls()).length;
    await f.disable();
    expect(await f.status()).toMatchObject({ outputReadable: false, inputTokens: before.inputTokens, outputTokens: before.outputTokens });
    expect(await f.historyStatus()).toBe(503); expect(await f.send()).toBe(503);
    expect(await f.providerCalls()).toHaveLength(calls);
  });
}, 240000);
it("keeps interrupted dispatch unconfirmed across restart and never invents unknown usage", async () => {
  await withExecutionNativeCase("unknown", async f => {
    await f.send(); await f.waitAtProvider(); await f.restart();
    const settled = await f.settled();
    expect(["unconfirmed", "failed", "cancelled", "expired"]).toContain(settled.state);
    expect(settled.outputReadable).toBe(false); expect(settled.inputTokens).toBeNull(); expect(settled.outputTokens).toBeNull();
    expect(await f.providerCalls()).toHaveLength(1); await f.send(); await f.reconnect();
    expect(await f.providerCalls()).toHaveLength(1);
  });
}, 240000);
it("invalidates consumed absence and collection inputs after a new reviewed blocker", async () => {
  await withExecutionNativeCase("normal", async f => {
    await f.send(); await f.settled(); await f.addReviewedBlocker();
    expect((await f.status()).outputReadable).toBe(false); expect(await f.historyStatus()).toBe(409);
    expect(await f.reconnect()).toBe(409);
  });
}, 240000);
