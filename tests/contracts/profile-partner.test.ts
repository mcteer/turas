import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as ownSession } from "../../app/api/auth/session/route";
import { POST as command } from "../../app/api/customers/[customerId]/commands/route";
import { GET as profile } from "../../app/api/customers/[customerId]/profile/route";
import { GET as records } from "../../app/api/customers/[customerId]/records/route";
import { GET as submissions } from "../../app/api/customers/[customerId]/submissions/route";
import { GET as review } from "../../app/api/customers/[customerId]/review/route";
import { GET as history } from "../../app/api/customers/[customerId]/records/[recordId]/history/route";
import { GET as record } from "../../app/api/customers/[customerId]/records/[recordId]/route";
import { GET as receipt } from "../../app/api/customers/[customerId]/commands/[requestKey]/route";

const origin = "http://127.0.0.1:3000";
const customerId = DEMO_IDS.sharedCustomer;
const scope = (id: string = customerId) => ({ params: Promise.resolve({ customerId: id }) });
type Identity = { cookie: string; csrf: string };

async function signIn(name: "panel" | "mcteer" | "partner"): Promise<Identity> {
  const password = name === "panel" ? process.env.PANEL_PASSWORD :
    name === "partner" ? process.env.PARTNER_PASSWORD : process.env.TURAS_DEMO_PASSWORD;
  const signed = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }) }));
  expect(signed.status).toBe(200);
  const cookie = (signed.headers.get("set-cookie") ?? "").split(";")[0];
  const own = await ownSession(new Request(`${origin}/api/auth/session`, { headers: { cookie } }));
  return { cookie, csrf: (await own.json() as { data: { csrfToken: string } }).data.csrfToken };
}

async function write(identity: Identity, payload: unknown): Promise<Response> {
  return command(new Request(`${origin}/api/customers/${customerId}/commands`, { method: "POST",
    headers: { origin, cookie: identity.cookie, "x-csrf-token": identity.csrf,
      "content-type": "application/json" }, body: JSON.stringify(payload) }), scope());
}

async function read(identity: Identity, path: string, handler: typeof profile): Promise<Response> {
  return handler(new Request(`${origin}/api/customers/${customerId}/${path}`,
    { headers: { cookie: identity.cookie } }), scope());
}

