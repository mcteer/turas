import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it } from "vitest";
import { GET as listConversations } from "../../app/api/conversations/route";
import { sessionCookie, type CurrentSession } from "../../lib/server/auth/sessions";
import { createOwnedConversation, getOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch } from "../../lib/server/conversations/dispatch";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { isolatedChatActor } from "../fixtures/isolated-chat-actor";
import { settleSyntheticConversationAttempts } from "../fixtures/ordinary-attempt-cleanup";

const url = requireTestDatabaseUrl();
beforeAll(() => {
  const runtime = new URL(url);
  runtime.searchParams.set("options", "-c role=turas_runtime");
  process.env.DATABASE_URL = runtime.toString();
  process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
});

async function search(actor: CurrentSession, title?: string) {
  const request = new URL("/api/conversations", process.env.TURAS_APP_ORIGIN);
  if (title !== undefined) request.searchParams.set("title", title);
  const response = await listConversations(new Request(request, {
    headers: { cookie: sessionCookie(actor.token, actor.expiresAt).split(";")[0] },
  }));
  expect(response.status).toBe(200);
  return (await response.json()).data.items as Array<{ id: string; title: string; contextStatus: string }>;
}

async function customer(db: Client, actor: CurrentSession, name: string) {
  const id = randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)",
    [id, actor.workspaceId, name]);
  if (actor.kind === "partner") await db.query(`INSERT INTO customer_grants
    (id,workspace_id,customer_id,membership_id,state,revision,granted_by)
    VALUES($1,$2,$3,$4,'active',1,$5)`,
  [randomUUID(), actor.workspaceId, id, actor.membershipId, actor.principalId]);
  return id;
}

it("searches the same owner's live customer titles after relogin and generation refresh, retaining governed snapshot fences", async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const original = await isolatedChatActor(db, "internal", "admin");
    const customerId = await customer(db, original, "Search fixture customer");
    const title = "Retained exact_100% customer discussion";
    const live = (await createOwnedConversation(original, { customerId, requestKey: randomUUID(), title })).conversation;
    const governed = (await createOwnedConversation(original, {
      customerId, requestKey: randomUUID(), title: "Governed exact_100% customer discussion",
    })).conversation;
    const plan = randomUUID();
    await db.query(`INSERT INTO delivery_plans
      (id,environment_id,workspace_id,customer_id,audience,owner_membership_id,created_by_membership_id)
      VALUES($1,$2,$3,$4,'internal',$5,$5)`,
    [plan, process.env.TURAS_TEST_ENVIRONMENT_ID, original.workspaceId, customerId, original.membershipId]);
    await db.query(`INSERT INTO planning_conversation_bindings
      (conversation_id,environment_id,workspace_id,customer_id,plan_id,audience,owner_membership_id)
      VALUES($1,$2,$3,$4,$5,'internal',$6)`,
    [governed.id, process.env.TURAS_TEST_ENVIRONMENT_ID, original.workspaceId, customerId, plan, original.membershipId]);
    expect((await search(original, "exact_100%")).map(item => item.id).sort()).toEqual([live.id, governed.id].sort());
    // More stale matches than one page must not crowd the still-current live
    // result out of search. These are real governed bindings, not mock flags.
    for (let index = 0; index < 26; index++) {
      const snapshot = (await createOwnedConversation(original, {
        customerId, requestKey: randomUUID(), title: `Governed exact_100% snapshot ${index}`,
      })).conversation;
      await db.query(`INSERT INTO planning_conversation_bindings
        (conversation_id,environment_id,workspace_id,customer_id,plan_id,audience,owner_membership_id)
        VALUES($1,$2,$3,$4,$5,'internal',$6)`,
      [snapshot.id, process.env.TURAS_TEST_ENVIRONMENT_ID, original.workspaceId, customerId, plan, original.membershipId]);
    }

    const fresh = await isolatedChatActor(db, "internal", "admin", undefined, original);
    expect(fresh.sessionId).not.toBe(original.sessionId);
    expect((await getOwnedConversation(fresh, live.id)).contextStatus).toBe("current");
    expect((await search(fresh, "exact_100%")).map(item => item.id)).toEqual([live.id]);

    await db.query("UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1", [customerId]);
    expect((await getOwnedConversation(original, live.id)).contextStatus).toBe("current");
    expect((await getOwnedConversation(original, governed.id)).contextStatus).toBe("changed");
    expect((await search(original, "exact_100%")).map(item => item.id)).toEqual([live.id]);
    expect((await search(fresh, "exact_100%")).map(item => item.id)).toEqual([live.id]);
    // User search characters retain their literal meaning.
    expect(await search(fresh, "exactX100anything")).toEqual([]);
    const other = await isolatedChatActor(db, "internal", "member", original.workspaceId);
    expect(await search(other, "exact_100%")).toEqual([]);
  } finally { await db.end(); }
});

it("withholds matching titles after revocation of either their customer or a previously consumed customer", async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  const owned: string[] = [];
  try {
    const actor = await isolatedChatActor(db, "partner", "member");
    const customerId = await customer(db, actor, "Search granted customer");
    const direct = (await createOwnedConversation(actor, {
      customerId, requestKey: randomUUID(), title: "Private source-bound title",
    })).conversation;
    const key = randomUUID();
    const general = (await createOwnedConversation(actor, { requestKey: key, title: "Private source-bound general title" })).conversation;
    owned.push(general.id);
    const binding = await claimBinding(actor, general.id, key);
    if (binding.state !== "claimed") throw Error("Fixture binding unavailable");
    const native = `wrun_${randomUUID()}`;
    await bindNativeSession(actor, general.id, binding.claimToken, native);
    await db.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
      VALUES($1,'search-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]);
    const attempt = await prepareAttempt(actor, general.id, native, randomUUID(), "Read this customer's context.");
    await claimDispatch(actor, general.id, attempt.attemptId, 0);
    await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
      SELECT $1,$2,'delivery',delivery_generation,'{}'::text[] FROM customer_profile_state WHERE customer_id=$2`,
    [attempt.attemptId, customerId]);
    expect((await search(actor, "Private source-bound")).map(item => item.id).sort()).toEqual([direct.id, general.id].sort());
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE customer_id=$1 AND membership_id=$2",
      [customerId, actor.membershipId]);
    await expect(getOwnedConversation(actor, direct.id)).rejects.toMatchObject({ status: 404 });
    await expect(getOwnedConversation(actor, general.id)).rejects.toMatchObject({ status: 404 });
    expect(await search(actor, "Private source-bound")).toEqual([]);
  } finally {
    try { await settleSyntheticConversationAttempts(db, owned); } finally { await db.end(); }
  }
});
