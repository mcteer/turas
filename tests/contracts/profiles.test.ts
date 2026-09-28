import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as sessionRoute } from "../../app/api/auth/session/route";
import { GET as directory } from "../../app/api/customers/route";
import { GET as profile } from "../../app/api/customers/[customerId]/profile/route";
import { GET as records } from "../../app/api/customers/[customerId]/records/route";
import { GET as record } from "../../app/api/customers/[customerId]/records/[recordId]/route";
import { GET as history } from "../../app/api/customers/[customerId]/records/[recordId]/history/route";
import { GET as review } from "../../app/api/customers/[customerId]/review/route";
import { POST as command } from "../../app/api/customers/[customerId]/commands/route";

const origin = "http://127.0.0.1:3000";
const customerId = DEMO_IDS.sharedCustomer;
const scope = (id: string = customerId) => ({ params: Promise.resolve({ customerId: id }) });
const recordScope = (id: string, customer: string = customerId) => ({ params: Promise.resolve({
  customerId: customer, recordId: id }) });
type Identity = { cookie: string; csrf: string };

async function signIn(name: "panel" | "mcteer" | "partner"): Promise<Identity> {
  const password = name === "panel" ? process.env.PANEL_PASSWORD :
    name === "partner" ? process.env.PARTNER_PASSWORD : process.env.TURAS_DEMO_PASSWORD;
  const response = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }) }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  const session = await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }));
  return { cookie, csrf: (await session.json() as { data: { csrfToken: string } }).data.csrfToken };
}

async function write(identity: Identity, payload: unknown): Promise<Response> {
  return command(new Request(`${origin}/api/customers/${customerId}/commands`, { method: "POST",
    headers: { origin, cookie: identity.cookie, "x-csrf-token": identity.csrf,
      "content-type": "application/json" }, body: JSON.stringify(payload) }), scope());
}

