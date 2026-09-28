import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as createConversation } from "../../app/api/conversations/route";
import { POST as createIntents } from "../../app/api/artifacts/intents/route";
import { GET as getIntent } from "../../app/api/artifacts/intents/[intentId]/route";
import { PUT as putBytes } from "../../app/api/artifacts/intents/[intentId]/bytes/route";
import { POST as completeIntent } from "../../app/api/artifacts/intents/[intentId]/complete/route";
import { POST as cancelIntent } from "../../app/api/artifacts/intents/[intentId]/cancel/route";
import { runArtifactJob } from "../../lib/server/artifacts/runner";
import { GET as getVersion } from "../../app/api/artifacts/[versionId]/route";
import { GET as getUnits } from "../../app/api/artifacts/[versionId]/units/route";
import { GET as getOriginal } from "../../app/api/artifacts/[versionId]/original/route";
import { GET as listAttachments, POST as attachVersion } from "../../app/api/conversations/[id]/attachments/route";
import { DELETE as detachVersion } from "../../app/api/conversations/[id]/attachments/[versionId]/route";
import { POST as createReplacement } from "../../app/api/artifacts/[versionId]/replacements/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";

const origin = "http://127.0.0.1:3000";
let storeRoot = "";
const conversationIds: string[] = [];
type Auth = { cookie: string; csrf: string };

async function identity(name: "mcteer" | "panel"): Promise<Auth> {
  const response = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password: process.env[name === "mcteer" ? "TURAS_DEMO_PASSWORD" : "PANEL_PASSWORD"] }) }));
  expect(response.status).toBe(200);
  const body = await response.json() as { data: { csrfToken: string } };
  return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0], csrf: body.data.csrfToken };
}

