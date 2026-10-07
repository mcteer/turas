import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { featureSourceDigest } from "./execution-source-digest";
import { supportEvaluationCases } from "../tests/fixtures/support/evaluation";
import { supportCaptureSettled } from "./support-capture-settlement";
import { buildSupportLiveScenario } from "../tests/fixtures/support/live-scenarios";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { installSupportLiveObservation } from "../tests/fixtures/support/live";
import { supportLiveLogin, prepareSupportLive, dispatchSupportLive } from "./support-live-runtime";
import { readSupportLiveEvidence, supportLiveDomainDigests } from "./support-live-evidence";
import { query, closeRuntimePool } from "../lib/server/db/client";
import { supportDigest } from "../lib/server/support/commands";
import { mapSupportCapture } from "./support-capture-mapping";
import { saveSupportSuggestion } from "../lib/server/support/suggestions";
import { createProfileTestSession } from "../tests/fixtures/profiles";
import { withSupportDatabase } from "../tests/fixtures/support/environment";
import { randomUUID } from "node:crypto";
import { installSupportNativeFixture } from "../tests/fixtures/support/native";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { captureSupportProviderOutput } from "./support-provider-output";
import { validateSupportAdviceResult } from "../lib/support/advice";
import { supportSourcesSchema } from "../lib/server/support/schema";