describe("canonical profile HTTP reads", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = requireTestDatabaseUrl();
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });

  it("projects a newly created sparse customer without inventing accepted context", async () => {
    const panel = await signIn("panel");
    const partner = await signIn("partner");
    const sparseId = randomUUID();
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
        VALUES($1,$2,'Synthetic sparse contract',true)`, [sparseId, DEMO_IDS.workspace]);
      const sparse = await profile(new Request(`${origin}/api/customers/${sparseId}/profile`,
        { headers: { cookie: panel.cookie } }), scope(sparseId));
      expect(sparse.status).toBe(200);
      const data = (await sparse.json() as { data: { customer: { id: string; displayName: string };
        acceptedFacts: unknown[]; attributedResearch: unknown[] } }).data;
      expect(data).toMatchObject({ customer: { id: sparseId,
        displayName: "Synthetic sparse contract" }, acceptedFacts: [], attributedResearch: [] });
      const list = await directory(new Request(`${origin}/api/customers`,
        { headers: { cookie: panel.cookie } }));
      expect((await list.json() as { data: { items: { id: string; displayName: string }[] } })
        .data.items).toContainEqual(expect.objectContaining(data.customer));
      const emptyRecords = await records(new Request(`${origin}/api/customers/${sparseId}/records`,
        { headers: { cookie: panel.cookie } }), scope(sparseId));
      expect((await emptyRecords.json() as { data: { items: unknown[]; nextCursor: string | null } }).data)
        .toMatchObject({ items: [], nextCursor: null });
      expect((await profile(new Request(`${origin}/api/customers/${sparseId}/profile`,
        { headers: { cookie: partner.cookie } }), scope(sparseId))).status).toBe(404);
    } finally {
      await client.query("DELETE FROM customer_profile_state WHERE customer_id=$1", [sparseId]);
      await client.query("DELETE FROM customer_references WHERE id=$1", [sparseId]);
      await client.end();
    }
  });

  it("agrees with the directory for internal identities and hides ungranted partner scope", async () => {
    const panel = await signIn("panel");
    const partner = await signIn("partner");
    const internalDirectory = await directory(new Request(`${origin}/api/customers`,
      { headers: { cookie: panel.cookie } }));
    const internalItems = (await internalDirectory.json() as {
      data: { items: { id: string; displayName: string }[] } }).data.items;
    expect(internalItems.map((item) => item.id)).toContain(customerId);
    expect(internalItems.map((item) => item.id)).toContain(DEMO_IDS.deniedCustomer);
    const profileResponse = await profile(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: panel.cookie } }), scope());
    expect(profileResponse.status).toBe(200);
    const profileData = (await profileResponse.json() as {
      data: { customer: { id: string; displayName: string } } }).data;
    expect(profileData.customer).toMatchObject(internalItems.find((item) => item.id === customerId)!);
    const partnerDirectory = await directory(new Request(`${origin}/api/customers`,
      { headers: { cookie: partner.cookie } }));
    const partnerText = JSON.stringify(await partnerDirectory.json());
    expect(partnerText).toContain(customerId);
    expect(partnerText).not.toContain(DEMO_IDS.deniedCustomer);
    expect((await profile(new Request(`${origin}/api/customers/${DEMO_IDS.deniedCustomer}/profile`,
      { headers: { cookie: partner.cookie } }), scope(DEMO_IDS.deniedCustomer))).status).toBe(404);
  });

  it("returns scoped current and historical records with bounded filters", async () => {
    const panel = await signIn("panel");
    const admin = await signIn("mcteer");
    const partner = await signIn("partner");
    const marker = randomUUID().slice(0, 8);
    const text = `Synthetic HTTP history ${marker} first`;
    const secondText = `Synthetic HTTP history ${marker} second`;
    const proposed = await write(panel, { action: "propose_record", requestKey: randomUUID(),
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text, sourceType: "manual" } });
    expect(proposed.status).toBe(201);
    const ids = (await proposed.json() as { data: { recordId: string; revisionId: string } }).data;
    const queue = await review(new Request(`${origin}/api/customers/${customerId}/review`,
      { headers: { cookie: admin.cookie } }), scope());
    const pending = (await queue.json() as { data: { pending: { id: string;
      contentDigest: string; recordVersion: number; currentAcceptedRevisionId: string | null }[] } })
      .data.pending.find((item) => item.id === ids.revisionId)!;
    expect((await write(admin, { action: "accept_revision", requestKey: randomUUID(),
      revisionId: ids.revisionId, digest: pending.contentDigest,
      expectedRecordVersion: pending.recordVersion,
      expectedAcceptedRevisionId: pending.currentAcceptedRevisionId,
      rationale: "Synthetic HTTP history reviewed" })).status).toBe(200);
    const secondProposal = await write(panel, { action: "propose_record", requestKey: randomUUID(),
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: secondText, sourceType: "manual" } });
    expect(secondProposal.status).toBe(201);
    const secondIds = (await secondProposal.json() as { data: { recordId: string;
      revisionId: string } }).data;
    const secondQueue = await review(new Request(`${origin}/api/customers/${customerId}/review`,
      { headers: { cookie: admin.cookie } }), scope());
    const secondCandidate = (await secondQueue.json() as { data: { pending: { id: string;
      contentDigest: string; recordVersion: number; currentAcceptedRevisionId: string | null }[] } })
      .data.pending.find((item) => item.id === secondIds.revisionId)!;
    expect((await write(admin, { action: "accept_revision", requestKey: randomUUID(),
      revisionId: secondIds.revisionId, digest: secondCandidate.contentDigest,
      expectedRecordVersion: secondCandidate.recordVersion,
      expectedAcceptedRevisionId: secondCandidate.currentAcceptedRevisionId,
      rationale: "Synthetic second history reviewed" })).status).toBe(200);
    const listed = await records(new Request(`${origin}/api/customers/${customerId}/records?kind=claim&query=${marker}&limit=1`,
      { headers: { cookie: partner.cookie } }), scope());
    expect(listed.status).toBe(200);
    const firstPage = (await listed.json() as { data: { items: { id: string }[];
      nextCursor: string | null } }).data;
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPageResponse = await records(new Request(`${origin}/api/customers/${customerId}/records?kind=claim&query=${marker}&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: { cookie: partner.cookie } }), scope());
    expect(secondPageResponse.status).toBe(200);
    const secondPage = (await secondPageResponse.json() as { data: { items: { id: string }[] } }).data;
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)))
      .toEqual(new Set([ids.revisionId, secondIds.revisionId]));
    expect((await records(new Request(`${origin}/api/customers/${customerId}/records?kind=claim&query=${marker}&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: { cookie: panel.cookie } }), scope())).status).toBe(422);
    const direct = await record(new Request(`${origin}/api/customers/${customerId}/records/${ids.recordId}`,
      { headers: { cookie: partner.cookie } }), recordScope(ids.recordId));
    expect(direct.status).toBe(200);
    expect(JSON.stringify(await direct.json())).toContain(text);
    const historical = await history(new Request(`${origin}/api/customers/${customerId}/records/${ids.recordId}/history`,
      { headers: { cookie: partner.cookie } }), recordScope(ids.recordId));
    expect(historical.status).toBe(200);
    const partnerHistory = (await historical.json() as {
      data: { items: { id: string }[]; events: unknown[] } }).data;
    expect(partnerHistory.items).toContainEqual(expect.objectContaining({ id: ids.revisionId }));
    expect(partnerHistory.events).toEqual([]);
    expect((await records(new Request(`${origin}/api/customers/${customerId}/records?limit=51`,
      { headers: { cookie: panel.cookie } }), scope())).status).toBe(422);
    expect((await records(new Request(`${origin}/api/customers/${customerId}/records?query=${"x".repeat(201)}`,
      { headers: { cookie: panel.cookie } }), scope())).status).toBe(422);
    expect((await record(new Request(`${origin}/api/customers/${DEMO_IDS.deniedCustomer}/records/${ids.recordId}`,
      { headers: { cookie: panel.cookie } }), recordScope(ids.recordId, DEMO_IDS.deniedCustomer))).status).toBe(404);
    expect((await write(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: ids.revisionId, expectedRecordVersion: 1,
      rationale: "Synthetic HTTP contract cleanup" })).status).toBe(200);
    expect((await write(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: secondIds.revisionId, expectedRecordVersion: 1,
      rationale: "Synthetic HTTP second contract cleanup" })).status).toBe(200);
    const after = await profile(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: panel.cookie } }), scope());
    expect(JSON.stringify(await after.json())).not.toContain(text);
  });
});
