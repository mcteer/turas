import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { createSessionToken, hashSessionToken, sessionCookieName, type CurrentSession } from "../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { POST, GET } from "../../app/api/staffing/finance/inputs/route";
import { GET as detail, PATCH } from "../../app/api/staffing/finance/inputs/[inputId]/route";
import { GET as policy, POST as approve } from "../../app/api/staffing/finance/policy-decisions/route";
import { GET as scenarios, POST as scenario } from "../../app/api/staffing/finance/scenarios/route";
import { GET as scenarioDetail } from "../../app/api/staffing/finance/scenarios/[scenarioId]/route";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { readDemand } from "../../lib/server/staffing/demands";
const sentinel = "PRIVATE_SYNTHETIC_FINANCE_PROVENANCE";
describe("exact scenario HTTP authorization", () => {
  it("returns incomplete rather than invented amounts, scopes lists and denies operational reads before identity lookup", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates(); const manager = await login("mcteer"), panel = await login("panel");
    const f = await withTransaction(async db => {
      // Projection fixture only: no actual human confirmation is implied.
      const ledger = await createConfirmedAllocationLedgerFixture(db);
      return { ...ledger, detail: await readDemand(manager, ledger.demand.demandId, db) };
    });
    const body = { requestKey: randomUUID(), rationale: "Synthetic HTTP incomplete scenario", customerId: f.detail.customerId,
      engagementId: f.detail.engagementId, baselineId: f.detail.baselineId, baselineDigest: f.detail.baselineDigest,
      fromDate: f.firstDate, toDate: f.firstDate, currency: "USD" };
    const created = await scenario(request(manager, "scenarios", body)); expect(created.status).toBe(200);
    const result = (await created.json()).data; expect(result.state).toBe("incomplete");
    const context = { params: Promise.resolve({ scenarioId: result.scenarioId }) };
    const read = await scenarioDetail(request(manager, `scenarios/${result.scenarioId}`), context);
    expect(read.status).toBe(200); expect(read.headers.get("cache-control")).toBe("private, no-store");
    expect((await read.json()).data).toMatchObject({ status: "incomplete", content: { contractedRevenue: null, nonlaborCost: null, contribution: null, planningOnly: true } });
    const page = await scenarios(request(manager, `scenarios?customerId=${body.customerId}&engagementId=${body.engagementId}&pageSize=1`));
    expect(page.status).toBe(200); const pageBody = (await page.json()).data;
    expect(pageBody.items[0].scenarioId).toBe(result.scenarioId); expect(JSON.stringify(pageBody)).not.toMatch(/minorUnits|contribution|deliveryCost|provenance/);
    for (const id of [result.scenarioId, randomUUID()]) {
      const denied = await scenarioDetail(request(panel, `scenarios/${id}`), { params: Promise.resolve({ scenarioId: id }) });
      expect(denied.status).toBe(403); expect((await denied.json()).error).toMatchObject({ code: "forbidden", message: "Action not allowed" });
    }
    expect((await scenario(request(manager, "scenarios", { ...body, requestKey: randomUUID(), contribution: "999" }))).status).toBe(422);
    const noCsrf = request(manager, "scenarios", { ...body, requestKey: randomUUID() }); noCsrf.headers.delete("x-csrf-token");
    expect((await scenario(noCsrf)).status).toBe(403);
    expect((await scenarios(request(panel, `scenarios?customerId=${body.customerId}`))).status).toBe(403);
  }, 120_000);
});
async function login(loginName: "mcteer" | "panel") {
  const token = createSessionToken();
  return withTransaction(async db => {
    const actor = await createProfileTestSession(db, loginName);
    await db.query("UPDATE login_sessions SET token_hash=$1 WHERE id=$2", [hashSessionToken(token), actor.sessionId]);
    return { ...actor, token };
  });
}
function request(actor: CurrentSession, path: string, body?: unknown, method = body ? "POST" : "GET") {
  const origin = process.env.TURAS_APP_ORIGIN!;
  return new Request(`${origin}/api/staffing/finance/${path}`, { method,
    headers: { cookie: `${sessionCookieName()}=${actor.token}`, ...(body ? { origin, "x-csrf-token": csrfTokenForSession(actor.token), "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
const context = (inputId: string) => ({ params: Promise.resolve({ inputId }) });
describe("finance HTTP response isolation", () => {
  it("returns no-store canonical finance inputs, exact revisions and explicit policy approval", async () => {
    requireOwnedStaffingClone();
    const actor = await login("mcteer"), resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic finance HTTP resource", resource: syntheticResource() });
    const body = { requestKey: randomUUID(), rationale: "Synthetic rate source", provenance: sentinel,
      input: { kind: "rate", rateKind: "loaded_cost", resourceId: resource.resourceId, currency: "USD", fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "1000" } };
    const created = await POST(request(actor, "inputs", body)); expect(created.status).toBe(200);
    const result = (await created.json()).data, response = await detail(request(actor, `inputs/${result.entityId}`), context(result.entityId));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toMatchObject({ withheld: false, provenance: sentinel, input: body.input });
    const revised = await PATCH(request(actor, `inputs/${result.entityId}`, { ...body, requestKey: randomUUID(), revisionId: result.revisionId,
      contentDigest: result.contentDigest, expectedAggregateVersion: result.aggregateVersion, input: { ...body.input, minorUnitsPerHour: "1200" } }, "PATCH"), context(result.entityId));
    expect(revised.status).toBe(200);
    const policyResponse = await policy(request(actor, "policy-decisions")); expect(policyResponse.status).toBe(200);
    const current = (await policyResponse.json()).data;
    const approved = await approve(request(actor, "policy-decisions", { requestKey: randomUUID(), rationale: "Synthetic human planning-only formula review",
      formulaVersion: current.formulaVersion, inputPolicyDigest: current.inputPolicyDigest }));
    expect(approved.status).toBe(200); expect((await approved.json()).data.warnings).toEqual(["planning_policy_only"]);
  }, 120_000);
  it("denies operational access to existing and nonexistent finance IDs with identical safe errors", async () => {
    requireOwnedStaffingClone();
    const manager = await login("mcteer"), panel = await login("panel"), resource = await createResource(manager,
      { requestKey: randomUUID(), rationale: "Synthetic finance privacy resource", resource: syntheticResource() });
    const body = { requestKey: randomUUID(), rationale: "Synthetic private input", provenance: sentinel,
      input: { kind: "rate", rateKind: "loaded_cost", resourceId: resource.resourceId, currency: "JPY", fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "99999999" } };
    const created = (await (await POST(request(manager, "inputs", body))).json()).data;
    const failures = [];
    for (const id of [created.entityId, randomUUID()]) {
      const response = await detail(request(panel, `inputs/${id}`), context(id)); expect(response.status).toBe(403);
      const failure = await response.json(); failures.push({ code: failure.error.code, message: failure.error.message });
      expect(JSON.stringify(failure)).not.toContain(sentinel); expect(JSON.stringify(failure)).not.toContain("99999999");
    }
    expect(failures[0]).toEqual(failures[1]);
    const list = await GET(request(panel, "inputs")); expect(list.status).toBe(403);
    expect(JSON.stringify(await list.json())).not.toContain(created.entityId);
    const publicPolicy = await policy(request(panel, "policy-decisions")); expect(publicPolicy.status).toBe(403);
  }, 120_000);
});
