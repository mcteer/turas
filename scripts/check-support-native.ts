import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { installSupportNativeFixture } from "../tests/fixtures/support/native";
import { query, closeRuntimePool } from "../lib/server/db/client";
import { getServerConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { supportAdvicePrompt } from "../lib/support/advice";
import { installSupportLiveObservation } from "../tests/fixtures/support/live";

async function main() {
  const interrupted = process.argv.length === 3 && process.argv[2] === "--interrupted";
  const observed = process.argv.length === 3 && process.argv[2] === "--observed";
  if (process.argv.length !== 2 && !interrupted && !observed) throw new Error("Native support check accepts only --interrupted or --observed");
  await withSupportEvalEnvironment(async environment => {
    await createSupportActors(environment.appRoot);
    await installSupportNativeFixture(environment);
    if (observed) await installSupportLiveObservation(environment);
    const previous = process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY;
    process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY = "1";
    const customerId = randomUUID();
    await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic native support',true)", [customerId, DEMO_IDS.workspace]);
    try {
      await environment.start();
      const login = await fetch(`${environment.origin}/api/auth/login`, { method: "POST", headers: { origin: environment.origin, "content-type": "application/json" },
        body: JSON.stringify({ username: "panel", password: getServerConfig().PANEL_PASSWORD }), signal: AbortSignal.timeout(15000) });
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      await login.body?.cancel();
      if (!login.ok || !cookie) throw new Error("Native support login failed");
      const auth = await fetch(`${environment.origin}/api/auth/session`, { headers: { cookie } });
      const csrf = (await auth.json()).data?.csrfToken;
      if (!auth.ok || !csrf) throw new Error("Native support auth unavailable");
      async function post(path: string, input: unknown, extra: Record<string, string> = {}) {
        const response = await fetch(`${environment.origin}${path}`, { method: "POST",
          headers: { cookie: cookie!, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf, ...extra },
          body: JSON.stringify(input), signal: AbortSignal.timeout(20000) });
        const body = await response.json();
        if (!response.ok) throw new Error(`Native support request failed (${response.status})`);
        return body;
      }
      const chat = await post("/api/conversations", { requestKey: randomUUID(), customerId, title: "Synthetic support native" });
      const prepared = (await post(`/api/support/customers/${customerId}/advice`, { requestKey: randomUUID(), conversationId: chat.data.id,
        workloadId: null, audience: "delivery", selectedEngagementIds: [], sourceRefs: [] })).data;
      const bound = await post("/eve/v1/session", { operationId: prepared.operationId }, { "x-turas-conversation-id": prepared.conversationId });
      if (interrupted) await query("INSERT INTO support_native_fixture_barriers(customer_id) VALUES($1)", [customerId]);
      const dispatch = fetch(`${environment.origin}/eve/v1/session/${bound.sessionId}`, { method: "POST", headers: {
        cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf,
        "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId },
         body: JSON.stringify({ message: supportAdvicePrompt }), signal: AbortSignal.timeout(interrupted ? 90000 : 20000) });
      // Observe connection loss immediately; interruption deliberately prevents a
      // normal response. Admission and final state are verified independently.
      let dispatchSettled = false;
      const observedDispatch = dispatch.then(response => { dispatchSettled = true; return { response }; }, error => { dispatchSettled = true; return { error }; });
      if (!interrupted) {
        const result = await observedDispatch;
        if (!("response" in result)) throw result.error;
        const response = result.response;
       if (!response.ok) {
        const rejection = await response.json().catch(() => null);
        const code = rejection?.code ?? rejection?.error?.code;
        throw new Error(`Native dispatch denied (${response.status}; ${typeof code === "string" && /^[a-z_]{1,100}$/.test(code) ? code : "unknown"})`);
      }
       await response.body?.cancel();
      }
      if (interrupted) {
        const admissionDeadline = Date.now() + 90000;
        while (!(await query(`SELECT 1 FROM support_native_fixture_calls WHERE response_attempt_id=
          (SELECT response_attempt_id FROM support_advice_attempts WHERE id=$1)`, [prepared.attemptId])).rowCount) {
          if (dispatchSettled) {
            const result = await observedDispatch;
            if (!("response" in result)) throw new Error("Interrupted dispatch connection failed before provider admission");
            if (!result.response.ok) {
              const rejection = await result.response.json().catch(() => null);
              const code = rejection?.code ?? rejection?.error?.code;
              throw new Error(`Interrupted dispatch denied (${result.response.status}; ${typeof code === "string" && /^[a-z_]{1,100}$/.test(code) ? code : "unknown"})`);
            }
          }
          if (Date.now() > admissionDeadline) {
            const state = (await query(`SELECT a.state,r.dispatch_state,r.response_state,
              (SELECT count(*)::int FROM support_model_step_receipts p WHERE p.attempt_id=a.id) AS paid_steps
              FROM support_advice_attempts a LEFT JOIN response_attempts r ON r.id=a.response_attempt_id WHERE a.id=$1`, [prepared.attemptId])).rows[0];
            throw new Error(`Interrupted provider admission timeout (${JSON.stringify(state)})`);
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        await environment.restart();
        const dispatchResult = await observedDispatch;
        if ("response" in dispatchResult) await dispatchResult.response.body?.cancel();
        await query("UPDATE support_native_fixture_barriers SET released=true WHERE customer_id=$1", [customerId]);
        const replay = await fetch(`${environment.origin}/eve/v1/session/${bound.sessionId}`, { method: "POST", headers: {
          cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf,
          "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId },
          body: JSON.stringify({ message: supportAdvicePrompt }), signal: AbortSignal.timeout(20000) });
        await replay.body?.cancel();
        const deadline = Date.now() + 150000;
        for (;;) {
          const row = (await query("SELECT state FROM support_advice_attempts WHERE id=$1", [prepared.attemptId])).rows[0];
          if (row && !["prepared", "running"].includes(row.state)) {
            if (row.state === "completed") throw new Error("Interrupted call restored unconfirmed content");
            break;
          }
          if (Date.now() > deadline) throw new Error("Interrupted support settlement timeout");
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        const count = Number((await query(`SELECT count(*) AS count FROM support_native_fixture_calls WHERE response_attempt_id=
          (SELECT response_attempt_id FROM support_advice_attempts WHERE id=$1)`, [prepared.attemptId])).rows[0].count);
        if (count !== 1) throw new Error("Interrupted replay repeated provider work");
        console.log(JSON.stringify({ gate: "support-native-interrupted-restart", providerCalls: count,
          nativeUncertainDispatchVerified: true, actualFrameworkRuntime: true, actualConfiguredProvider: false, hostedProof: false }));
        return;
      }
      const deadline = Date.now() + 150000;
      for (;;) {
        const row = (await query("SELECT state FROM support_advice_attempts WHERE id=$1", [prepared.attemptId])).rows[0];
        if (row?.state === "completed") break;
        if (row && !["prepared", "running"].includes(row.state)) throw new Error(`Native support terminal state ${row.state}`);
        if (Date.now() > deadline) throw new Error("Native support settlement timeout");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const calls = (await query(`SELECT max_output_tokens,tools FROM support_native_fixture_calls
        WHERE response_attempt_id=(SELECT response_attempt_id FROM support_advice_attempts WHERE id=$1) ORDER BY step_index`, [prepared.attemptId])).rows;
      if (calls.length !== 2 || calls.some(call => call.max_output_tokens !== 4096)) throw new Error("Native support provider budget mismatch");
      if (observed) {
        const observations = (await query("SELECT io_started_at,max_output_tokens FROM support_live_provider_observations")).rows;
        if (observations.length !== 2 || observations.some(row => !row.io_started_at || row.max_output_tokens !== 4096))
          throw new Error("Support provider observation mismatch");
      }
      console.log(JSON.stringify({ gate: "support-native-smoke", providerCalls: calls.length, actualFrameworkRuntime: true, actualConfiguredProvider: false }));
    } catch (error) {
      await mkdir(resolve("local-artifacts/010"), { recursive: true, mode: 0o700 });
      await writeFile(resolve("local-artifacts/010/native-smoke-failure.log"), environment.privateLogTail(), { mode: 0o600 });
      throw error;
    } finally {
      await environment.stop(); await closeRuntimePool();
      if (previous === undefined) delete process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY;
      else process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY = previous;
    }
  }, { empty: true, deadlineAt: Date.now() + 300000 });
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native support smoke failed"); process.exitCode = 1; });
