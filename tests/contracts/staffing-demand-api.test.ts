import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction, query } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createProfileTestSession } from "../fixtures/profiles";
import { createSessionToken, hashSessionToken, sessionCookieName, type CurrentSession } from "../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { POST, GET } from "../../app/api/staffing/demands/route";
import { GET as detail, PATCH } from "../../app/api/staffing/demands/[demandId]/route";
import { POST as qualify } from "../../app/api/staffing/demands/[demandId]/qualify/route";
import { POST as cancel } from "../../app/api/staffing/demands/[demandId]/cancel/route";
import { GET as engagement } from "../../app/api/staffing/engagements/[engagementId]/route";
import { POST as compare, GET as matches } from "../../app/api/staffing/demands/[demandId]/matches/route";
async function login(kind: "panel" | "partner") {
  const token = createSessionToken();
  return withTransaction(async db => {
    const actor = await createProfileTestSession(db, kind);
    await db.query("UPDATE login_sessions SET token_hash=$1 WHERE id=$2", [hashSessionToken(token), actor.sessionId]);
    return { ...actor, token };
  });
}
function request(actor: CurrentSession, path: string, body?: unknown, method = body ? "POST" : "GET") {
  const origin = process.env.TURAS_APP_ORIGIN!;
  return new Request(`${origin}/api/staffing/demands${path}`, { method, headers: { cookie: `${sessionCookieName()}=${actor.token}`,
    ...(body ? { origin, "x-csrf-token": csrfTokenForSession(actor.token), "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
const context = (demandId: string) => ({ params: Promise.resolve({ demandId }) });
describe("strict governed staffing demand HTTP", () => {
  it("releases minimal current accepted work-package choices only in the authorized customer scope", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(createSyntheticDemandBaseline), panel = await login("panel"), partner = await login("partner");
    const context = { params: Promise.resolve({ engagementId: f.demand.engagementId }) };
    const origin = process.env.TURAS_APP_ORIGIN!;
    const read = (actor: CurrentSession, customerId: string) => new Request(`${origin}/api/staffing/engagements/${f.demand.engagementId}?customerId=${customerId}`,
      { headers: { cookie: `${sessionCookieName()}=${actor.token}` } });
    const response = await engagement(read(panel, f.demand.customerId), context);
    expect(response.status).toBe(200); const result = (await response.json()).data;
    expect(result).toMatchObject({ baselineId: f.demand.baselineId, baselineDigest: f.demand.baselineDigest, reviewRequired: false,
      workPackages: f.content.workPackages.map(work => ({ key: work.key, title: work.title, ownerRole: work.ownerRole })) });
    for (const privateField of ["sourceDependencies", "assertions", "exitEvidence"]) expect(JSON.stringify(result)).not.toContain(privateField);
    expect((await engagement(read(panel, randomUUID()), context)).status).toBe(404);
    expect((await engagement(read(partner, f.demand.customerId), context)).status).toBe(403);
  }, 120_000);
  it("allows an operational member to propose, read and qualify exact demand with no-store receipts", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(createSyntheticDemandBaseline), actor = await login("panel");
    const created = await POST(request(actor, "", { requestKey: randomUUID(), rationale: "Synthetic operational demand", demand: f.demand }));
    expect(created.status).toBe(200); expect(created.headers.get("cache-control")).toBe("private, no-store");
    const result = (await created.json()).data;
    const read = await detail(request(actor, `/${result.demandId}`), context(result.demandId));
    expect(read.status).toBe(200); const projection = (await read.json()).data;
    expect(projection).toMatchObject({ state: "draft", reviewRequired: false, demand: f.demand });
    const qualified = await qualify(request(actor, `/${result.demandId}/qualify`, { requestKey: randomUUID(), rationale: "Synthetic exact qualification",
      revisionId: result.revisionId, contentDigest: result.contentDigest, expectedAggregateVersion: result.aggregateVersion }), context(result.demandId));
    expect(qualified.status).toBe(200); const qualifiedResult = (await qualified.json()).data; expect(qualifiedResult.state).toBe("qualified");
    const compared = await compare(request(actor, `/${result.demandId}/matches`, { requestKey: randomUUID(), rationale: "Synthetic scoped comparison",
      revisionId: result.revisionId, contentDigest: result.contentDigest, expectedAggregateVersion: qualifiedResult.aggregateVersion }), context(result.demandId));
    expect(compared.status).toBe(200); const comparison = (await compared.json()).data;
    const matchPage = await matches(request(actor, `/${result.demandId}/matches?resultId=${comparison.entityId}&pageSize=1`), context(result.demandId));
    expect(matchPage.status).toBe(200); expect(matchPage.headers.get("cache-control")).toBe("private, no-store");
    const matchBody = (await matchPage.json()).data;
    expect(matchBody).toMatchObject({ resultId: comparison.entityId, demandRevisionId: result.revisionId, formulaVersion: "staffing-matching-v1" });
    expect(matchBody.items.length).toBeLessThanOrEqual(1);
    for (const field of ["evidence", "minorUnits", "rationale", "annual_leave"]) expect(JSON.stringify(matchBody)).not.toContain(field);
    const stale = await PATCH(request(actor, `/${result.demandId}`, { requestKey: randomUUID(), rationale: "Synthetic obsolete head",
      revisionId: result.revisionId, contentDigest: result.contentDigest, expectedAggregateVersion: result.aggregateVersion, demand: f.demand }, "PATCH"), context(result.demandId));
    expect(stale.status).toBe(409);
    const list = await GET(request(actor, `?customerId=${f.demand.customerId}&engagementId=${f.demand.engagementId}`));
    expect(list.status).toBe(200); const page = (await list.json()).data;
    expect(page.items).toEqual([expect.objectContaining({ demandId: result.demandId, state: "qualified" })]);
    expect(JSON.stringify(page)).not.toContain(f.demand.title);
    const cancelled = await cancel(request(actor, `/${result.demandId}/cancel`, { requestKey: randomUUID(), rationale: "Synthetic cancellation",
      revisionId: result.revisionId, contentDigest: result.contentDigest, expectedAggregateVersion: qualifiedResult.aggregateVersion }), context(result.demandId));
    expect(cancelled.status).toBe(200); expect((await cancelled.json()).data.state).toBe("cancelled");
    expect((await matches(request(actor, `/${result.demandId}/matches?resultId=${comparison.entityId}`), context(result.demandId))).status).toBe(409);
    await query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
    expect((await detail(request(actor, `/${result.demandId}`), context(result.demandId))).status).toBe(401);
  }, 120_000);
  it("rejects partner access, missing CSRF, unknown fields and duplicate or absent scope parameters", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(createSyntheticDemandBaseline), panel = await login("panel"), partner = await login("partner");
    const body = { requestKey: randomUUID(), rationale: "Synthetic denied demand", demand: f.demand };
    expect((await POST(request(partner, "", body))).status).toBe(403);
    const noCsrf = request(panel, "", body); noCsrf.headers.delete("x-csrf-token");
    expect((await POST(noCsrf)).status).toBe(403);
    expect((await POST(request(panel, "", { ...body, approved: true }))).status).toBe(422);
    expect((await GET(request(panel, ""))).status).toBe(422);
    expect((await GET(request(panel, `?customerId=${f.demand.customerId}&customerId=${f.demand.customerId}`))).status).toBe(422);
    const response = await GET(request(partner, `?customerId=${f.demand.customerId}`));
    expect(response.status).toBe(403); expect(JSON.stringify(await response.json())).not.toContain(f.demand.workPackageKey);
  }, 120_000);
});
