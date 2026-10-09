import {featureSourceDigest} from "./execution-source-digest";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withExpansionEvalEnvironment } from "./expansion-eval-environment";
import { createExpansionActors } from "../tests/fixtures/expansion/seed";
import { installExpansionNativeFixture } from "../tests/fixtures/expansion/native-install";
import { query, closeRuntimePool } from "../lib/server/db/client";
import { getServerConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { expansionAdvicePrompt } from "../lib/expansion/advice";

async function main() {
  const interrupted = process.argv.length === 3 && process.argv[2] === "--interrupted";
  if (process.argv.length !== 2 && !interrupted) throw new Error("Native expansion check accepts only --interrupted");
  const sourceDigest=await featureSourceDigest("011");
  await withExpansionEvalEnvironment(async environment => {
    await createExpansionActors(environment.appRoot);
    await installExpansionNativeFixture(environment);

    const previous = process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;
    process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY = "1";
    const customerId = randomUUID();
    await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic native expansion',true)", [customerId, DEMO_IDS.workspace]);
    try {
      await environment.start();
      const login = await fetch(`${environment.origin}/api/auth/login`, { method: "POST", headers: { origin: environment.origin, "content-type": "application/json" },
        body: JSON.stringify({ username: "panel", password: getServerConfig().PANEL_PASSWORD }), signal: AbortSignal.timeout(15000) });
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      await login.body?.cancel();
      if (!login.ok || !cookie) throw new Error("Native expansion login failed");
      const auth = await fetch(`${environment.origin}/api/auth/session`, { headers: { cookie } });
      const csrf = (await auth.json()).data?.csrfToken;
      if (!auth.ok || !csrf) throw new Error("Native expansion auth unavailable");
      async function post(path: string, input: unknown, extra: Record<string, string> = {}) {
        const response = await fetch(`${environment.origin}${path}`, { method: "POST",
          headers: { cookie: cookie!, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf, ...extra },
          body: JSON.stringify(input), signal: AbortSignal.timeout(20000) });
        const body = await response.json();
        if (!response.ok) throw new Error(`Native expansion request failed (${response.status})`);
        return body;
      }
      const prepared=(await post(`/api/expansion/customers/${customerId}/advice`,{contractVersion:'expansion-v1',expectedVersion:0,requestKey:randomUUID(),workloadId:null,
        question:'Which operating need should we validate?',selectedEngagementIds:[],selectedHypothesisIds:[],sourceRefs:[]})).data;
      const bound = await post("/eve/v1/session", { operationId: prepared.operationId }, { "x-turas-conversation-id": prepared.conversationId });
      if (interrupted) await query("INSERT INTO expansion_native_fixture_barriers(customer_id) VALUES($1)", [customerId]);
      const dispatch = fetch(`${environment.origin}/eve/v1/session/${bound.sessionId}`, { method: "POST", headers: {
        cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf,
        "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId },
         body: JSON.stringify({ message: expansionAdvicePrompt }), signal: AbortSignal.timeout(interrupted ? 90000 : 20000) });
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
        while (!(await query(`SELECT 1 FROM expansion_native_fixture_calls WHERE response_attempt_id=
          (SELECT response_attempt_id FROM expansion_advice_attempts WHERE id=$1)`, [prepared.attemptId])).rowCount) {
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
              (SELECT count(*)::int FROM expansion_model_step_receipts p WHERE p.attempt_id=a.id) AS paid_steps
              FROM expansion_advice_attempts a LEFT JOIN response_attempts r ON r.id=a.response_attempt_id WHERE a.id=$1`, [prepared.attemptId])).rows[0];
            throw new Error(`Interrupted provider admission timeout (${JSON.stringify(state)})`);
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        await environment.restart();
        const dispatchResult = await observedDispatch;
        if ("response" in dispatchResult) await dispatchResult.response.body?.cancel();
        // Keep the synthetic provider blocked until interruption settles.
        // Releasing it during restart can let a draining old request complete.
        const replay = await fetch(`${environment.origin}/eve/v1/session/${bound.sessionId}`, { method: "POST", headers: {
          cookie, origin: environment.origin, "content-type": "application/json", "x-csrf-token": csrf,
          "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId },
          body: JSON.stringify({ message: expansionAdvicePrompt }), signal: AbortSignal.timeout(20000) });
        await replay.body?.cancel();
        const deadline = Date.now() + 150000;
        for (;;) {
          const row = (await query("SELECT state FROM expansion_advice_attempts WHERE id=$1", [prepared.attemptId])).rows[0];
          if (row && !["prepared", "running"].includes(row.state)) {
            if (row.state === "completed") throw new Error("Interrupted call restored unconfirmed content");
            break;
          }
          if (Date.now() > deadline) throw new Error("Interrupted expansion settlement timeout");
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        await query("UPDATE expansion_native_fixture_barriers SET released=true WHERE customer_id=$1", [customerId]);
        const count = Number((await query(`SELECT count(*) AS count FROM expansion_native_fixture_calls WHERE response_attempt_id=
          (SELECT response_attempt_id FROM expansion_advice_attempts WHERE id=$1)`, [prepared.attemptId])).rows[0].count);
        if (count !== 1) throw new Error("Interrupted replay repeated provider work");
        console.log(JSON.stringify({ gate: "expansion-native-interrupted-restart", providerCalls: count,
          nativeUncertainDispatchVerified: true, sourceDigest,rootAgentDigest:environment.rootAgentDigest,actualFrameworkRuntime: true, actualConfiguredProvider: false, hostedProof: false }));
        return;
      }
      const deadline = Date.now() + 150000;
      for (;;) {
        const row = (await query("SELECT state FROM expansion_advice_attempts WHERE id=$1", [prepared.attemptId])).rows[0];
        if (row?.state === "completed") break;
        if (row && !["prepared", "running"].includes(row.state)) throw new Error(`Native expansion terminal state ${row.state}`);
        if (Date.now() > deadline) throw new Error("Native expansion settlement timeout");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const calls = (await query(`SELECT max_output_tokens,tools FROM expansion_native_fixture_calls
        WHERE response_attempt_id=(SELECT response_attempt_id FROM expansion_advice_attempts WHERE id=$1) ORDER BY step_index`, [prepared.attemptId])).rows;
      if (calls.length !== 2 || calls.some(call => call.max_output_tokens !== 4096)) throw new Error("Native expansion provider budget mismatch");
      console.log(JSON.stringify({ gate: "expansion-native-smoke", providerCalls: calls.length, sourceDigest,rootAgentDigest:environment.rootAgentDigest,actualFrameworkRuntime: true, actualConfiguredProvider: false }));
    } catch (error) {
      await mkdir(resolve("local-artifacts/011"), { recursive: true, mode: 0o700 });
      await writeFile(resolve("local-artifacts/011/native-smoke-failure.log"), environment.privateLogTail(), { mode: 0o600 });
      throw error;
    } finally {
      await environment.stop(); await closeRuntimePool();
      if (previous === undefined) delete process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;
      else process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY = previous;
    }
  }, { empty: true, deadlineAt: Date.now() + 300000 });
  if(await featureSourceDigest("011")!==sourceDigest)throw new Error("Expansion source changed during native verification");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native expansion smoke failed"); process.exitCode = 1; });
