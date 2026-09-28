import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../fixtures/identities";
import { captureAttemptContext, readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { createOwnedConversation, getOwnedConversationDetail, listOwnedConversations } from "../../lib/server/conversations/repository";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { claimBinding } from "../../lib/server/conversations/binding";
import { assertNativeContextCurrent, releaseNativeChunk } from "../../lib/server/conversations/context-fence";
import { guardNativeStream } from "../../lib/server/conversations/stream";

describe("attempt-bound customer context", () => {
  it("blocks native chunk release from a changed or expired conversation", async () => {
    const previousEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    const previousUrl = process.env.DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    const db = async <T,>(run: (client: PoolClient) => Promise<T>): Promise<T> => {
      const activeUrl = process.env.DATABASE_URL;
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      try { return await withTestDatabase(run); }
      finally {
        if (activeUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = activeUrl;
      }
    };
    const customerId = DEMO_IDS.deniedCustomer;
    let conversationId: string | undefined;
    let partnerConversationId: string | undefined;
    let originalGeneration: string | undefined;
    try {
      const actor = await db((client) => createProfileTestSession(client, "panel"));
      process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
      const created = await createOwnedConversation(actor, { customerId, requestKey: randomUUID(),
        title: "Synthetic native release fence" });
      conversationId = created.conversation.id;
      const nativeId = `wrun_${randomUUID().replaceAll("-", "")}`;
      originalGeneration = await db(async (client) => {
        const state = await client.query<{ internal_generation: string }>(
          "SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1", [customerId]);
        await client.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",
          [conversationId, nativeId]);
        return state.rows[0].internal_generation;
      });
      let released = 0;
      await releaseNativeChunk(actor, nativeId, () => { released += 1; });
      expect(released).toBe(1);
      let upstream!: ReadableStreamDefaultController<Uint8Array>;
      const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
        start(controller) { upstream = controller; },
      })), async () => {
        await assertNativeContextCurrent(actor, nativeId);
        return true;
      }, 10_000, 5_000, async (_chunk, enqueue) => {
        await releaseNativeChunk(actor, nativeId, enqueue);
      });
      const reader = guarded.body!.getReader();
      upstream.enqueue(new Uint8Array([1]));
      expect((await reader.read()).value).toEqual(new Uint8Array([1]));
      await db((client) => client.query(`UPDATE customer_profile_state
        SET internal_generation=internal_generation+1 WHERE customer_id=$1`, [customerId]));
      upstream.enqueue(new Uint8Array([2]));
      expect((await reader.read()).done).toBe(true);
      await expect(releaseNativeChunk(actor, nativeId, () => { released += 1; }))
        .rejects.toMatchObject({ status: 409, code: "context_changed" });
      await expect(assertNativeContextCurrent(actor, nativeId))
        .rejects.toMatchObject({ status: 409, code: "context_changed" });
      expect(released).toBe(1);
      await db(async (client) => {
        await client.query("UPDATE customer_profile_state SET internal_generation=$1 WHERE customer_id=$2",
          [originalGeneration, customerId]);
        await client.query("UPDATE conversations SET context_valid_until=now()-interval '1 second' WHERE id=$1",
          [conversationId]);
      });
      await expect(releaseNativeChunk(actor, nativeId, () => { released += 1; }))
        .rejects.toMatchObject({ status: 409, code: "context_changed" });
      expect(released).toBe(1);
      const partner = await db((client) => createProfileTestSession(client, "partner"));
      const partnerConversation = await createOwnedConversation(partner, {
        customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID(),
        title: "Synthetic revoked native release" });
      partnerConversationId = partnerConversation.conversation.id;
      const partnerNativeId = `wrun_${randomUUID().replaceAll("-", "")}`;
      await db((client) => client.query(
        "UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",
        [partnerConversationId, partnerNativeId]));
      await releaseNativeChunk(partner, partnerNativeId, () => { released += 1; });
      expect(released).toBe(2);
      await db((client) => client.query(
        "UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",
        [DEMO_IDS.sharedCustomer, partner.membershipId]));
      await expect(releaseNativeChunk(partner, partnerNativeId, () => { released += 1; }))
        .rejects.toMatchObject({ status: 404 });
      await expect(assertNativeContextCurrent(partner, partnerNativeId))
        .rejects.toMatchObject({ status: 404 });
      expect(released).toBe(2);
    } finally {
      if (conversationId || partnerConversationId || originalGeneration) await db(async (client) => {
        await client.query(
          "UPDATE customer_grants SET state='active' WHERE customer_id=$1 AND membership_id=$2",
          [DEMO_IDS.sharedCustomer, DEMO_IDS.partnerMembership]);
        if (partnerConversationId) await client.query("DELETE FROM conversations WHERE id=$1",
          [partnerConversationId]);
        if (conversationId) await client.query("DELETE FROM conversations WHERE id=$1", [conversationId]);
        if (originalGeneration) await client.query(
          "UPDATE customer_profile_state SET internal_generation=$1 WHERE customer_id=$2",
          [originalGeneration, customerId]);
      });
      process.env.TURAS_ENVIRONMENT_ID = previousEnvironment;
      process.env.DATABASE_URL = previousUrl;
    }
  });

  it("makes an old conversation historical after a new login and starts fresh without copied history", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    const priorUrl = process.env.DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
        const oldSession = await createProfileTestSession(client, "panel");
        const firstKey = randomUUID();
        const first = await createOwnedConversation(oldSession,
          { customerId: DEMO_IDS.sharedCustomer, requestKey: firstKey,
            title: "Synthetic previous context" });
        const newerSession = await createProfileTestSession(client, "panel");
        let secondId: string | undefined;
        try {
          const old = await getOwnedConversationDetail(newerSession, first.conversation.id);
          expect(old.contextStatus).toBe("changed");
          expect(old.title).toBe("Previous conversation");
          await expect(claimBinding(newerSession, first.conversation.id, firstKey))
            .rejects.toMatchObject({ status: 409 });
          const fresh = await createOwnedConversation(newerSession,
            { customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID(),
              title: "Synthetic fresh context" });
          secondId = fresh.conversation.id;
          const detail = await getOwnedConversationDetail(newerSession, secondId);
          expect(detail.contextStatus).toBe("current");
          expect(detail.history).toEqual([]);
          expect(JSON.stringify(detail)).not.toContain("Synthetic previous context");
        } finally {
          if (secondId) await client.query("DELETE FROM conversations WHERE id=$1", [secondId]);
          await client.query("DELETE FROM conversations WHERE id=$1", [first.conversation.id]);
        }
      });
    } finally {
      process.env.TURAS_ENVIRONMENT_ID = priorEnvironment;
      process.env.DATABASE_URL = priorUrl;
    }
  });

  it("ignores hidden internal changes for partners but stops on time-only expiry and delivery changes", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "partner");
          const conversationId = randomUUID();
          const messageId = randomUUID();
          const attemptId = randomUUID();
          const state = await client.query<{ delivery_generation: string }>(
            "SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1",
            [DEMO_IDS.sharedCustomer]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             creation_operation_id,binding_state,title,context_audience,context_generation,
             context_snapshot_schema,context_login_session_id,context_membership_id)
            VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic partner context',
              'delivery',$7,'customer-context-v1',$8,$9)`,
          [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId,
            DEMO_IDS.sharedCustomer, actor.principalId, randomUUID(),
            state.rows[0].delivery_generation, actor.sessionId, actor.membershipId]);
          await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
            VALUES($1,$2,$3,$4,'Synthetic partner question')`,
          [messageId, conversationId, randomUUID(), "a".repeat(64)]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'prepared','pending')`,
          [attemptId, conversationId, messageId, "a".repeat(64)]);
          await captureAttemptContext(client, actor, conversationId, attemptId, DEMO_IDS.sharedCustomer);
          await client.query(`UPDATE customer_profile_state
            SET internal_generation=internal_generation+1 WHERE customer_id=$1`,
          [DEMO_IDS.sharedCustomer]);
          expect(await readCurrentAttemptContext(client, attemptId, actor.principalId))
            .toMatchObject({ contractVersion: "customer-context-v1" });
          await client.query(`UPDATE login_sessions SET created_at=now()-interval '2 hours',
            expires_at=now()-interval '1 hour' WHERE id=$1`,
            [actor.sessionId]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE login_sessions SET expires_at=now()+interval '1 hour' WHERE id=$1",
            [actor.sessionId]);
          await client.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer, actor.membershipId]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE customer_grants SET state='active' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer, actor.membershipId]);
          await client.query(`UPDATE conversations SET context_valid_until=now()-interval '1 second'
            WHERE id=$1`, [conversationId]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
          await client.query(`UPDATE conversations SET context_valid_until=now()+interval '1 hour'
            WHERE id=$1`, [conversationId]);
          await client.query(`UPDATE customer_profile_state
            SET delivery_generation=delivery_generation+1 WHERE customer_id=$1`,
          [DEMO_IDS.sharedCustomer]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorEnvironment; }
  });

  it("stores a bounded immutable snapshot and invalidates it after a visible generation change", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "panel");
          const conversationId = randomUUID();
          const messageId = randomUUID();
          const attemptId = randomUUID();
          const state = await client.query<{ internal_generation: string }>(
            "SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1",
            [DEMO_IDS.sharedCustomer]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             creation_operation_id,binding_state,title,context_audience,context_generation,
             context_snapshot_schema,context_login_session_id,context_membership_id)
            VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic context check','internal',$7,
              'customer-context-v1',$8,$9)`,
          [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId,
            DEMO_IDS.sharedCustomer, actor.principalId, randomUUID(),
            state.rows[0].internal_generation, actor.sessionId, actor.membershipId]);
          await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
            VALUES($1,$2,$3,$4,'Synthetic question')`,
          [messageId, conversationId, randomUUID(), "a".repeat(64)]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'prepared','pending')`,
          [attemptId, conversationId, messageId, "a".repeat(64)]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
          const captured = await captureAttemptContext(client, actor, conversationId,
            attemptId, DEMO_IDS.sharedCustomer);
          expect(captured.entries.length).toBeLessThanOrEqual(20);
          expect(Buffer.byteLength(JSON.stringify(captured))).toBeLessThanOrEqual(32_768);
          expect(Date.parse(captured.validUntil)).toBeGreaterThan(Date.now());
          expect(Date.parse(captured.validUntil) - Date.parse(captured.asOf))
            .toBeLessThanOrEqual(86_400_000);
          expect(await readCurrentAttemptContext(client, attemptId, actor.principalId))
            .toMatchObject({ contractVersion: "customer-context-v1" });
          const bound = await boundToolActor(client, { principalId: actor.principalId,
            attributes: { turasAttemptId: attemptId } });
          expect(bound).toMatchObject({ customerId: DEMO_IDS.sharedCustomer,
            generation: captured.contextVersion, actor: { membershipId: actor.membershipId } });
          const toolRead = await readEligibleContext(bound.actor, bound.customerId,
            { kind: "claim", page: 1, limit: 2 }, client) as { contextVersion: string; entries: unknown[] };
          expect(toolRead.contextVersion).toBe(bound.generation);
          await expect(boundToolActor(client, { principalId: randomUUID(),
            attributes: { turasAttemptId: attemptId } })).rejects.toMatchObject({ status: 404 });
          await client.query(`UPDATE customer_profile_state
            SET internal_generation=internal_generation+1 WHERE customer_id=$1`,
          [DEMO_IDS.sharedCustomer]);
          await expect(readCurrentAttemptContext(client, attemptId, actor.principalId))
            .rejects.toMatchObject({ status: 404 });
          await expect(boundToolActor(client, { principalId: actor.principalId,
            attributes: { turasAttemptId: attemptId } })).rejects.toMatchObject({ status: 404 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorEnvironment; }
  });

  it("captures an empty sparse context and refuses an already stale binding", async () => {
    const previousEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "panel");
          const customerId = DEMO_IDS.deniedCustomer;
          const state = await client.query<{ internal_generation: string }>(
            "SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1", [customerId]);
          const conversationId = randomUUID(), messageId = randomUUID(), attemptId = randomUUID();
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             creation_operation_id,binding_state,title,context_audience,context_generation,
             context_snapshot_schema,context_login_session_id,context_membership_id)
            VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic sparse context','internal',$7,
              'customer-context-v1',$8,$9)`,
          [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId,
            customerId, actor.principalId, randomUUID(), state.rows[0].internal_generation,
            actor.sessionId, actor.membershipId]);
          await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
            VALUES($1,$2,$3,$4,'Synthetic sparse question')`,
          [messageId, conversationId, randomUUID(), "a".repeat(64)]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'prepared','pending')`,
          [attemptId, conversationId, messageId, "a".repeat(64)]);
          const captured = await captureAttemptContext(client, actor, conversationId, attemptId, customerId);
          expect(captured.entries).toEqual([]);
          expect(Date.parse(captured.validUntil) - Date.parse(captured.asOf))
            .toBeLessThanOrEqual(86_400_000);
          await client.query("UPDATE response_attempts SET response_state='cancelled' WHERE id=$1",
            [attemptId]);
          const staleMessageId = randomUUID(), staleAttemptId = randomUUID();
          await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
            VALUES($1,$2,$3,$4,'Synthetic stale question')`,
          [staleMessageId, conversationId, randomUUID(), "b".repeat(64)]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'prepared','pending')`,
          [staleAttemptId, conversationId, staleMessageId, "b".repeat(64)]);
          await client.query(`UPDATE customer_profile_state SET internal_generation=internal_generation+1
            WHERE customer_id=$1`, [customerId]);
          await expect(captureAttemptContext(client, actor, conversationId,
            staleAttemptId, customerId)).rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = previousEnvironment; }
  });

  it("withholds generated history and titles after context changes while retaining owner text", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    const priorUrl = process.env.DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
        const actor = await createProfileTestSession(client, "panel");
        const created = await createOwnedConversation(actor, { customerId: DEMO_IDS.sharedCustomer,
          requestKey: randomUUID(), title: "Synthetic generated-looking title" });
        const id = created.conversation.id;
        const initial = await client.query<{ internal_generation: string }>(
          "SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1",
          [DEMO_IDS.sharedCustomer]);
        try {
          for (const [type, message] of [["message.received", "Owner question"],
            ["message.completed", "GENERATED_CONTEXT_SENTINEL"]] as const) {
            await client.query(`INSERT INTO event_projections
              (native_event_id,conversation_id,native_session_id,event_type,visible_payload,emitted_at)
              VALUES($1,$2,'wrun_synthetic',$3,$4,now())`,
            [randomUUID(), id, type, JSON.stringify({ message })]);
          }
          const before = await getOwnedConversationDetail(actor, id);
          expect(before.contextStatus).toBe("current");
          expect(JSON.stringify(before.history)).toContain("GENERATED_CONTEXT_SENTINEL");
          await client.query(`UPDATE customer_profile_state SET internal_generation=internal_generation+1
            WHERE customer_id=$1`, [DEMO_IDS.sharedCustomer]);
          const after = await getOwnedConversationDetail(actor, id);
          expect(after.contextStatus).toBe("changed");
          expect(JSON.stringify(after.history)).toContain("Owner question");
          expect(JSON.stringify(after.history)).not.toContain("GENERATED_CONTEXT_SENTINEL");
          for (const [type, message] of [["session.compacted", "COMPACTED_CONTEXT_SENTINEL"],
            ["message.completed", "REPLAYED_CONTEXT_SENTINEL"]] as const) {
            await client.query(`INSERT INTO event_projections
              (native_event_id,conversation_id,native_session_id,event_type,visible_payload,emitted_at)
              VALUES($1,$2,'wrun_synthetic',$3,$4,now())`,
            [randomUUID(), id, type, JSON.stringify({ message })]);
          }
          const staleReplay = await getOwnedConversationDetail(actor, id);
          expect(JSON.stringify(staleReplay.history)).not.toContain("COMPACTED_CONTEXT_SENTINEL");
          expect(JSON.stringify(staleReplay.history)).not.toContain("REPLAYED_CONTEXT_SENTINEL");
          expect(after.title).toBe("Previous conversation");
          const list = await listOwnedConversations(actor, { limit: 50 });
          expect(list.items.find((row) => row.id === id)?.title).toBe("Previous conversation");
          const search = await listOwnedConversations(actor, { limit: 50, title: "generated-looking" });
          expect(search.items.some((row) => row.id === id)).toBe(false);
        } finally {
          await client.query("DELETE FROM event_projections WHERE conversation_id=$1", [id]);
          await client.query("DELETE FROM conversations WHERE id=$1", [id]);
          await client.query("UPDATE customer_profile_state SET internal_generation=$1 WHERE customer_id=$2",
            [initial.rows[0].internal_generation, DEMO_IDS.sharedCustomer]);
        }
      });
    } finally {
      process.env.TURAS_ENVIRONMENT_ID = priorEnvironment;
      process.env.DATABASE_URL = priorUrl;
    }
  });
});
