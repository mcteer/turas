import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import fixture from "../evals/fixtures/007-staffing-cases.json";
import { withStaffingEvalEnvironment, requireOwnedStaffingClone } from "./staffing-eval-environment";
import { staffingEvalFixtureDigest } from "./verify-staffing-review";
import { installStaffingLiveObservation } from "../tests/fixtures/staffing/live";
import { buildStaffingLiveCase, type StaffingLiveCaseId } from "../tests/fixtures/staffing/live-cases";
import { probeStaffingLiveDeniedTools } from "../tests/fixtures/staffing/live-denial";
import { readOwnedStaffingPair } from "../tests/fixtures/staffing/pair";
import { closeRuntimePool, query } from "../lib/server/db/client";
import { captureStaffingLiveStream } from "./staffing-live-stream";
import { staffingLiveLedgerDigest, readStaffingLiveEvidence, readStaffingLivePartialEvidence, readStaffingLiveWriteReceipts } from "./staffing-live-evidence";
import { assertStaffingLiveWrites, type StaffingLiveExpectedWrite } from "./staffing-live-writes";
import { staffingLiveSourceDigest } from "./staffing-live-source";
import { staffingLiveCancellationOutcome } from "./staffing-live-cancellation";
import { staffingLiveLogin, prepareStaffingLive, dispatchStaffingLive, readStaffingLiveStatus,
  waitStaffingLive, staffingLivePost, reconcileStaffingLive, type StaffingLiveAuth, type StaffingLivePrepared } from "./staffing-live-runtime";

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
let activeStage = "configuration";
const privateJson = async (path: string, value: unknown) => {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 2_000_000) throw new Error("Private live artifact exceeds limit");
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  return sha(bytes);
};

/** Every preflight runs here, with no model key. There is no CLI bypass or
 * externally supplied passing report. Logs stay private, including failures. */
async function deterministicGate(directory: string, name: string, args: string[], inert = false) {
  const env = { ...process.env, TURAS_ALLOW_LIVE_MODEL_TESTS: "0", AI_GATEWAY_API_KEY: "" };
  if (inert) for (const key of Object.keys(env)) if (key.includes("DATABASE") && key.endsWith("URL"))
    env[key as keyof typeof env] = "postgresql://127.0.0.1:9/turas_test_007_build";
  const fd = openSync(join(directory, `${name}.log`), "wx", 0o600);
  try {
    await new Promise<void>((resolveGate, reject) => {
      const child = spawn(process.execPath, args, { env, stdio: ["ignore", fd, fd] });
      const timer = setTimeout(() => { child.kill("SIGTERM"); }, 1_200_000);
      const force = setTimeout(() => { child.kill("SIGKILL"); }, 1_205_000);
      child.once("error", () => { clearTimeout(timer); clearTimeout(force); reject(new Error("Deterministic gate could not start")); });
      child.once("exit", code => { clearTimeout(timer); clearTimeout(force); code === 0 ? resolveGate() : reject(new Error(`Deterministic gate failed: ${name}`)); });
    });
    console.log(JSON.stringify({ gate: name, state: "passed", paidDispatches: 0 }));
  } finally { closeSync(fd); }
}

