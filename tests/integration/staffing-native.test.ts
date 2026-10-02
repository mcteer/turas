import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { readOwnedStaffingPair } from "../fixtures/staffing/pair";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { withStaffingEvalEnvironment, type StaffingEvalEnvironment } from "../../scripts/staffing-eval-environment";
import { installStaffingNativeFixture } from "../fixtures/staffing/native";
import { withTransaction, query, closeRuntimePool } from "../../lib/server/db/client";
import { getServerConfig } from "../../lib/server/config";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createDemand, qualifyDemand, readDemand } from "../../lib/server/staffing/demands";
import { staffingExact, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { reviseSkill } from "../../lib/server/staffing/skills";
import { assertDeterministicTestMode } from "../fixtures/runtime";
import { staffingSha256 } from "../../lib/server/staffing/commands";

type Auth = { cookie: string; csrf: string };
type Prepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
type Status = { state: string; responseAttemptId: string | null; nativeTurnId: string | null; outputReadable: boolean; fenced: boolean;
  inputTokens: number | null; outputTokens: number | null; readCalls: number; stepsAdmitted: number; responseState: string | null;
  failureCode: string | null; dispatchState: string | null };
let environment: StaffingEvalEnvironment, lifecycle: Promise<void>, finish: () => void;
let panel: Auth, manager: Auth;
const timeout = (ms = 15_000) => AbortSignal.timeout(ms);
function headers(auth: Auth, extra: Record<string, string> = {}) {
  return { cookie: auth.cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": auth.csrf, ...extra };
}
async function post(auth: Auth, path: string, body: unknown, extra: Record<string, string> = {}) {
  return fetch(`${environment.origin}${path}`, { method: "POST", headers: headers(auth, extra), body: JSON.stringify(body), signal: timeout() });
}
async function login(name: "panel" | "mcteer"): Promise<Auth> {
  const config = getServerConfig();
  const response = await fetch(`${environment.origin}/api/auth/login`, { method: "POST", signal: timeout(),
    headers: { origin: environment.origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password: name === "panel" ? config.PANEL_PASSWORD : config.TURAS_DEMO_PASSWORD }) });
  if (response.status !== 200) throw new Error("Owned native fixture login failed");
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Owned native fixture cookie missing");
  const session = await fetch(`${environment.origin}/api/auth/session`, { headers: { cookie }, signal: timeout() });
  const body = await session.json() as { data?: { csrfToken: string } };
  if (!session.ok || !body.data?.csrfToken) throw new Error("Owned native fixture session missing");
  return { cookie, csrf: body.data.csrfToken };
}
async function status(id: string): Promise<Status> {
  const response = await fetch(`${environment.origin}/api/staffing/advisory/${id}`, { headers: { cookie: panel.cookie }, signal: timeout(), cache: "no-store" });
  if (!response.ok) throw new Error("Owned native status unavailable");
  return (await response.json()).data;
}
async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, ms = 60_000, breakOnFailure = true): Promise<T> {
  const started = Date.now(); let last: T | undefined;
  while (Date.now() - started < ms) {
    const value = await read(); last = value; if (predicate(value)) return value;
    if (breakOnFailure && value && typeof value === "object" && "state" in value && value.state === "failed") break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = last && typeof last === "object" ? Object.fromEntries(
    ["state", "responseState", "dispatchState", "failureCode", "fenced", "stepsAdmitted", "readCalls", "outputReadable"]
      .filter(key => key in last).map(key => [key, (last as Record<string, unknown>)[key]])) : last;
  throw new Error(`Owned native fixture did not reach its expected state: ${JSON.stringify(state)}`);
}
async function prepare(instructions: string) {
  await resetStaffingFixtureRates();
  // The native fixture exercises many guarded profile reads per turn. Keep
  // independent cases inside the owned clone without weakening runtime limits.
  await query("DELETE FROM rate_windows WHERE environment_id=$1 AND category='profile_read'",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  const f = await withTransaction(async db => {
    const baseline = await createSyntheticDemandBaseline(db);
    const created = await createDemand(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic native transport demand", demand: baseline.demand }, db);
    await qualifyDemand(baseline.actor, created.demandId, { ...staffingExact(created), requestKey: randomUUID(), rationale: "Synthetic native exact qualification" }, db);
    return { ...baseline, demand: await readDemand(baseline.actor, created.demandId, db) };
  });
  const body = { requestKey: randomUUID(), customerId: f.demand.customerId, demandId: f.demand.demandId, revisionId: f.demand.revisionId,
    contentDigest: f.demand.contentDigest, expectedAggregateVersion: f.demand.aggregateVersion, mode: "operational", scenarioId: null, instructions };
  const response = await post(panel, "/api/staffing/advisory", body);
  expect(response.status).toBe(200);
  const reserved = (await response.json()).data as Prepared;
  const binding = await post(panel, "/eve/v1/session", { operationId: reserved.operationId }, { "x-turas-conversation-id": reserved.conversationId });
  expect(binding.status).toBe(202);
  const nativeSessionId = (await binding.json()).sessionId as string;
  expect(nativeSessionId).toMatch(/^wrun_/);
  return { ...f, reserved, nativeSessionId, instructions, body };
}
type Fixture = Awaited<ReturnType<typeof prepare>>;
async function send(f: Fixture) {
  return post(panel, `/eve/v1/session/${f.nativeSessionId}`, { message: f.instructions }, {
    "x-turas-conversation-id": f.reserved.conversationId, "x-turas-request-key": f.reserved.nativeRequestId });
}
async function barrier(f: Fixture) {
  // Stage the native response through the real prepare/claim route, without
  // forging its session, turn, initial snapshot, injection or paid receipt.
  await query("INSERT INTO staffing_native_fixture_barriers(advisory_attempt_id) VALUES($1)", [f.reserved.attemptId]);
  const response = await send(f); expect(response.status, response.ok ? "" : await response.text()).toBe(202);
  const running = await until(() => status(f.reserved.attemptId), value => !!value.responseAttemptId && !!value.nativeTurnId);
  await until(async () => (await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1 AND step_index=1 AND responded_at IS NOT NULL",
    [running.responseAttemptId])).rows[0].n as number, n => n === 1);
  const generic = await fetch(`${environment.origin}/api/conversations/${f.reserved.conversationId}/attempts/${f.reserved.nativeRequestId}`,
    { headers: { cookie: panel.cookie }, signal: timeout(), cache: "no-store" });
  expect(generic.status).toBe(200); expect((await generic.json()).data.outputTokens).toBeNull();
  return running;
}
async function retireRequiredSkill(f: Fixture) {
  const skillId = f.demand.demand!.requiredSkills[0].skillId;
  const skill = (await query(`SELECT s.skill_key,s.current_revision_id,s.aggregate_version,p.name,p.definition,v.content_digest
    FROM workforce_skills s JOIN workforce_skill_payloads p ON p.revision_id=s.current_revision_id
    JOIN workforce_skill_revisions v ON v.id=s.current_revision_id WHERE s.id=$1`, [skillId])).rows[0];
  await reviseSkill(f.actor, skillId, { requestKey: randomUUID(), rationale: "Synthetic native current skill retirement",
    revisionId: skill.current_revision_id, contentDigest: skill.content_digest, expectedAggregateVersion: Number(skill.aggregate_version),
    skill: { key: skill.skill_key, name: skill.name, definition: skill.definition, state: "retired" } });
}

describe("owned eve native staffing transport with a bounded fixture provider", () => {
  beforeAll(async () => {
    assertDeterministicTestMode(); await closeRuntimePool();
    let ready: () => void, failed: (error: unknown) => void;
    const readiness = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
    const lifetime = new Promise<void>(resolve => { finish = resolve; });
    lifecycle = withStaffingEvalEnvironment(async env => {
      environment = env;
      try { await installStaffingNativeFixture(env); await env.start(); panel = await login("panel"); manager = await login("mcteer"); ready(); await lifetime; }
      finally { await env.stop(); }
    }, { sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL }).then(() => undefined);
    void lifecycle.catch(error => failed(error));
    await readiness;
  }, 180_000);
  afterAll(async () => { finish?.(); await lifecycle; }, 120_000);

  it("uses actual native association/injection/tool/usage events, exact replay, bounded catalog and one provider call per paid receipt", async () => {
    const f = await prepare("Synthetic native exact replay explanation");
    const sent = await send(f); expect(sent.status).toBe(202); const receipt = await sent.json();
    const completed = await until(() => status(f.reserved.attemptId), value => value.state === "completed");
    expect(completed).toMatchObject({ outputReadable: true, fenced: false, stepsAdmitted: 2, readCalls: 1, inputTokens: 22, outputTokens: 7 });
    const calls = (await query("SELECT step_index,max_output_tokens,tools,responded_at FROM staffing_native_fixture_calls WHERE response_attempt_id=$1 ORDER BY step_index", [completed.responseAttemptId])).rows;
    expect(calls).toHaveLength(2); expect(calls.every(row => row.max_output_tokens === 4096 && row.responded_at !== null)).toBe(true);
    expect(calls.every(row => row.tools.every((name: string) => ["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "load_skill"].includes(name)))).toBe(true);
    const history = await fetch(`${environment.origin}/api/conversations/${f.reserved.conversationId}`, { headers: { cookie: panel.cookie }, signal: timeout() });
    expect(history.status).toBe(200); expect((await history.text()).includes("Synthetic governed staffing explanation")).toBe(true);
    const replayed = await send(f); expect(replayed.status).toBe(202); expect(await replayed.json()).toEqual(receipt);
    expect((await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1", [completed.responseAttemptId])).rows[0].n).toBe(2);
    expect((await query("SELECT count(*)::int AS n FROM context_injection_receipts WHERE attempt_id=$1", [completed.responseAttemptId])).rows[0].n).toBe(1);
    const foreign = await fetch(`${environment.origin}/api/staffing/advisory/${f.reserved.attemptId}`, { headers: { cookie: manager.cookie }, signal: timeout() });
    expect(foreign.status).toBe(404);
    expect((await post(panel, "/api/staffing/advisory", { ...f.body, requestKey: randomUUID(), mode: "finance" })).status).toBe(403);
  }, 120_000);

  it("suppresses already saved history, reconnect and exact dispatch replay after actual required-skill retirement", async () => {
    const f = await prepare("Synthetic native source retirement explanation");
    expect((await send(f)).status).toBe(202);
    const completed = await until(() => status(f.reserved.attemptId), value => value.state === "completed");
    await retireRequiredSkill(f);
    const withdrawn = await until(() => status(f.reserved.attemptId),
      value => ["failed", "completed", "cancelled"].includes(value.responseState ?? ""), 30_000, false);
    expect(withdrawn.outputReadable).toBe(false);
    expect(withdrawn.fenced || withdrawn.state === "failed").toBe(true);
    for (const path of [`/api/conversations/${f.reserved.conversationId}`, `/eve/v1/session/${f.nativeSessionId}/stream`]) {
      const response = await fetch(`${environment.origin}${path}`, { headers: { cookie: panel.cookie }, signal: timeout() });
      expect(response.status).toBe(409); expect((await response.text()).includes("Synthetic governed staffing explanation")).toBe(false);
    }
    expect((await send(f)).status).toBe(409);
    expect((await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1", [completed.responseAttemptId])).rows[0].n).toBe(2);
  }, 120_000);
  it("closes an attached stream after source withdrawal while a real native provider step is pending", async () => {
    const f = await prepare("Synthetic native pending source withdrawal"), running = await barrier(f);
    const stream = await fetch(`${environment.origin}/eve/v1/session/${f.nativeSessionId}/stream`, { headers: { cookie: panel.cookie }, signal: timeout(45_000) });
    expect(stream.status).toBe(200);
    const consumed = stream.text(), started = Date.now();
    await retireRequiredSkill(f);
    await query("UPDATE staffing_native_fixture_barriers SET released=true WHERE advisory_attempt_id=$1", [f.reserved.attemptId]);
    expect((await consumed).includes("Synthetic governed staffing explanation")).toBe(false);
    expect(Date.now() - started).toBeLessThanOrEqual(30_000);
    const settled = await until(() => status(f.reserved.attemptId),
      value => ["completed", "failed", "cancelled"].includes(value.responseState ?? ""), 30_000, false);
    expect(settled.outputReadable).toBe(false);
    expect(settled.fenced || settled.state === "failed").toBe(true);
    const active = (await query(`SELECT response_state,dispatch_state,count(*)::int AS n FROM response_attempts
      GROUP BY response_state,dispatch_state ORDER BY response_state,dispatch_state`)).rows;
    expect(active.filter(row => ["pending", "running", "stopping"].includes(row.response_state))).toEqual([]);
    expect((await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1", [running.responseAttemptId])).rows[0].n).toBe(2);
  }, 120_000);
  it("records stop before actual native cancellation and settles metadata without late content or a repeated provider call", async () => {
    const f = await prepare("Synthetic native pending cancellation"), running = await barrier(f);
    const stopped = await post(panel, `/api/staffing/advisory/${f.reserved.attemptId}/cancel`, {});
    expect(stopped.status).toBe(200); expect((await stopped.json()).data).toMatchObject({ state: "cancelled", outputReadable: false });
    const cancellation = await post(panel, `/eve/v1/session/${f.nativeSessionId}/cancel`, { turnId: running.nativeTurnId });
    expect(cancellation.ok).toBe(true);
    await query("UPDATE staffing_native_fixture_barriers SET released=true WHERE advisory_attempt_id=$1", [f.reserved.attemptId]);
    const settled = await until(() => status(f.reserved.attemptId), value => value.responseState === "cancelled");
    expect(settled).toMatchObject({ state: "cancelled", outputReadable: false, stepsAdmitted: 2, readCalls: 1 });
    const history = await fetch(`${environment.origin}/api/conversations/${f.reserved.conversationId}`, { headers: { cookie: panel.cookie }, signal: timeout() });
    expect(history.status).toBe(409); expect((await history.text()).includes("Synthetic governed staffing explanation")).toBe(false);
    expect((await send(f)).status).toBe(409);
    expect((await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1", [running.responseAttemptId])).rows[0].n).toBe(2);
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(0);
  }, 120_000);
  it("preserves durable cancellation, receipts, selected database and owned stores across the paired supervisor restart", async () => {
    const f = await prepare("Synthetic paired restart explanation"), running = await barrier(f);
    const stopped = await post(panel, `/api/staffing/advisory/${f.reserved.attemptId}/cancel`, {});
    expect(stopped.status).toBe(200);
    expect((await stopped.json()).data).toMatchObject({ state: "cancelled", outputReadable: false });
    const originalPair = await readOwnedStaffingPair(environment);
    const ownedDatabase = process.env.DATABASE_URL_UNPOOLED;
    const marker = staffingSha256(await readFile(join(environment.workforceRoot, ".turas-workforce-store.json")));
    const artifactRoot = process.env.TURAS_ARTIFACT_STORE_ROOT;
    if (!artifactRoot) throw new Error("Paired restart requires the owned artifact store");
    expect((await stat(environment.workflowRoot)).isDirectory()).toBe(true);
    const receipts = (await query("SELECT id,ordinal,step_token FROM staffing_model_step_receipts WHERE attempt_id=$1 ORDER BY ordinal", [f.reserved.attemptId])).rows;
    await environment.stop(); await closeRuntimePool();
    expect(process.env.DATABASE_URL_UNPOOLED).toBe(ownedDatabase);
    expect((await query("SELECT environment_id,schema_version FROM turas_environment")).rows).toEqual([{ environment_id: process.env.TURAS_ENVIRONMENT_ID, schema_version: originalPair.schemaVersion }]);
    // Restart the real Next/eve/maintenance supervisor against the same managed
    // DB and owned stores. This reconnects DB clients; it does not reboot Neon.
    await environment.start();
    expect(await readOwnedStaffingPair(environment)).toEqual(originalPair);
    expect(process.env.TURAS_ARTIFACT_STORE_ROOT).toBe(artifactRoot);
    expect(staffingSha256(await readFile(join(environment.workforceRoot, ".turas-workforce-store.json")))).toBe(marker);
    expect((await stat(environment.workflowRoot)).isDirectory()).toBe(true);
    expect((await query("SELECT id,ordinal,step_token FROM staffing_model_step_receipts WHERE attempt_id=$1 ORDER BY ordinal", [f.reserved.attemptId])).rows).toEqual(receipts);
    await query("UPDATE staffing_native_fixture_barriers SET released=true WHERE advisory_attempt_id=$1", [f.reserved.attemptId]);
    const cancelled = await post(panel, `/eve/v1/session/${f.nativeSessionId}/cancel`, { turnId: running.nativeTurnId });
    expect([200, 202]).toContain(cancelled.status);
    const afterRestart = await status(f.reserved.attemptId);
    expect(afterRestart.state).toBe("cancelled");
    expect(afterRestart.outputReadable).toBe(false);
    // A previous eve generation may never acknowledge its in-flight turn;
    // cancellation is already durable and fenced even while native is stopping.
    expect(["stopping", "cancelled", "failed", "completed"]).toContain(afterRestart.responseState);
    expect((await send(f)).status).toBe(409);
    expect((await query("SELECT count(*)::int AS n FROM staffing_native_fixture_calls WHERE response_attempt_id=$1", [running.responseAttemptId])).rows[0].n).toBe(2);
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocations WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(0);
  }, 240_000);
});