async function main() {
  const fixtureMode = process.argv.length === 3 && process.argv[2] === "--fixture";
  if (fixtureMode) assertDeterministicTestMode();
  else if (process.argv.length !== 3 || process.argv[2] !== "--live" || process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" ||
    !process.env.AI_GATEWAY_API_KEY || process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY)
    throw new Error("Explicit configured-provider live opt-in required");
  const sourceDigest = await featureSourceDigest("010");
  const model = (await readFile("agent/agent.ts", "utf8")).match(/const selectedModel = "([^"]+)";/)?.[1];
  if (!model) throw new Error("Configured model identity unavailable");
  await mkdir("local-artifacts/010", { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/010/live-"));
  let failures = 0;
  for (const scenario of supportEvaluationCases) {
    await withSupportEvalEnvironment(async environment => {
      let attemptId: string | undefined, dispatched = false;
      let phase = "setup";
      try {
        await createSupportActors(environment.appRoot);
        const fixture = await buildSupportLiveScenario(scenario.id);
        if (fixtureMode) {
          await installSupportNativeFixture(environment);
          process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY = "1";
        }
        await installSupportLiveObservation(environment);
        await environment.start();
        phase = "prepare";
        const auth = await supportLiveLogin(environment.origin, Date.now() + 120000);
        const binding = await prepareSupportLive(environment.origin, auth, fixture, Date.now() + 120000);
        attemptId = binding.prepared.attemptId;
        const before = await supportLiveDomainDigests();
        if (scenario.id === "S08") await query("INSERT INTO support_live_provider_barriers(attempt_id) VALUES($1)", [attemptId]);
        const startedAt = Date.now(), deadlineAt = startedAt + 120000;
        dispatched = true;
        phase = "dispatch-settlement";
        // Attach rejection handling immediately. A timeout is uncertain, not a
        // reason to dispatch again; authoritative terminal state is read below.
        const dispatch = dispatchSupportLive(environment.origin, auth, binding.prepared, binding.nativeSessionId, deadlineAt)
          .then(() => true, () => false);
        let changed = false, expectedDomain = before;
        const blockers: unknown[] = [];
        const timeline: unknown[] = [];
        let lastLockSample = 0;
        for (;;) {
          if (fixtureMode && Date.now() - lastLockSample >= 1000) {
            lastLockSample = Date.now();
            const progress = (await query(`SELECT a.state,a.model_steps,a.read_calls,r.dispatch_state,r.response_state,
              (SELECT jsonb_agg(jsonb_build_object('ordinal',s.ordinal,'admitted_at',s.created_at,
                'io_started_at',o.io_started_at,'provider_finished_at',o.provider_finished_at,'usage_outcome',u.outcome) ORDER BY s.ordinal)
                FROM support_model_step_receipts s LEFT JOIN support_live_provider_observations o ON o.step_id=s.id
                LEFT JOIN support_advice_usage u ON u.step_id=s.id WHERE s.attempt_id=a.id) AS steps
              FROM support_advice_attempts a LEFT JOIN response_attempts r ON r.id=a.response_attempt_id WHERE a.id=$1`, [attemptId])).rows[0];
            if (timeline.length < 120) timeline.push({ elapsedMs: Date.now() - startedAt, progress });
            await writeFile(resolve(directory, `${scenario.id}-timeline.json`), JSON.stringify(timeline), { mode: 0o600 });
            const blocked = (await query(`SELECT a.pid,a.wait_event_type,a.wait_event,
              left(a.query,2000) AS waiting_query,pg_blocking_pids(a.pid) AS blocking_pids,
              (SELECT jsonb_agg(jsonb_build_object('pid',b.pid,'state',b.state,'query',left(b.query,2000)))
                FROM pg_stat_activity b WHERE b.pid=ANY(pg_blocking_pids(a.pid))) AS blockers
              FROM pg_stat_activity a WHERE a.datname=current_database() AND cardinality(pg_blocking_pids(a.pid))>0`)).rows;
            if (blocked.length && blockers.length < 120) blockers.push({ at: Date.now(), blocked });
          }
          if (scenario.id === "S08" && !changed && (await query(`SELECT 1 FROM support_live_provider_observations
            WHERE attempt_id=$1 AND provider_finished_at IS NOT NULL AND output_digest IS NOT NULL`, [attemptId])).rowCount) {
            await fixture.changeBeforeRelease();
            expectedDomain = await supportLiveDomainDigests();
            await query("UPDATE support_live_provider_barriers SET released=true WHERE attempt_id=$1", [attemptId]);
            changed = true;
          }
          const settlement = (await query(`SELECT a.state,r.response_state,
            (SELECT count(*)::int FROM support_model_step_receipts s WHERE s.attempt_id=a.id) AS admitted_steps,
            (SELECT count(DISTINCT u.step_id)::int FROM support_advice_usage u
              JOIN support_model_step_receipts s ON s.id=u.step_id WHERE s.attempt_id=a.id) AS usage_steps
            FROM support_advice_attempts a LEFT JOIN response_attempts r ON r.id=a.response_attempt_id
            WHERE a.id=$1`, [attemptId])).rows[0];
          if (supportCaptureSettled(settlement)) break;
          if (Date.now() >= deadlineAt) throw new Error("Live attempt did not settle within its bounded deadline");
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        await dispatch;
        if (blockers.length) await writeFile(resolve(directory, `${scenario.id}-locks.json`), JSON.stringify(blockers), { mode: 0o600, flag: "wx" });
        phase = "capture-evidence";
        const evidence = await readSupportLiveEvidence(attemptId), after = await supportLiveDomainDigests();
        const domainUnchanged = supportDigest(expectedDomain) === supportDigest(after);
        let staleSuggestionSaveDenied = false;
        if (scenario.id === "S08") {
          phase = "stale-save-denial";
          const actor = await withSupportDatabase(db => createProfileTestSession(db, "panel"));
          // Use the authenticated conversation's exact owner session, not the
          // fixture setup session, so denial proves state rather than ownership.
          const session = (await query(`SELECT c.context_login_session_id FROM conversations c
            JOIN support_advice_attempts a ON a.conversation_id=c.id WHERE a.id=$1`, [attemptId])).rows[0];
          const captured = (await query(`SELECT output_text,output_digest FROM support_live_provider_observations
            WHERE attempt_id=$1 AND output_digest IS NOT NULL ORDER BY step_index DESC LIMIT 1`, [attemptId])).rows[0];
          const exact = captured && captureSupportProviderOutput(captured.output_text, "stop");
          if (!exact || exact.digest !== captured.output_digest || !changed) throw new Error("Exact stale provider output unavailable");
          const refs = supportSourcesSchema.parse(evidence.payloads.find(item => item.kind === "source_map")?.payload);
          const output = validateSupportAdviceResult(exact.output, refs.map(ref => ref.id));
          try {
            await saveSupportSuggestion({ ...actor, sessionId: session.context_login_session_id }, fixture.customerId, {
              contractVersion: "support-v1", operation: "save_suggestion", requestKey: randomUUID(), workloadId: fixture.workloadId,
              expectedVersion: 0, attemptId, outputDigest: exact.digest, suggestionIndex: 0,
              content: output.actionSuggestions[0].content });
          } catch (error) {
            staleSuggestionSaveDenied = !!error && typeof error === "object" && "code" in error && error.code === "suggestion_unavailable";
            if (!staleSuggestionSaveDenied) throw error;
          }
          if (!staleSuggestionSaveDenied || supportDigest(await supportLiveDomainDigests()) !== supportDigest(after))
            throw new Error("S08 stale save was not denied without domain mutation");
        }
        await writeFile(resolve(directory, `${scenario.id}.json`), JSON.stringify({ version: "support-live-raw-v1",
          caseId: scenario.id, sourceDigest, rootAgentDigest: environment.rootAgentDigest, actualConfiguredProvider: !fixtureMode,
          initialDispatches: 1, automaticPaidRetries: 0, latencyMs: Date.now() - startedAt, domainUnchanged,
          sourceChangedBeforeRelease: changed, evidence }), { mode: 0o600, flag: "wx" });
        if (!fixtureMode) {
        const capture = mapSupportCapture({ caseId: scenario.id, sourceDigest, rootAgentDigest: environment.rootAgentDigest,
          model, latencyMs: Date.now() - startedAt, domainUnchanged, staleSuggestionSaveDenied, evidence });
        await writeFile(resolve(directory, `${scenario.id}-capture.json`), JSON.stringify(capture), { mode: 0o600, flag: "wx" });
        }
        const expected = scenario.expectedRelease === "completed" ? evidence.attempt.state === "completed" : changed && evidence.attempt.state !== "completed";
        if (!expected || !evidence.usageComplete || (!fixtureMode && evidence.costUsd === null) || !domainUnchanged ||
          (scenario.id === "S08" && !staleSuggestionSaveDenied)) {
          failures++;
          await writeFile(resolve(directory, `${scenario.id}-runtime.log`), environment.privateLogTail(), { mode: 0o600, flag: "wx" });
        }
        console.log(JSON.stringify({ gate: "support-live-capture-case", caseId: scenario.id, state: evidence.attempt.state,
          usageComplete: evidence.usageComplete, costAvailable: evidence.costUsd !== null, reviewed: false }));
      } catch (error) {
        failures++;
        await writeFile(resolve(directory, `${scenario.id}-runtime.log`), environment.privateLogTail(), { mode: 0o600, flag: "wx" });
        const partial = attemptId ? await readSupportLiveEvidence(attemptId).catch(() => null) : null;
        await writeFile(resolve(directory, `${scenario.id}-failure.json`), JSON.stringify({ caseId: scenario.id, sourceDigest,
          initialDispatches: dispatched ? 1 : 0, automaticPaidRetries: 0, phase,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack,
            ...("code" in error ? { code: error.code } : {}) } : { unknown: true }, partial }), { mode: 0o600, flag: "wx" });
        console.log(JSON.stringify({ gate: "support-capture-case-failed", caseId: scenario.id, phase }));
      } finally {
        await environment.stop(); await closeRuntimePool();
        if (fixtureMode) delete process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY;
      }
    }, { empty: true, deadlineAt: Date.now() + 360000 });
  }
  if (await featureSourceDigest("010") !== sourceDigest) throw new Error("Source changed during live capture");
  console.log(JSON.stringify({ gate: fixtureMode ? "support-capture-runner-fixture" : "support-live-capture",
    cases: 8, failures, actualConfiguredProvider: !fixtureMode, reviewed: false, hostedProof: false }));
  if (failures) process.exitCode = 1;
}
main().catch(() => { console.error("Support live capture failed; retain private artifacts, do not retry paid work automatically"); process.exitCode = 1; });