function request(path: string, method: string, auth: Auth, body?: unknown): Request {
  return new Request(`${origin}${path}`, { method, headers: { origin, cookie: auth.cookie,
    "x-csrf-token": auth.csrf, "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("artifact upload HTTP contract", () => {
  beforeAll(async () => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Disposable artifact test database required");
    }
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    storeRoot = await mkdtemp(join(tmpdir(), "turas-004-contract-"));
    await chmod(storeRoot, 0o700);
    await writeFile(join(storeRoot, ".turas-artifact-store.json"),
      JSON.stringify({ environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID }), { mode: 0o600 });
    const prepared = join(process.cwd(), "local-artifacts/004/store");
    await writeFile(join(storeRoot, "runtime-images.json"),
      await readFile(join(prepared, "runtime-images.json")), { mode: 0o600 });
    for (const directory of ["signatures", "assets"]) {
      await mkdir(join(storeRoot, directory), { mode: 0o755 });
      for (const filename of await readdir(join(prepared, directory))) {
        await link(join(prepared, directory, filename), join(storeRoot, directory, filename));
      }
    }
    process.env.TURAS_ARTIFACT_STORE_ROOT = storeRoot;
  });
  afterAll(async () => {
    if (conversationIds.length) {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
      await client.connect();
      try {
        await client.query("BEGIN");
        const rows = await client.query<{ workspace_id: string; environment_id: string; expected_size_bytes: string;
          reservation_state: string; state: string }>(`
          SELECT i.workspace_id,i.environment_id,i.expected_size_bytes,i.reservation_state,i.state
          FROM artifact_upload_intents i JOIN artifact_upload_batches b ON b.id=i.batch_id
          WHERE b.origin_conversation_id = ANY($1::uuid[])`, [conversationIds]);
        for (const row of rows.rows) {
          await client.query(`UPDATE artifact_workspace_quotas SET
            reserved_bytes=reserved_bytes-$3,committed_bytes=committed_bytes-$4
            WHERE environment_id=$1 AND workspace_id=$2`,
          [row.environment_id,row.workspace_id,row.reservation_state === "reserved" ? Number(row.expected_size_bytes) : 0,
            row.reservation_state === "converted" ? Number(row.expected_size_bytes) : 0]);
        }
        await client.query(`UPDATE artifact_versions SET state='deleting',
          lifecycle_generation=lifecycle_generation+1 WHERE artifact_id IN (
            SELECT id FROM artifacts WHERE origin_conversation_id = ANY($1::uuid[]))
          AND state IN ('quarantined','processing','ready','partial','failed','cancelled','withdrawn')`, [conversationIds]);
        await client.query("DELETE FROM conversation_artifact_refs WHERE conversation_id = ANY($1::uuid[])", [conversationIds]);
        await client.query(`DELETE FROM artifact_extraction_units WHERE version_id IN (
          SELECT v.id FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
          WHERE a.origin_conversation_id = ANY($1::uuid[]))`, [conversationIds]);
        await client.query(`DELETE FROM artifact_extraction_runs WHERE version_id IN (
          SELECT v.id FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
          WHERE a.origin_conversation_id = ANY($1::uuid[]))`, [conversationIds]);
        await client.query(`DELETE FROM artifact_upload_intents WHERE batch_id IN (
          SELECT id FROM artifact_upload_batches WHERE origin_conversation_id = ANY($1::uuid[]))`, [conversationIds]);
        await client.query(`DELETE FROM artifact_versions WHERE artifact_id IN (
          SELECT id FROM artifacts WHERE origin_conversation_id = ANY($1::uuid[]))`, [conversationIds]);
        await client.query("DELETE FROM artifacts WHERE origin_conversation_id = ANY($1::uuid[])", [conversationIds]);
        await client.query("DELETE FROM artifact_upload_batches WHERE origin_conversation_id = ANY($1::uuid[])", [conversationIds]);
        await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [conversationIds]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { await client.end(); }
    }
    if (storeRoot) await rm(storeRoot, { recursive: true, force: true });
  });

  it("keeps the intent versionless until one atomic completion and denies another owner", async () => {
    const owner = await identity("mcteer");
    const other = await identity("panel");
    const chat = await createConversation(request("/api/conversations", "POST", owner,
      { customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID(), title: "Synthetic artifact upload" }));
    expect(chat.status).toBe(201);
    const conversationId = (await chat.json() as { data: { id: string } }).data.id;
    conversationIds.push(conversationId);
    const bytes = Buffer.from("Synthetic exact source bytes");
    const input = { conversationId, customerId: DEMO_IDS.sharedCustomer, idempotencyKey: randomUUID(), files: [{
      name: "synthetic.txt", expectedSizeBytes: bytes.length, declaredType: "text/plain",
      sourcePublishedOn: null, sourceObservedOn: null, rightsNote: "Synthetic fixture",
      audience: "delivery", dataCategory: "delivery_context",
    }] };
    const created = await createIntents(request("/api/artifacts/intents", "POST", owner, input));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toContain("no-store");
    expect(created.headers.get("x-content-type-options")).toBe("nosniff");
    const batch = (await created.json() as { data: { intents: Array<{ id: string; versionId: string | null }> } }).data;
    const intentId = batch.intents[0].id;
    expect(batch.intents[0].versionId).toBeNull();
    const path = `/api/artifacts/intents/${intentId}`;
    const status = await getIntent(request(path, "GET", owner), { params: Promise.resolve({ intentId }) });
    expect((await status.json() as { data: { versionId: string | null } }).data.versionId).toBeNull();
    const hidden = await getIntent(request(path, "GET", other), { params: Promise.resolve({ intentId }) });
    expect(hidden.status).toBe(404);
    expect((await hidden.json() as { error: { code: string } }).error.code).toBe("not_found");
    const uploaded = await putBytes(new Request(`${origin}${path}/bytes`, { method: "PUT",
      headers: { origin, cookie: owner.cookie, "x-csrf-token": owner.csrf,
        "content-type": "application/octet-stream", "content-length": String(bytes.length) }, body: bytes }),
    { params: Promise.resolve({ intentId }) });
    expect(uploaded.status).toBe(204);
    const key = randomUUID();
    const [first, second] = await Promise.all([
      completeIntent(request(`${path}/complete`, "POST", owner, { idempotencyKey: key }), { params: Promise.resolve({ intentId }) }),
      completeIntent(request(`${path}/complete`, "POST", owner, { idempotencyKey: key }), { params: Promise.resolve({ intentId }) }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const a = (await first.json() as { data: { versionId: string } }).data;
    const b = (await second.json() as { data: { versionId: string } }).data;
    expect(a.versionId).toBe(b.versionId);
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      const token = randomUUID();
      await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1", [a.versionId]);
      const leased = await client.query<{ id: string; original_digest: string; parser_image_digest: string;
        scan_policy_version: string; parser_policy_version: string; deadline_at: Date }>(`
        UPDATE artifact_extraction_runs SET state='leased',attempt_token=$2,
          heartbeat_at=now(),lease_expires_at=now()+interval '30 seconds',
          started_at=now(),deadline_at=now()+interval '120 seconds'
        WHERE version_id=$1 RETURNING id,original_digest,parser_image_digest,
          scan_policy_version,parser_policy_version,deadline_at`, [a.versionId,token]);
      const run = leased.rows[0];
      await runArtifactJob({ runId: run.id, versionId: a.versionId, attemptToken: token,
        lifecycleGeneration: 1, originalDigest: run.original_digest,
        parserImageDigest: run.parser_image_digest, scanPolicyVersion: run.scan_policy_version,
        parserPolicyVersion: run.parser_policy_version, deadlineAt: run.deadline_at.toISOString() });
      const published = await client.query<{ state: string }>(
        "SELECT state FROM artifact_versions WHERE id=$1", [a.versionId]);
      expect(published.rows[0].state).toBe("ready");
      const units = await client.query<{ text: string }>(
        "SELECT text FROM artifact_extraction_units WHERE version_id=$1", [a.versionId]);
      expect(units.rows.some((item) => item.text.includes("Synthetic exact source bytes"))).toBe(true);
      const versionPath = `/api/artifacts/${a.versionId}`;
      const version = await getVersion(request(versionPath, "GET", owner),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect((await version.json() as { data: { state: string; canReadOriginal: boolean } }).data)
        .toMatchObject({ state: "ready", canReadOriginal: true });
      const hiddenVersion = await getVersion(request(versionPath, "GET", other),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect(hiddenVersion.status).toBe(404);
      const located = await getUnits(request(`${versionPath}/units?limit=1`, "GET", owner),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect((await located.json() as { data: { items: Array<{ text: string; locator: { kind: string } }> } }).data.items[0])
        .toMatchObject({ text: "Synthetic exact source bytes", locator: { kind: "txt" } });
      const hiddenUnits = await getUnits(request(`${versionPath}/units`, "GET", other),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect(hiddenUnits.status).toBe(404);
      const original = await getOriginal(request(`${versionPath}/original`, "GET", owner),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect(original.status).toBe(200);
      expect(original.headers.get("content-disposition")).toContain("attachment");
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
      const hiddenOriginal = await getOriginal(request(`${versionPath}/original`, "GET", other),
        { params: Promise.resolve({ versionId: a.versionId }) });
      expect(hiddenOriginal.status).toBe(404);
      const another = await createConversation(request("/api/conversations", "POST", owner,
        { customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID(), title: "Synthetic reattachment" }));
      expect(another.status).toBe(201);
      const anotherId = (await another.json() as { data: { id: string } }).data.id;
      conversationIds.push(anotherId);
      const attachmentPath = `/api/conversations/${anotherId}/attachments`;
      const added = await attachVersion(request(attachmentPath, "POST", owner,
        { versionId: a.versionId, idempotencyKey: randomUUID() }),
      { params: Promise.resolve({ id: anotherId }) });
      expect(added.status).toBe(200);
      const linked = await listAttachments(request(attachmentPath, "GET", owner),
        { params: Promise.resolve({ id: anotherId }) });
      expect((await linked.json() as { data: { items: Array<{ versionId: string }> } }).data.items)
        .toContainEqual(expect.objectContaining({ versionId: a.versionId }));
      const otherList = await listAttachments(request(attachmentPath, "GET", other),
        { params: Promise.resolve({ id: anotherId }) });
      expect(otherList.status).toBe(404);
      const detached = await detachVersion(request(`${attachmentPath}/${a.versionId}`, "DELETE", owner,
        { idempotencyKey: randomUUID() }),
      { params: Promise.resolve({ id: anotherId, versionId: a.versionId }) });
      expect(detached.status).toBe(204);
      const replacementBytes = Buffer.from("Synthetic replacement bytes");
      const replacement = await createReplacement(request(`${versionPath}/replacements`, "POST", owner,
        { expectedGeneration: 1,idempotencyKey: randomUUID(),file: {
          ...input.files[0],name: "replacement.txt",expectedSizeBytes: replacementBytes.length } }),
      { params: Promise.resolve({ versionId: a.versionId }) });
      expect(replacement.status).toBe(201);
      const replacementIntent = (await replacement.json() as { data: { intent: { id: string;
        versionId: string | null } } }).data.intent;
      expect(replacementIntent.versionId).toBeNull();
      const replacementPath = `/api/artifacts/intents/${replacementIntent.id}`;
      const replacementUpload = await putBytes(new Request(`${origin}${replacementPath}/bytes`, {
        method: "PUT",headers: { origin,cookie: owner.cookie,"x-csrf-token": owner.csrf,
          "content-type": "application/octet-stream","content-length": String(replacementBytes.length) },
        body: replacementBytes }), { params: Promise.resolve({ intentId: replacementIntent.id }) });
      expect(replacementUpload.status).toBe(204);
      const replacementComplete = await completeIntent(request(`${replacementPath}/complete`,
        "POST",owner,{ idempotencyKey: randomUUID() }),
      { params: Promise.resolve({ intentId: replacementIntent.id }) });
      expect(replacementComplete.status).toBe(200);
      const newVersionId = (await replacementComplete.json() as { data: { versionId: string } }).data.versionId;
      const family = await client.query<{ artifact_id: string; version_number: number; state: string }>(`
        SELECT artifact_id,version_number,state FROM artifact_versions
        WHERE id=ANY($1::uuid[]) ORDER BY version_number`, [[a.versionId,newVersionId]]);
      expect(family.rows).toMatchObject([{ version_number: 1,state: "ready" },
        { version_number: 2,state: "quarantined" }]);
      expect(family.rows[0].artifact_id).toBe(family.rows[1].artifact_id);
    } finally { await client.end(); }
    const changedKey = await completeIntent(request(`${path}/complete`, "POST", owner,
      { idempotencyKey: randomUUID() }), { params: Promise.resolve({ intentId }) });
    expect(changedKey.status).toBe(409);

    const secondBatch = await createIntents(request("/api/artifacts/intents", "POST", owner,
      { ...input, idempotencyKey: randomUUID(), files: [{ ...input.files[0], expectedSizeBytes: 4 }] }));
    expect(secondBatch.status).toBe(201);
    const secondId = (await secondBatch.json() as { data: { intents: Array<{ id: string }> } }).data.intents[0].id;
    const wrongSize = await putBytes(new Request(`${origin}/api/artifacts/intents/${secondId}/bytes`, {
      method: "PUT", headers: { origin, cookie: owner.cookie, "x-csrf-token": owner.csrf,
        "content-type": "application/octet-stream", "content-length": "3" }, body: Buffer.from("abc"),
    }), { params: Promise.resolve({ intentId: secondId }) });
    expect(wrongSize.status).toBe(413);
    const unfinished = await getIntent(request(`/api/artifacts/intents/${secondId}`, "GET", owner),
      { params: Promise.resolve({ intentId: secondId }) });
    expect((await unfinished.json() as { data: { versionId: string | null } }).data.versionId).toBeNull();
  });

  it("commits one quota release when cancellation or expiry wins before completion", async () => {
    const { Client } = await import("pg");
    const baselineClient = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await baselineClient.connect();
    const baseline = await baselineClient.query<{ reserved_bytes: string }>(`
      SELECT reserved_bytes FROM artifact_workspace_quotas
      WHERE environment_id=$1 AND workspace_id=$2`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace]);
    const reservedBefore = Number(baseline.rows[0]?.reserved_bytes ?? 0);
    await baselineClient.end();
    const owner = await identity("mcteer");
    const chat = await createConversation(request("/api/conversations","POST",owner,
      { customerId: DEMO_IDS.sharedCustomer,requestKey: randomUUID(),title: "Synthetic expiry check" }));
    expect(chat.status).toBe(201);
    const conversationId = (await chat.json() as { data: { id: string } }).data.id;
    conversationIds.push(conversationId);
    const file = { name: "expiry.txt",expectedSizeBytes: 8,declaredType: "text/plain",
      sourcePublishedOn: null,sourceObservedOn: null,rightsNote: "Synthetic rights",
      audience: "delivery",dataCategory: "delivery_context" };
    const crossOrigin = await createIntents(new Request(`${origin}/api/artifacts/intents`,{
      method: "POST",headers: { origin: "https://untrusted.example",cookie: owner.cookie,
        "x-csrf-token": owner.csrf,"content-type": "application/json" },
      body: JSON.stringify({ conversationId,customerId: DEMO_IDS.sharedCustomer,
        idempotencyKey: randomUUID(),files: [file] }) }));
    expect(crossOrigin.status).toBe(403);
    const create = async () => {
      const response = await createIntents(request("/api/artifacts/intents","POST",owner,
        { conversationId,customerId: DEMO_IDS.sharedCustomer,idempotencyKey: randomUUID(),files: [file] }));
      expect(response.status).toBe(201);
      return (await response.json() as { data: { intents: Array<{ id: string }> } }).data.intents[0].id;
    };
    const cancelledId = await create();
    const cancelledPath = `/api/artifacts/intents/${cancelledId}`;
    const firstCancel = await cancelIntent(request(`${cancelledPath}/cancel`,"POST",owner,
      { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId: cancelledId }) });
    expect(firstCancel.status).toBe(200);
    expect((await firstCancel.json() as { data: { state: string; versionId: string | null } }).data)
      .toMatchObject({ state: "cancelled",versionId: null });
    expect((await cancelIntent(request(`${cancelledPath}/cancel`,"POST",owner,
      { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId: cancelledId }) })).status)
      .toBe(200);
    expect((await completeIntent(request(`${cancelledPath}/complete`,"POST",owner,
      { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId: cancelledId }) })).status)
      .toBe(409);

    const expiredId = await create();
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`UPDATE artifact_upload_intents SET
        created_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute'
        WHERE id=$1`,
        [expiredId]);
      const expiredPath = `/api/artifacts/intents/${expiredId}`;
      const expired = await completeIntent(request(`${expiredPath}/complete`,"POST",owner,
        { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId: expiredId }) });
      expect(expired.status).toBe(409);
      expect((await expired.json() as { error: { code: string } }).error.code).toBe("intent_expired");
      const expiredStatus = await getIntent(request(expiredPath,"GET",owner),
        { params: Promise.resolve({ intentId: expiredId }) });
      expect(expiredStatus.status).toBe(200);
      expect((await expiredStatus.json() as { data: { state: string; versionId: string | null } }).data)
        .toMatchObject({ state: "expired",versionId: null });
      const tooLateToCancel = await cancelIntent(request(`${expiredPath}/cancel`,"POST",owner,
        { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId: expiredId }) });
      expect((await tooLateToCancel.json() as { data: { state: string } }).data.state).toBe("expired");
      const lateBytes = await putBytes(new Request(`${origin}${expiredPath}/bytes`,{
        method: "PUT",headers: { origin,cookie: owner.cookie,"x-csrf-token": owner.csrf,
          "content-type": "application/octet-stream","content-length": "8" },
        body: Buffer.from("12345678") }),{ params: Promise.resolve({ intentId: expiredId }) });
      expect(lateBytes.status).toBe(409);
      const states = await client.query<{ state: string; reservation_state: string;
        version_id: string | null }>(`SELECT state,reservation_state,version_id
        FROM artifact_upload_intents WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[cancelledId,expiredId]]);
      expect(states.rows).toHaveLength(2);
      expect(states.rows).toContainEqual({ state: "cancelled",reservation_state: "released",version_id: null });
      expect(states.rows).toContainEqual({ state: "expired",reservation_state: "released",version_id: null });
      const runs = await client.query(`SELECT 1 FROM artifact_extraction_runs WHERE version_id IN
        (SELECT version_id FROM artifact_upload_intents WHERE id=ANY($1::uuid[]))`,
      [[cancelledId,expiredId]]);
      expect(runs.rowCount).toBe(0);
      const quota = await client.query<{ reserved_bytes: string }>(`
        SELECT reserved_bytes FROM artifact_workspace_quotas
        WHERE environment_id=$1 AND workspace_id=$2`,
      [process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace]);
      expect(Number(quota.rows[0].reserved_bytes)).toBe(reservedBefore);
    } finally { await client.end(); }
  });

  it("stops a streamed original when its owner login is revoked between chunks", async () => {
    const owner = await identity("panel");
    const actor = await getCurrentSession(request("/api/auth/session","GET",owner));
    expect(actor).not.toBeNull();
    const chat = await createConversation(request("/api/conversations","POST",owner,
      { customerId: DEMO_IDS.sharedCustomer,requestKey: randomUUID(),title: "Synthetic streamed source" }));
    expect(chat.status).toBe(201);
    const conversationId = (await chat.json() as { data: { id: string } }).data.id;
    conversationIds.push(conversationId);
    const bytes = Buffer.alloc(262_144,0x41);
    const intent = await createIntents(request("/api/artifacts/intents","POST",owner,{
      conversationId,customerId: DEMO_IDS.sharedCustomer,idempotencyKey: randomUUID(),files: [{
        name: "stream.txt",expectedSizeBytes: bytes.length,declaredType: "text/plain",
        sourcePublishedOn: null,sourceObservedOn: null,rightsNote: "Synthetic stream check",
        audience: "delivery",dataCategory: "delivery_context" }] }));
    expect(intent.status).toBe(201);
    const intentId = (await intent.json() as { data: { intents: Array<{ id: string }> } }).data.intents[0].id;
    const intentPath = `/api/artifacts/intents/${intentId}`;
    expect((await putBytes(new Request(`${origin}${intentPath}/bytes`,{
      method: "PUT",headers: { origin,cookie: owner.cookie,"x-csrf-token": owner.csrf,
        "content-type": "application/octet-stream","content-length": String(bytes.length) },body: bytes }),
    { params: Promise.resolve({ intentId }) })).status).toBe(204);
    const complete = await completeIntent(request(`${intentPath}/complete`,"POST",owner,
      { idempotencyKey: randomUUID() }),{ params: Promise.resolve({ intentId }) });
    expect(complete.status).toBe(200);
    const versionId = (await complete.json() as { data: { versionId: string } }).data.versionId;
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`UPDATE artifact_extraction_runs SET state='published',
        scan_receipt='{}',coverage='{"total":1,"visited":1,"omitted":[]}',
        manifest_digest=original_digest,published_at=now() WHERE version_id=$1`,[versionId]);
      await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[versionId]);
      await client.query("UPDATE artifact_versions SET state='ready' WHERE id=$1",[versionId]);
      const response = await getOriginal(request(`/api/artifacts/${versionId}/original`,"GET",owner),
        { params: Promise.resolve({ versionId }) });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      let released = first.value?.byteLength ?? 0;
      await client.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",[actor!.sessionId]);
      let stopped = false;
      try {
        for (let count=0; count<10; count += 1) {
          const part = await reader.read();
          if (part.done) break;
          released += part.value?.byteLength ?? 0;
        }
      } catch { stopped = true; }
      expect(stopped).toBe(true);
      expect(released).toBeLessThan(bytes.length);
    } finally {
      await client.query("UPDATE login_sessions SET revoked_at=NULL WHERE id=$1",[actor!.sessionId]);
      await client.end();
    }
  });
});