describe("partner profile HTTP boundary", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = requireTestDatabaseUrl();
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });

  it("shows accepted delivery context from another contributor and only its own pending claim", async () => {
    const panel = await signIn("panel");
    const admin = await signIn("mcteer");
    const partner = await signIn("partner");
    const marker = randomUUID().slice(0, 8);
    const visible = `Delivery evidence ${marker}`;
    const hiddenPending = `Other pending ${marker}`;
    const hiddenOperations = `Internal utilization ${marker}`;
    const ownPending = `Partner pending ${marker}`;
    const propose = (identity: Identity, text: string, audience: "delivery" | "internal") => write(identity,
      { action: "propose_record", requestKey: randomUUID(), requestedAudience: audience,
        dataCategory: audience === "delivery" ? "delivery_context" : "internal_operations",
        payload: { kind: "claim", text, sourceType: "manual" } });
    const acceptedCandidate = await propose(panel, visible, "delivery");
    expect(acceptedCandidate.status).toBe(201);
    const acceptedIds = (await acceptedCandidate.json() as {
      data: { recordId: string; revisionId: string } }).data;
    const hiddenRequestKey = randomUUID();
    const hiddenCandidate = await write(panel, { action: "propose_record", requestKey: hiddenRequestKey,
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: hiddenPending, sourceType: "manual" } });
    expect(hiddenCandidate.status).toBe(201);
    const hiddenIds = (await hiddenCandidate.json() as { data: { recordId: string;
      revisionId: string } }).data;
    const internalCandidate = await propose(panel, hiddenOperations, "internal");
    expect(internalCandidate.status).toBe(201);
    const internalIds = (await internalCandidate.json() as { data: { recordId: string;
      revisionId: string } }).data;
    const internalId = internalIds.revisionId;
    const ownRequestKey = randomUUID();
    const ownCandidate = await write(partner, { action: "propose_record", requestKey: ownRequestKey,
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: ownPending, sourceType: "manual" } });
    expect(ownCandidate.status).toBe(201);
    const ownId = (await ownCandidate.json() as { data: { revisionId: string } }).data.revisionId;
    const queue = await read(admin, "review", review);
    expect(queue.status).toBe(200);
    const pending = (await queue.json() as { data: { pending: Array<{
      id: string; contentDigest: string; recordVersion: number;
      currentAcceptedRevisionId: string | null }> } }).data.pending;
    for (const id of [acceptedIds.revisionId, internalId]) {
      const candidate = pending.find((item) => item.id === id)!;
      const result = await write(admin, { action: "accept_revision", requestKey: randomUUID(),
        revisionId: id, digest: candidate.contentDigest,
        expectedRecordVersion: candidate.recordVersion,
        expectedAcceptedRevisionId: candidate.currentAcceptedRevisionId,
        rationale: "Synthetic partner boundary review" });
      expect(result.status).toBe(200);
    }
    const partnerProfile = await read(partner, "profile", profile);
    expect(partnerProfile.status).toBe(200);
    const profileText = JSON.stringify(await partnerProfile.json());
    expect(profileText).toContain(visible);
    for (const secret of [hiddenPending, hiddenOperations, ownPending]) {
      expect(profileText).not.toContain(secret);
    }
    const partnerRecords = await read(partner, "records", records);
    const recordsText = JSON.stringify(await partnerRecords.json());
    expect(recordsText).toContain(visible);
    expect(recordsText).toContain(ownPending);
    expect(recordsText).not.toContain(hiddenPending);
    expect(recordsText).not.toContain(hiddenOperations);
    const filtered = await records(new Request(`${origin}/api/customers/${customerId}/records?query=${encodeURIComponent(hiddenPending)}`,
      { headers: { cookie: partner.cookie } }), scope());
    expect((await filtered.json() as { data: { items: unknown[]; nextCursor: string | null } }).data)
      .toMatchObject({ items: [], nextCursor: null });
    const direct = (recordId: string) => record(new Request(`${origin}/api/customers/${customerId}/records/${recordId}`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId, recordId }) });
    expect((await direct(hiddenIds.recordId)).status).toBe(404);
    expect((await direct(internalIds.recordId)).status).toBe(404);
    for (const hiddenRecordId of [hiddenIds.recordId, internalIds.recordId]) {
      expect((await history(new Request(`${origin}/api/customers/${customerId}/records/${hiddenRecordId}/history`,
        { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId,
          recordId: hiddenRecordId }) })).status).toBe(404);
    }
    const hiddenReceipt = await receipt(new Request(`${origin}/api/customers/${customerId}/commands/${hiddenRequestKey}`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId,
        requestKey: hiddenRequestKey }) });
    expect(hiddenReceipt.status).toBe(404);
    const otherReceipt = await receipt(new Request(`${origin}/api/customers/${customerId}/commands/${ownRequestKey}`,
      { headers: { cookie: panel.cookie } }), { params: Promise.resolve({ customerId,
        requestKey: ownRequestKey }) });
    expect(otherReceipt.status).toBe(404);
    const ownReceipt = await receipt(new Request(`${origin}/api/customers/${customerId}/commands/${ownRequestKey}`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId,
        requestKey: ownRequestKey }) });
    expect(ownReceipt.status).toBe(200);
    const own = await read(partner, "submissions", submissions);
    expect(JSON.stringify(await own.json())).toContain(ownId);
    const recordHistory = await history(new Request(`${origin}/api/customers/${customerId}/records/${acceptedIds.recordId}/history`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId,
        recordId: acceptedIds.recordId }) });
    expect(recordHistory.status).toBe(200);
    expect(JSON.stringify(await recordHistory.json())).toContain(visible);
    expect((await read(partner, "review", review)).status).toBe(403);
    expect((await profile(new Request(`${origin}/api/customers/${DEMO_IDS.deniedCustomer}/profile`,
      { headers: { cookie: partner.cookie } }), scope(DEMO_IDS.deniedCustomer))).status).toBe(404);
    for (const revisionId of [acceptedIds.revisionId, internalId]) {
      expect((await write(admin, { action: "retract_revision", requestKey: randomUUID(),
        revisionId, expectedRecordVersion: 1,
        rationale: "Synthetic partner boundary cleanup" })).status).toBe(200);
    }
  });
});