async function assertReplayDenied(origin: string, auth: StaffingLiveAuth, prepared: StaffingLivePrepared, nativeSessionId: string, deadline: number) {
  for (const path of [`/api/conversations/${prepared.conversationId}`, `/eve/v1/session/${nativeSessionId}/stream?startIndex=0`]) {
    const response = await fetch(`${origin}${path}`, { redirect: "error", headers: { cookie: auth.cookie },
      signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))) });
    if (response.status !== 409) { await response.body?.cancel(); throw new Error("Changed live content replay was not denied"); }
    await response.body?.cancel();
  }
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--live" || process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY)
    throw new Error("Eight-case evaluation requires --live, explicit live opt-in and selected model key; no overrides are supported");
  await mkdir("local-artifacts/007", { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/007/live-")), runId = randomUUID();
  activeStage = "source-fingerprint";
  const sourceDigest = await staffingLiveSourceDigest();
  const assertSourceUnchanged = async () => {
    if (await staffingLiveSourceDigest() !== sourceDigest) throw new Error("Live source changed after deterministic preflight; start a new recorded run");
  };
  const preflight = [
    ["typecheck", ["node_modules/typescript/bin/tsc"]],
    ["staffing", ["--import", "tsx", "scripts/test-staffing.ts"]],
    ["regressions", ["--import", "tsx", "scripts/test-staffing-regressions.ts"]],
    ["webkit", ["--import", "tsx", "scripts/check-staffing-ui.ts"]],
    ["recovery", ["--import", "tsx", "scripts/staffing-recovery-check.ts", "--disposable"]],
    ["performance", ["--import", "tsx", "scripts/benchmark-staffing.ts", "--disposable"]],
    ["build", ["scripts/build-check.mjs"]], ["docs", ["scripts/check-docs.mjs"]],
  ] as const;
  for (const [name, args] of preflight) {
    activeStage = `preflight-${name}`;
    await deterministicGate(directory, name, [...args], name === "build");
  }
  await assertSourceUnchanged();
  await privateJson(join(directory, "preflight.json"), { runId, sourceDigest, fixtureDigest: staffingEvalFixtureDigest(),
    gates: preflight.map(([name]) => ({ name, state: "passed" })), paidDispatches: 0 });
  const suiteStarted = Date.now(), suiteDeadline = suiteStarted + fixture.limits.suiteSeconds * 1000;
  let initialDispatches = 0;
  const reviewCases: unknown[] = [];
  for (const definition of fixture.cases) {
    await assertSourceUnchanged();
    if (Date.now() >= suiteDeadline || initialDispatches >= 8) throw new Error("Original live suite allowance reached");
    const id = definition.id as StaffingLiveCaseId;
    activeStage = `owned-${id}`;
    const environmentStarted = Date.now(), dispatchesBefore = initialDispatches;
    let callbackEntered = false, failedCaseRecorded = false;
    try {
    await withStaffingEvalEnvironment(async environment => {
      callbackEntered = true;
      requireOwnedStaffingClone();
      let auth: StaffingLiveAuth | undefined, binding: Awaited<ReturnType<typeof prepareStaffingLive>> | undefined;
      let turnId: string | null = null, didDispatch = false;
      let captureState: { outcome: string; reason?: string; terminal?: string; status?: number } | null = null;
      const events: unknown[] = [];
      let suppressOutputAfter: number | null = null;
      let restartEvidence: unknown = null;
      const setupStarted = Date.now();
      let started = setupStarted, deadline = suiteDeadline;
      try {
        await environment.prepareRuntime();
        const current = await buildStaffingLiveCase(id);
        await installStaffingLiveObservation(environment);
        await environment.start();
        started = Date.now(); deadline = Math.min(started + 120_000, suiteDeadline);
        auth = await staffingLiveLogin(environment.origin, definition.role as "panel" | "mcteer", deadline);
        binding = await prepareStaffingLive(environment.origin, auth, current, definition.instruction, deadline);
        const { prepared, nativeSessionId } = binding;
        await assertSourceUnchanged();
        if (id === "S04" || id === "S08") await query("INSERT INTO staffing_live_provider_barriers(attempt_id,step_index) VALUES($1,1)", [prepared.attemptId]);
        const ledgerBefore = await staffingLiveLedgerDigest();
        const writesBefore = await readStaffingLiveWriteReceipts(), expectedWrites: StaffingLiveExpectedWrite[] = [];
        initialDispatches++; didDispatch = true; // Uncertain dispatch is never resent.
        await dispatchStaffingLive(environment.origin, auth, prepared, nativeSessionId, definition.instruction, deadline);
        const status = () => readStaffingLiveStatus(environment.origin, auth!, prepared.attemptId, deadline);
        const owned = await waitStaffingLive(status, value => !!value.nativeTurnId, deadline);
        turnId = owned.nativeTurnId!;
        const denialProbes = id === "S07" ? await probeStaffingLiveDeniedTools(prepared.attemptId) : [];
        // Retain rejected capture as explicit interruption metadata. Only S08's
        // intentional supervisor restart permits this branch; it cannot pass a
        // required completed-response case.
        const capturePromise = captureStaffingLiveStream({ origin: environment.origin, cookie: auth.cookie, nativeSessionId,
          turnId, deadlineAt: deadline, suiteDeadlineAt: suiteDeadline, onEvent: async event => { events.push(event); } })
          .then(capture => ({ capture, interrupted: false }), () => ({ capture: null, interrupted: true }));
        let activeOutputDeniedAfterChange = false, replayDeniedAfterChange = false, pairedRestartIdentityPreserved = false, ownedNativeCancelObserved = false;
        if (id === "S04" || id === "S08") {
          await waitStaffingLive(async () => (await query(`SELECT count(*)::int AS n FROM staffing_live_provider_observations o
            WHERE o.attempt_id=$1 AND o.step_index=1 AND EXISTS(SELECT 1 FROM staffing_model_step_receipts s
              JOIN staffing_model_step_usage_receipts u ON u.step_receipt_id=s.id WHERE s.attempt_id=o.attempt_id AND s.ordinal=1)`,
          [prepared.attemptId])).rows[0].n as number, n => n === 1 && events.length > 0, deadline);
          if (id === "S04") {
            suppressOutputAfter = Date.now();
            await current.changeConsumedInput();
            const invalid = await status();
            if (invalid.outputReadable || !invalid.fenced) throw new Error("Consumed source did not fence active output");
            activeOutputDeniedAfterChange = true;
          } else {
            suppressOutputAfter = Date.now();
            const stopped = await staffingLivePost(environment.origin, auth, `/api/staffing/advisory/${prepared.attemptId}/cancel`, {}, deadline);
            if (!stopped.ok || (await stopped.json()).data.state !== "cancelled") throw new Error("Owned live cancellation not durable");
            const originalPair = await readOwnedStaffingPair(environment);
            const paid = (await query("SELECT id,ordinal,step_token FROM staffing_model_step_receipts WHERE attempt_id=$1 ORDER BY ordinal", [prepared.attemptId])).rows;
            await environment.stop(); await closeRuntimePool(); await environment.start();
            const restartedPair = await readOwnedStaffingPair(environment);
            const paidAfter = (await query("SELECT id,ordinal,step_token FROM staffing_model_step_receipts WHERE attempt_id=$1 ORDER BY ordinal", [prepared.attemptId])).rows;
            restartEvidence = { before: originalPair, after: restartedPair, paidBefore: paid, paidAfter };
            if (JSON.stringify(restartedPair) !== JSON.stringify(originalPair) || JSON.stringify(paidAfter) !== JSON.stringify(paid))
              throw new Error("Owned paired restart identity changed");
            pairedRestartIdentityPreserved = true;
            const cancelled = await staffingLivePost(environment.origin, auth, `/eve/v1/session/${nativeSessionId}/cancel`, { turnId }, deadline);
            if (![200, 202].includes(cancelled.status)) throw new Error("Original native cancellation not acknowledged");
            ownedNativeCancelObserved = true;
          }
          await query("UPDATE staffing_live_provider_barriers SET released=true WHERE attempt_id=$1", [prepared.attemptId]);
          await assertReplayDenied(environment.origin, auth, prepared, nativeSessionId, deadline); replayDeniedAfterChange = true;
        }
        const captured = await capturePromise;
        captureState = captured.capture ? { outcome: captured.capture.outcome,
          ...("reason" in captured.capture ? { reason: captured.capture.reason } : {}),
          ...("terminal" in captured.capture ? { terminal: captured.capture.terminal } : {}),
          ...("status" in captured.capture ? { status: captured.capture.status } : {}) } : { outcome: "interrupted" };
        if (suppressOutputAfter !== null && events.some(raw => {
          const event = raw as { type?: string; meta?: { at?: string }; data?: { message?: unknown; messageDelta?: unknown } };
          return ["message.appended", "message.completed", "reasoning.appended", "reasoning.completed"].includes(event.type ?? "") &&
            (!event.meta?.at || Date.parse(event.meta.at) >= suppressOutputAfter!);
        })) throw new Error("Actual stream released new model text after source change or durable cancellation");
        if (captured.interrupted && id !== "S08") throw new Error("Actual native capture interrupted");
        if (!["S04", "S08"].includes(id) && captured.capture?.outcome !== "terminal") throw new Error("Required actual native terminal missing");
        const reconciliation = id === "S08" ? await reconcileStaffingLive(environment.privateLogTail(), owned.responseAttemptId!, deadline) : null;
        const final = await waitStaffingLive(status, value => id === "S08" ? value.state === "cancelled" : !["prepared", "running"].includes(value.state), deadline);
        if (id === "S06") {
          const allowedWrite = await current.changeConsumedInput();
          if (allowedWrite) expectedWrites.push(allowedWrite);
          const invalid = await status();
          if (invalid.outputReadable || !invalid.fenced) throw new Error("Consumed rate did not fence saved output");
          activeOutputDeniedAfterChange = true;
          await assertReplayDenied(environment.origin, auth, prepared, nativeSessionId, deadline); replayDeniedAfterChange = true;
        }
        const evidence = await readStaffingLiveEvidence(prepared.attemptId);
        if (id === "S04" && !evidence.nativeTerminals.length)
          throw new Error("Lifecycle case has no actual native terminal projection; completion remains unconfirmed");
        let cancellationOutcome: ReturnType<typeof staffingLiveCancellationOutcome> | null = null;
        if (id === "S08") {
          const paidFinal = (await query("SELECT id,ordinal,step_token FROM staffing_model_step_receipts WHERE attempt_id=$1 ORDER BY ordinal", [prepared.attemptId])).rows;
          const restart = restartEvidence as { paidBefore: unknown };
          cancellationOutcome = staffingLiveCancellationOutcome({ adviceState: final.state, responseState: final.responseState,
            reconciliation: reconciliation!, nativeTerminalCount: evidence.nativeTerminals.length,
            paidReceiptsUnchanged: JSON.stringify(paidFinal) === JSON.stringify(restart.paidBefore) });
          restartEvidence = { ...(restartEvidence as object), reconciliation, adviceState: final.state,
            responseState: final.responseState, paidFinal };
        }
        await assertSourceUnchanged();
        if (ledgerBefore !== await staffingLiveLedgerDigest()) throw new Error("Paid explanation changed staffing commitments");
        const writesAfter = await readStaffingLiveWriteReceipts();
        assertStaffingLiveWrites(writesBefore, writesAfter, expectedWrites);
        const allContent = JSON.stringify({ context: evidence.context, tools: evidence.tools, observations: evidence.observations, events });
        if (current.prohibitedSentinels.some(sentinel => allContent.includes(sentinel))) throw new Error("Actual live prohibited sentinel disclosed");
        const finished = Date.now();
        if (finished > deadline) throw new Error("Actual live case exceeded original deadline");
        const response = (captured.capture?.events ?? []).filter(event => event.type === "message.completed")
          .map(event => "data" in event && typeof (event.data as { message?: unknown }).message === "string"
            ? (event.data as { message: string }).message : "").filter(Boolean).join("\n\n");
        if (!["S04", "S08"].includes(id) && (final.state !== "completed" || !response.trim() ||
          captured.capture?.outcome !== "terminal" || captured.capture.terminal !== "turn.completed"))
          throw new Error("Required actual completed explanation absent");
        const outputPath = join(directory, `${id}-actual.json`);
        // Semantic claims stay null until actual-output review. This record
        // intentionally cannot pass eval:staffing:verify by itself.
        const actual = { version: fixture.version, runId, caseId: id, provenance: "native-eve-stream", model: "spacexai/grok-4.7", reasoning: "low",
          role: definition.role, mode: definition.mode, attemptId: prepared.attemptId, conversationId: prepared.conversationId, nativeSessionId, turnId,
          startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), initialDispatches: 1, automaticPaidRetries: 0,
          state: cancellationOutcome?.state ?? final.state, terminalSource: cancellationOutcome?.terminalSource ??
            (captured.capture?.outcome === "terminal" ? "stream" : "native-projection"),
          contextBytes: evidence.response.context_bytes, dependencyCount: evidence.response.dependency_count, readCalls: evidence.response.read_calls,
          modelSteps: evidence.response.model_steps, usageSource: "staffing_model_step_receipts",
          steps: evidence.steps.map((step, index) => ({ receiptId: step.receipt_id, ordinal: step.ordinal,
            providerOutputLimit: evidence.observations[index].max_output_tokens, inputTokens: step.input_tokens === null ? null : Number(step.input_tokens),
            outputTokens: step.output_tokens === null ? null : Number(step.output_tokens), outcome: step.event_type === "step.completed" ? "completed" :
              cancellationOutcome?.state === "unconfirmed" ? "unconfirmed" : final.state === "cancelled" ? "cancelled" : "unconfirmed" })),
          response, context: { snapshot: evidence.context, providerInputs: evidence.observations }, tools: evidence.tools,
          domainNumbersAgree: null, exactCitations: null, noPersonnelInference: null, noSentinelDisclosure: true,
          unauthorizedMutations: 0, allocationLedgerUnchanged: true, consumedDependencyFenceRespected: null, authorityFenceRespected: null,
          activeOutputDeniedAfterChange, replayDeniedAfterChange, deniedMutationAndScopeTools: id === "S07" && denialProbes.length === 6,
          pairedRestartIdentityPreserved, ownedNativeCancelObserved };
        const outputDigest = await privateJson(outputPath, actual);
        await privateJson(join(directory, `${id}-evidence.json`), { capture: captured.capture, interrupted: captured.interrupted,
          independentNumbers: current.independentNumbers, expectedScenario: current.scenario, unknownResourceIds: current.unknownResourceIds,
          staleResourceIds: current.staleResourceIds, denialProbes, ledgerBefore, ledgerAfter: ledgerBefore,
          restartEvidence, nativeTerminals: evidence.nativeTerminals, suppressOutputAfter, writesBefore, writesAfter, expectedWrites });
        reviewCases.push({ id, outputPath, outputDigest, rationale: "", scores: { source_fidelity: null, calculation_agreement: null,
          uncertainty_and_decision_rights: null, scope_and_privacy: null }, hardGates: { no_prohibited_content: null, no_invented_number: null,
          no_unauthorized_write: null, no_budget_breach: null } });
        console.log(JSON.stringify({ caseId: id, state: "captured-awaiting-review", initialDispatches, modelSteps: evidence.steps.length, reads: evidence.tools.length }));
      } catch (error) {
        const partial = binding ? await readStaffingLivePartialEvidence(binding.prepared.attemptId).catch(() => null) : null;
        await privateJson(join(directory, `${id}-failed.json`), { version: fixture.version, runId, caseId: id,
          state: "failed-not-reviewed", sourceDigest, setupStartedAt: new Date(setupStarted).toISOString(),
          startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(),
          initialDispatches: didDispatch ? 1 : 0, automaticPaidRetries: 0, attemptId: binding?.prepared.attemptId ?? null,
          nativeSessionId: binding?.nativeSessionId ?? null, turnId, captureState,
          nativeFailures: events.filter(raw => {
            const event = raw as { type?: string };
            return event.type === "step.failed" || event.type === "turn.failed" || event.type === "session.failed";
          }).map(raw => {
            const event = raw as { type: string; data?: { code?: unknown } };
            return { type: event.type, code: typeof event.data?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(event.data.code)
              ? event.data.code : "unspecified" };
          }),
          events, partial, restartEvidence,
          note: "Original failed case retained; no semantic grade and no inferred usage. A new live run is required." });
        failedCaseRecorded = true;
        throw error;
      } finally {
        // Stop durably even after a dispatch with an uncertain HTTP result.
        // Never send the original message a second time during cleanup.
        if (didDispatch && auth && binding) {
          const cleanupDeadline = Date.now() + 15_000;
          await staffingLivePost(environment.origin, auth, `/api/staffing/advisory/${binding.prepared.attemptId}/cancel`, {}, cleanupDeadline).catch(() => undefined);
          if (turnId) await staffingLivePost(environment.origin, auth, `/eve/v1/session/${binding.nativeSessionId}/cancel`, { turnId }, cleanupDeadline).catch(() => undefined);
        }
        await environment.stop();
      }
    }, { deadlineAt: suiteDeadline });
    } catch (error) {
      // The environment can fail before its callback (clone/copy/migration), or
      // during ownership-checked cleanup after a successful capture. Neither
      // failure may vanish because no in-callback catch could record it.
      if (!failedCaseRecorded) await privateJson(join(directory, `${id}-environment-failed.json`), {
        version: fixture.version, runId, caseId: id, state: "failed-not-reviewed", sourceDigest,
        stage: callbackEntered ? "owned-callback-or-cleanup" : "owned-setup", callbackEntered,
        setupStartedAt: new Date(environmentStarted).toISOString(), finishedAt: new Date().toISOString(),
        initialDispatches: initialDispatches - dispatchesBefore, automaticPaidRetries: 0,
        note: "Owned environment failed. Existing captures remain private; no inferred completion, usage or semantic grade. A new live run is required.",
      });
      throw error;
    }
  }
  if (Date.now() > suiteDeadline || initialDispatches !== 8 || reviewCases.length !== 8)
    throw new Error("Live suite did not preserve its original eight-case allowance");
  await privateJson(join(directory, "review-pending.json"), { version: fixture.version, fixtureDigest: staffingEvalFixtureDigest(), runId,
    suiteStartedAt: new Date(suiteStarted).toISOString(), suiteFinishedAt: new Date().toISOString(), cases: reviewCases });
  console.log(JSON.stringify({ gate: "staffing-live", state: "captured-awaiting-review", cases: reviewCases.length, initialDispatches, directory }));
}

main().catch(error => {
  const errorCode = error && typeof error === "object" && "code" in error &&
    ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(String(error.code)) ? String(error.code) : "gate_failed";
  console.error(JSON.stringify({ gate: "staffing-live", stage: activeStage, errorCode }));
  console.error("007 live evaluation incomplete; no paid dispatch was retried. Inspect private owned evidence and deterministic gate reports locally."); process.exitCode = 1;
});
