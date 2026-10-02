import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { POST as login } from "../../app/api/auth/login/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { withTransaction } from "../../lib/server/db/client";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch } from "../../lib/server/conversations/dispatch";
import { readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";

const isolatedTestUrl = requireTestDatabaseUrl();
beforeAll(() => { process.env.DATABASE_URL = isolatedTestUrl; process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID; });

it("binds a general turn, deduplicates sends, denies customer tools and rechecks revocation", async () => {
  const owner = new Client({ connectionString: isolatedTestUrl });
  await owner.connect();
  try {
    const origin = process.env.TURAS_APP_ORIGIN!;
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    expect(signedIn.status).toBe(200);
    const actor = await getCurrentSession(new Request(origin, { headers: { cookie: signedIn.headers.get("set-cookie")!.split(";")[0] } }));
    if (!actor) throw Error("Synthetic identity unavailable");
    const operationId = randomUUID();
    const { conversation } = await createOwnedConversation(actor, { requestKey: operationId });
    const binding = await claimBinding(actor, conversation.id, operationId);
    if (binding.state !== "claimed") throw Error("Binding not claimed");
    const nativeId = `wrun_${randomUUID()}`;
    await bindNativeSession(actor, conversation.id, binding.claimToken, nativeId);
    await owner.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'general-test',now())
      ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()`, [process.env.TURAS_ENVIRONMENT_ID]);
    const key = randomUUID();
    const attempt = await prepareAttempt(actor, conversation.id, nativeId, key, "Explain cache invalidation.");
    expect(attempt.created).toBe(true);
    expect((await prepareAttempt(actor, conversation.id, nativeId, key, "Explain cache invalidation.")).attemptId).toBe(attempt.attemptId);
    await expect(prepareAttempt(actor, conversation.id, nativeId, key, "Different text")).rejects.toMatchObject({ status: 409 });
    await expect(prepareAttempt(actor, conversation.id, nativeId, randomUUID(), "Customer source", [{ versionId: randomUUID(), runId: randomUUID(), lifecycleGeneration: 1, ranges: [{ unitId: randomUUID(), start: 0, end: 10 }] }])).rejects.toMatchObject({ status: 422 });
    await claimDispatch(actor, conversation.id, attempt.attemptId, 0);
    const context = await withTransaction(db => readCurrentAttemptContext(db, attempt.attemptId, actor.principalId));
    expect(context.contractVersion).toBe("general-context-v1"); expect(context.entries).toEqual([]);
    await expect(withTransaction(db => boundToolActor(db, { principalId: actor.principalId, attributes: { turasAttemptId: attempt.attemptId } }))).rejects.toMatchObject({ status: 403, code: "customer_scope_required" });
    await owner.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
    await expect(withTransaction(db => readCurrentAttemptContext(db, attempt.attemptId, actor.principalId))).rejects.toMatchObject({ status: 404 });
    await expect(prepareAttempt(actor, conversation.id, nativeId, randomUUID(), "After logout")).rejects.toMatchObject({ status: 401 });
  } finally { await owner.end(); }
});
