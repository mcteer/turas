import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as sessionRoute } from "../../app/api/auth/session/route";
import { GET as profile } from "../../app/api/customers/[customerId]/profile/route";
import { GET as records } from "../../app/api/customers/[customerId]/records/route";
import { GET as review } from "../../app/api/customers/[customerId]/review/route";
import { POST as commandRoute } from "../../app/api/customers/[customerId]/commands/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { withTransaction } from "../../lib/server/db/client";

const origin = "http://127.0.0.1:3000";
const scope = (customerId: string) => ({ params: Promise.resolve({ customerId }) });
async function signIn(loginName: "panel" | "mcteer" | "partner") {
  const password = loginName === "panel" ? process.env.PANEL_PASSWORD :
    loginName === "partner" ? process.env.PARTNER_PASSWORD : process.env.TURAS_DEMO_PASSWORD;
  const response = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: loginName, password }) }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  const own = await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }));
  const result = await own.json() as { data: { csrfToken: string } };
  return { cookie, csrf: result.data.csrfToken };
}

describe("profile HTTP foundation", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = requireTestDatabaseUrl();
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });

  it("keeps ungranted partner routes hidden and steward queue unavailable to contributors", async () => {
    const partner = await signIn("partner");
    const panel = await signIn("panel");
    const denied = await profile(new Request(`${origin}/api/customers/${DEMO_IDS.deniedCustomer}/profile`,
      { headers: { cookie: partner.cookie } }), scope(DEMO_IDS.deniedCustomer));
    expect(denied.status).toBe(404);
    const queue = await review(new Request(`${origin}/api/customers/${DEMO_IDS.sharedCustomer}/review`,
      { headers: { cookie: panel.cookie } }), scope(DEMO_IDS.sharedCustomer));
    expect(queue.status).toBe(403);
  });

  it("saves manual context as Pending with idempotent receipt, then accepts an exact candidate", async () => {
    const panel = await signIn("panel");
    const admin = await signIn("mcteer");
    const customerId = DEMO_IDS.sharedCustomer;
    const requestKey = randomUUID();
    const productKey = `http-${randomUUID().slice(0, 8)}`;
    const proposal = { requestKey, action: "propose_record", requestedAudience: "delivery",
      dataCategory: "delivery_context", payload: { kind: "product_use", productKey,
        displayName: "Synthetic HTTP product", state: "actual",
        usageDescription: "Synthetic usage for contract validation",
        observedAt: "2026-09-01T00:00:00Z" } };
    const write = (identity: typeof panel, input: unknown) => commandRoute(
      new Request(`${origin}/api/customers/${customerId}/commands`, { method: "POST",
        headers: { origin, cookie: identity.cookie, "x-csrf-token": identity.csrf,
          "content-type": "application/json" }, body: JSON.stringify(input) }), scope(customerId));
    expect((await write(panel, { ...proposal, origin: "independent_research" })).status).toBe(422);
    expect((await write(panel, { ...proposal, requestKey: randomUUID(),
      dataCategory: "internal_operations" })).status).toBe(422);
    const partner = await signIn("partner");
    expect((await write(partner, { ...proposal, requestKey: randomUUID(),
      requestedAudience: "internal", dataCategory: "internal_operations" })).status).toBe(403);
    const saved = await write(panel, proposal);
    expect(saved.status).toBe(201);
    const candidate = (await saved.json() as { data: { recordId: string; revisionId: string } }).data;
    const replay = await write(panel, proposal);
    expect(replay.status).toBe(200);
    expect((await replay.json() as { data: { revisionId: string } }).data.revisionId)
      .toBe(candidate.revisionId);
    const before = await profile(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: panel.cookie } }), scope(customerId));
    expect(JSON.stringify(await before.json())).not.toContain(productKey);
    const queueResponse = await review(new Request(`${origin}/api/customers/${customerId}/review`,
      { headers: { cookie: admin.cookie } }), scope(customerId));
    expect(queueResponse.status).toBe(200);
    const queue = (await queueResponse.json() as { data: { pending: {
      id: string; contentDigest: string; recordVersion: number;
      currentAcceptedRevisionId: string | null }[] } }).data;
    const exact = queue.pending.find((item) => item.id === candidate.revisionId)!;
    expect(exact).toBeTruthy();
    expect((await write(admin, { requestKey: randomUUID(), action: "accept_revision",
      revisionId: candidate.revisionId, digest: exact.contentDigest,
      expectedRecordVersion: exact.recordVersion,
      expectedAcceptedRevisionId: exact.currentAcceptedRevisionId,
      rationale: "Synthetic HTTP review" })).status).toBe(200);
    const accepted = await profile(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: panel.cookie } }), scope(customerId));
    expect(JSON.stringify(await accepted.json())).toContain(productKey);
    const listed = await records(new Request(`${origin}/api/customers/${customerId}/records?kind=product_use&query=${productKey}`,
      { headers: { cookie: panel.cookie } }), scope(customerId));
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain(candidate.revisionId);
    const current = await getCurrentSession(new Request(`${origin}/api/auth/session`,
      { headers: { cookie: panel.cookie } }));
    expect(current?.sessionId).toBeTruthy();
    await withTransaction((client) => client.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",
      [current!.sessionId]));
    expect((await write(panel, proposal)).status).toBe(401);
    expect((await write(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: candidate.revisionId, expectedRecordVersion: 1,
      rationale: "Synthetic foundation contract cleanup" })).status).toBe(200);
  });
});
