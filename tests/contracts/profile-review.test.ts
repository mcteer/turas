import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as sessionRoute } from "../../app/api/auth/session/route";
import { GET as queueRoute } from "../../app/api/customers/[customerId]/review/route";
import { GET as stewardsRoute } from "../../app/api/customers/[customerId]/stewards/route";
import { POST as commandRoute } from "../../app/api/customers/[customerId]/commands/route";

const origin = "http://127.0.0.1:3000";
const customerId = DEMO_IDS.sharedCustomer;
const scope = { params: Promise.resolve({ customerId }) };
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
const write = (actor: Identity, payload: unknown) => commandRoute(new Request(
  `${origin}/api/customers/${customerId}/commands`, { method: "POST",
    headers: { origin, cookie: actor.cookie, "x-csrf-token": actor.csrf,
      "content-type": "application/json" }, body: JSON.stringify(payload) }), scope);

describe("review and steward HTTP authority", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = requireTestDatabaseUrl();
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });

  it("requires current steward authority, exact digest and a partner-safe reason", async () => {
    const panel = await signIn("panel"), admin = await signIn("mcteer"), partner = await signIn("partner");
    const marker = randomUUID();
    const proposal = async (text: string) => {
      const response = await write(partner, { action: "propose_record", requestKey: randomUUID(),
        requestedAudience: "delivery", dataCategory: "delivery_context",
        payload: { kind: "claim", text, sourceType: "manual" } });
      expect(response.status).toBe(201);
      return (await response.json() as { data: { revisionId: string } }).data.revisionId;
    };
    const firstId = await proposal(`Synthetic steward review ${marker}`);
    expect((await write(partner, { action: "propose_record", requestKey: randomUUID(),
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: `Synthetic forged score ${marker}`, sourceType: "manual" },
      qualityInput: { rubricVersion: "evidence-quality-v1", R: 4, D: 4, C: 4, Q: 100 },
    })).status).toBe(422);
    const review = (actor: Identity) => queueRoute(new Request(`${origin}/api/customers/${customerId}/review`,
      { headers: { cookie: actor.cookie } }), scope);
    expect((await review(panel)).status).toBe(403);
    const listed = await stewardsRoute(new Request(`${origin}/api/customers/${customerId}/stewards`,
      { headers: { cookie: admin.cookie } }), scope);
    const prior = (await listed.json() as { data: { items: {
      membershipId: string; version: number; active: boolean }[] } }).data.items
      .find((item) => item.membershipId === DEMO_IDS.panelMembership);
    expect(prior?.active).not.toBe(true);
    const assigned = await write(admin, { action: "assign_steward", requestKey: randomUUID(),
      membershipId: DEMO_IDS.panelMembership, expectedAssignmentVersion: prior?.version ?? 0,
      rationale: "Synthetic temporary steward" });
    expect(assigned.status).toBe(200);
    const version = (await assigned.json() as { data: { version: number } }).data.version;
    const queue = await review(panel);
    expect(queue.status).toBe(200);
    const candidate = (await queue.json() as { data: { pending: {
      id: string; contentDigest: string }[] } }).data.pending.find((item) => item.id === firstId)!;
    const base = { action: "accept_revision", revisionId: firstId,
      expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
      rationale: "Synthetic partner claim reviewed" };
    expect((await write(panel, { ...base, requestKey: randomUUID(),
      digest: candidate.contentDigest })).status).toBe(422);
    expect((await write(panel, { ...base, requestKey: randomUUID(),
      digest: "0".repeat(64), partnerSafeReason: "Delivery context verified" })).status).toBe(409);
    expect((await write(panel, { ...base, requestKey: randomUUID(),
      digest: candidate.contentDigest, partnerSafeReason: "Delivery context verified",
      qualityInput: { R: 4, D: 4, C: 4 },
    })).status).toBe(422);
    expect((await write(panel, { ...base, requestKey: randomUUID(),
      digest: candidate.contentDigest, partnerSafeReason: "Delivery context verified" })).status).toBe(200);
    const secondId = await proposal(`Synthetic steward revocation ${marker}`);
    expect((await write(admin, { action: "revoke_steward", requestKey: randomUUID(),
      membershipId: DEMO_IDS.panelMembership, expectedAssignmentVersion: version,
      rationale: "Synthetic stewardship complete" })).status).toBe(200);
    expect((await write(panel, { action: "reject_revision", requestKey: randomUUID(),
      revisionId: secondId, expectedRecordVersion: 0,
      rationale: "No longer assigned", partnerSafeReason: "More evidence needed" })).status).toBe(403);
    expect((await write(admin, { action: "reject_revision", requestKey: randomUUID(),
      revisionId: secondId, expectedRecordVersion: 0,
      rationale: "Synthetic cleanup", partnerSafeReason: "More evidence needed" })).status).toBe(200);
    expect((await write(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: firstId, expectedRecordVersion: 1,
      rationale: "Synthetic review contract cleanup" })).status).toBe(200);
  });
});
