import { randomUUID } from "node:crypto";
import { readFile, writeFile, realpath, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { withExecutionEvalEnvironment, requireOwnedExecutionClone, type ExecutionEvalEnvironment } from "../../../scripts/execution-eval-environment";
import { query, closeRuntimePool } from "../../../lib/server/db/client";
import { getServerConfig } from "../../../lib/server/config";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { readExecutionAdviceStatus } from "../../../lib/server/execution/advisory-status";
import { executionAdvicePrompt } from "../../../lib/execution/advice";
import { readExecutionOverview, readExecutionRecords } from "../../../lib/server/execution/service";
import { timeFixture } from "./time";
import { saveRegister, submitRegister, reviewRegister, raidRecord } from "./registers";
import { assertDeterministicTestMode } from "../runtime";

type Scenario = "normal" | "barrier" | "limits" | "unknown";
type Auth = { cookie: string; csrf: string };
type Prepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
export async function installExecutionNativeFixture(environment: ExecutionEvalEnvironment) {
  requireOwnedExecutionClone(); assertDeterministicTestMode();
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/008"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd())) throw new Error("Owned native app copy required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8"), target = "wrapStaffingModel(gateway(selectedModel), admitted.mode";
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "spacexai/grok-4.7";') || !source.includes('reasoning: "low"')) throw new Error("Fixture model shape changed");
  const replacement = source.replace(target, "wrapStaffingModel(createExecutionNativeFixtureModel(principal, identity), admitted.mode")
    .replace("return wrapStaffingModel(createExecutionNativeFixtureModel(principal, identity), admitted.mode, {", "return { model: wrapStaffingModel(createExecutionNativeFixtureModel(principal, identity), admitted.mode, {")
    .replace("beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        });", "beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        }), modelContextWindowTokens: 128_000 };");
  if (!replacement.includes("modelContextWindowTokens: 128_000")) throw new Error("Fixture model metadata changed");
  await writeFile(path, 'import { createExecutionNativeFixtureModel } from "../tests/fixtures/execution/native-model";\n' + replacement, { mode: 0o600 });
  await query(`CREATE TABLE execution_native_fixture_calls(id uuid PRIMARY KEY,response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_index integer NOT NULL,
    provider_path text NOT NULL,max_output_tokens integer NOT NULL,tools jsonb NOT NULL,prompt_digest text NOT NULL,deadline_ms numeric NOT NULL,responded_at timestamptz,UNIQUE(response_attempt_id,step_index));
    CREATE TABLE execution_native_fixture_barriers(advice_attempt_id uuid PRIMARY KEY REFERENCES execution_advice_attempts(id),scenario text NOT NULL,released boolean NOT NULL DEFAULT false);
    GRANT SELECT,INSERT,UPDATE ON execution_native_fixture_calls,execution_native_fixture_barriers TO turas_runtime;`);
}
async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean, ms = 45000) {
  const deadline = Date.now() + ms; let last: T | undefined;
  while (Date.now() < deadline) { last = await read(); if (ready(last)) return last; await new Promise(r => setTimeout(r, 150)); }
  const state = last && typeof last === "object" && "state" in last ? (last as { state: unknown }).state : "unavailable";
  throw new Error(`Owned execution native condition timed out (${String(state)})`);
}
export async function withExecutionNativeCase<T>(scenario: Scenario, run: (fixture: Awaited<ReturnType<typeof createCase>>) => Promise<T>): Promise<T> {
  assertDeterministicTestMode(); requireOwnedExecutionClone(); const sourceDatabaseUrl = process.env.TURAS_TEST_SOURCE_DATABASE_URL;
  await closeRuntimePool();
  return withExecutionEvalEnvironment(async environment => {
    await environment.prepareRuntime(); await installExecutionNativeFixture(environment);
    const disabledBefore = process.env.TURAS_008_DISABLED;
    const prior = process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY; process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY = "1";
    const start = async (restart = false) => {
      const keys = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "TURAS_TEST_DATABASE_URL"] as const,
        old = keys.map(k => process.env[k]), runtime = new URL(process.env.DATABASE_URL!); runtime.searchParams.set("options", "-c role=turas_runtime");
      for (const key of keys) process.env[key] = runtime.toString();
      try { if (restart) await environment.restart(); else await environment.start(); }
      finally { keys.forEach((k, i) => { process.env[k] = old[i]; }); await closeRuntimePool(); }
    };
    try { await start(); return await run(await createCase(environment, scenario, () => start(true))); }
    catch (error) { const evidence = await mkdtemp(resolve("local-artifacts/008/native-failure-")); await writeFile(join(evidence, "runtime.log"), environment.privateLogTail(), { mode: 0o600 }); throw error; }
    finally { await environment.stop(); if (disabledBefore === undefined) delete process.env.TURAS_008_DISABLED; else process.env.TURAS_008_DISABLED = disabledBefore; if (prior === undefined) delete process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY; else process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY = prior; }
  }, { sourceDatabaseUrl });
}
async function createCase(environment: ExecutionEvalEnvironment, scenario: Scenario, restart: () => Promise<void>) {
  const signal = (ms = 15000) => AbortSignal.timeout(ms);
  const headers = (auth: Auth, extra: Record<string, string> = {}) => ({ cookie: auth.cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": auth.csrf, ...extra });
  const post = (auth: Auth, path: string, body: unknown, extra: Record<string, string> = {}) => fetch(`${environment.origin}${path}`, { method: "POST", headers: headers(auth, extra), body: JSON.stringify(body), signal: signal() });
  const get = (auth: Auth, path: string, ms = 15000) => fetch(`${environment.origin}${path}`, { headers: { cookie: auth.cookie }, cache: "no-store", signal: signal(ms) });
  const login = async (name: "panel" | "mcteer"): Promise<Auth> => {
    const config = getServerConfig(), response = await fetch(`${environment.origin}/api/auth/login`, { method: "POST", headers: { origin: environment.origin, "content-type": "application/json" },
      body: JSON.stringify({ username: name, password: name === "panel" ? config.PANEL_PASSWORD : config.TURAS_DEMO_PASSWORD }), signal: signal() });
    const cookie = response.headers.get("set-cookie")?.split(";")[0]; await response.body?.cancel(); if (!response.ok || !cookie) throw new Error("Owned native login failed");
    const session = await get({ cookie, csrf: "" }, "/api/auth/session"), body = await session.json();
    if (!session.ok || !body.data?.csrfToken) throw new Error("Owned native session unavailable"); return { cookie, csrf: body.data.csrfToken };
  };
  const f = await timeFixture(), panel = await login("panel"), manager = await login("mcteer"), view = await readExecutionOverview(f.author, f.engagementId);
  const actor = await getCurrentSession(new Request(environment.origin, { headers: { cookie: panel.cookie } })); if (!actor) throw new Error("Owned execution actor missing");
  const newChat = await post(panel, "/api/conversations", { customerId: f.customerId, requestKey: randomUUID(), title: "Execution explanation" });
  const chatBody = await newChat.json(); if (!newChat.ok) throw new Error(`Owned conversation preparation failed (${newChat.status})`);
  const conversationId = chatBody.data.conversation?.id ?? chatBody.data.id;
  const admissionInput = { requestKey: randomUUID(), conversationId, expectedGeneration: view.generation, from: f.date, to: f.date };
  const response = await post(panel, `/api/execution/engagements/${f.engagementId}/advice`, admissionInput);
  if (!response.ok) { const body = await response.json(); throw new Error(`Owned execution admission failed (${response.status}/${body.error?.code})`); }
  const reserved = (await response.json()).data as Prepared;
  const binding = await post(panel, "/eve/v1/session", { operationId: reserved.operationId }, { "x-turas-conversation-id": reserved.conversationId });
  const boundBody = await binding.json(); if (!binding.ok || !boundBody.sessionId) throw new Error(`Owned native binding failed (${binding.status})`);
  const nativeSessionId = boundBody.sessionId as string;
  await query("INSERT INTO execution_native_fixture_barriers(advice_attempt_id,scenario) VALUES($1,$2)", [reserved.attemptId, scenario]);
  const counts = async () => (await query(`SELECT (SELECT count(*) FROM profile_records)+(SELECT count(*) FROM research_requests)+(SELECT count(*) FROM plan_revisions) AS writes,
    (SELECT coalesce(sum(count),0)::int FROM rate_windows WHERE category='profile_read') AS profile_reads`)).rows[0];
  const before = await counts();
  const nativeSend = async (key = reserved.nativeRequestId) => {
    const sent = await post(panel, `/eve/v1/session/${nativeSessionId}`, { message: executionAdvicePrompt }, { "x-turas-conversation-id": reserved.conversationId, "x-turas-request-key": key });
    const status = sent.status; await sent.body?.cancel(); return status;
  };
  const status = async () => {
    try { return await readExecutionAdviceStatus(actor, reserved.attemptId); }
    catch (error) {
      if (!(error && typeof error === "object" && "status" in error && error.status === 401)) throw error;
      const row = (await query(`SELECT a.state,a.model_steps,a.read_calls,a.context_bytes,a.dependency_count,r.response_state,r.dispatch_state FROM execution_advice_attempts a
        LEFT JOIN response_attempts r ON r.id=a.response_attempt_id WHERE a.id=$1`, [reserved.attemptId])).rows[0];
      return { state: row.state as string, outputReadable: false, fenced: true, responseState: row.response_state as string | null, dispatchState: row.dispatch_state as string | null,
        stepsAdmitted: Number(row.model_steps), readCalls: Number(row.read_calls), contextBytes: Number(row.context_bytes), dependencyCount: Number(row.dependency_count), inputTokens: null, outputTokens: null };
    }
  };
  const providerCalls = async () => (await query(`SELECT c.max_output_tokens,c.tools,c.deadline_ms,c.step_index FROM execution_native_fixture_calls c
    JOIN execution_advice_attempts a ON a.response_attempt_id=c.response_attempt_id WHERE a.id=$1 ORDER BY c.step_index`, [reserved.attemptId])).rows.map(r => ({ maxOutputTokens: r.max_output_tokens as number, tools: r.tools as string[], deadlineMs: Number(r.deadline_ms), stepIndex: r.step_index as number }));
  const readStatus = async (auth: Auth, path: string) => { const r = await get(auth, path); await r.body?.cancel(); return r.status; };
  return { environment, reserved, nativeSessionId, actor, source: f, send: nativeSend, status, providerCalls,
    settled: () => waitFor(status, s => !["prepared", "running"].includes(s.state) && (s.state === "unconfirmed" || !["pending", "running", "stopping"].includes(s.responseState ?? "")), 150000),
    admissionReplayStatus: async () => { const r = await post(panel, `/api/execution/engagements/${f.engagementId}/advice`, admissionInput); await r.body?.cancel(); return r.status; },
    disable: async () => { process.env.TURAS_008_DISABLED = "1"; await restart(); },
    historyStatus: () => readStatus(panel, `/api/conversations/${reserved.conversationId}`),
    historyText: async () => (await get(panel, `/api/conversations/${reserved.conversationId}`)).text(),
    otherOwnerHistoryStatus: () => readStatus(manager, `/api/conversations/${reserved.conversationId}`),
    reconnect: () => readStatus(panel, `/eve/v1/session/${nativeSessionId}/stream`),
    secondTurnStatus: () => nativeSend(randomUUID()),
    waitAtProvider: () => waitFor(async () => (await query(`SELECT count(*)::int AS n FROM execution_native_fixture_calls c JOIN execution_advice_attempts a ON a.response_attempt_id=c.response_attempt_id
      WHERE a.id=$1 AND c.responded_at IS NOT NULL`, [reserved.attemptId])).rows[0].n as number, n => n > 0),
    attachStream: async () => { const stream = await get(panel, `/eve/v1/session/${nativeSessionId}/stream`, 45000); if (!stream.ok) throw new Error(`Owned stream denied (${stream.status})`); return { text: stream.text() }; },
    releaseProvider: () => query("UPDATE execution_native_fixture_barriers SET released=true WHERE advice_attempt_id=$1", [reserved.attemptId]).then(() => undefined),
    usageCount: async () => Number((await query("SELECT count(*)::int AS n FROM execution_advice_usage WHERE attempt_id=$1", [reserved.attemptId])).rows[0].n),
    forbiddenToolEffects: async () => Number((await counts()).writes) - Number(before.writes),
    profileReadCharges: async () => Number((await counts()).profile_reads) - Number(before.profile_reads),
    withdrawEvidence: async () => { const row = (await readExecutionRecords(f.reviewer, f.engagementId, { recordId: f.activity.id })).records[0]; await reviewRegister(f, row, "record.retract"); },
    addReviewedBlocker: async () => { await reviewRegister(f, await submitRegister(f, await saveRegister(f, { ...raidRecord(), raidType: "issue", severity: "critical" }))); },
    cancel: async () => { const r = await post(panel, `/api/execution/advice/${reserved.attemptId}/cancel`, {}); await r.body?.cancel(); if (!r.ok) throw new Error("Owned cancellation failed");
      const stopped = await status();
      if ("nativeTurnId" in stopped && stopped.nativeTurnId) { const native = await post(panel, `/eve/v1/session/${nativeSessionId}/cancel`, { turnId: stopped.nativeTurnId });
        await native.body?.cancel(); if (!native.ok) throw new Error("Owned native cancellation failed"); } },
    revokeLogin: () => query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [actor.sessionId]).then(() => undefined), restart,
  };
}
