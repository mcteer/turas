import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction, query } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { createDemand, qualifyDemand } from "../../lib/server/staffing/demands";
import { createSessionToken, hashSessionToken, sessionCookieName, type CurrentSession } from "../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { POST, GET } from "../../app/api/staffing/allocations/route";
import { GET as detail } from "../../app/api/staffing/allocations/[allocationId]/route";
import { POST as revise } from "../../app/api/staffing/allocations/[allocationId]/revisions/route";
import { POST as cancel } from "../../app/api/staffing/allocations/[allocationId]/cancel-proposal/route";
import { POST as reserve } from "../../app/api/staffing/allocations/[allocationId]/reserve/route";
import { GET as receipt } from "../../app/api/staffing/commands/[requestKey]/route";
const key = () => randomUUID();
const exact = (result: { revisionId: string; contentDigest: string; aggregateVersion: number }) => ({
  revisionId: result.revisionId, contentDigest: result.contentDigest, expectedAggregateVersion: result.aggregateVersion });
async function login(kind: "panel" | "partner" | "mcteer") {
  const token = createSessionToken();
  return withTransaction(async db => {
    const actor = await createProfileTestSession(db, kind);
    await db.query("UPDATE login_sessions SET token_hash=$1 WHERE id=$2", [hashSessionToken(token), actor.sessionId]);
    return { ...actor, token };
  });
}
function request(actor: CurrentSession, path: string, body?: unknown) {
  const origin = process.env.TURAS_APP_ORIGIN!;
  return new Request(`${origin}/api/staffing/allocations${path}`, { method: body ? "POST" : "GET",
    headers: { cookie: `${sessionCookieName()}=${actor.token}`, ...(body ? { origin,
      "x-csrf-token": csrfTokenForSession(actor.token), "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
const context = (allocationId: string) => ({ params: Promise.resolve({ allocationId }) });
async function fixture(actor: CurrentSession) {
  return withTransaction(async db => {
    const f = await createSyntheticDemandBaseline(db);
    const resource = await createResource(f.actor, { requestKey: key(), rationale: "Synthetic HTTP resource", resource: syntheticResource() }, db);
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const draft = await createDemand(actor, { requestKey: key(), rationale: "Synthetic HTTP demand",
      demand: { ...f.demand, fromDate: date, toDate: date, days: [{ date, requiredMinutes: 240 }] } }, db);
    const demand = await qualifyDemand(actor, draft.demandId, { requestKey: key(), rationale: "Synthetic HTTP qualification",
      revisionId: draft.revisionId!, contentDigest: draft.contentDigest!, expectedAggregateVersion: draft.aggregateVersion! }, db);
    return { customerId: f.demand.customerId, allocation: { resourceId: resource.resourceId!, demandId: demand.demandId!,
      demandRevisionId: demand.revisionId!, demandDigest: demand.contentDigest!, expectedDemandVersion: demand.aggregateVersion!,
      days: [{ date, minutes: 120 }] } };
  });
}
describe("governed allocation proposal HTTP", () => {
  it("allows another authorized internal member to reserve a proposal without acquiring authorship or staffing-manager authority", async () => {
    requireOwnedStaffingClone(); const manager = await login("mcteer"), panel = await login("panel"), f = await fixture(manager);
    const created = await POST(request(manager, "", { requestKey: key(), rationale: "Synthetic manager-authored proposal", allocation: f.allocation }));
    expect(created.status).toBe(200); const proposed = (await created.json()).data;
    const command = { ...exact(proposed), requestKey: key(), rationale: "Synthetic operational reservation" };
    const response = await reserve(request(panel, `/${proposed.allocationId}/reserve`, command), context(proposed.allocationId));
    expect(response.status).toBe(200); const reserved = (await response.json()).data;
    expect(reserved.state).toBe("tentative"); expect(Date.parse(reserved.expiresAt)).toBeGreaterThan(Date.now());
    expect((await (await reserve(request(panel, `/${proposed.allocationId}/reserve`, command), context(proposed.allocationId))).json()).data).toEqual(reserved);
    const lookup = new Request(`${process.env.TURAS_APP_ORIGIN}/api/staffing/commands/${command.requestKey}`,
      { headers: { cookie: `${sessionCookieName()}=${panel.token}` } });
    expect((await receipt(lookup, { params: Promise.resolve({ requestKey: command.requestKey }) })).status).toBe(200);
    const current = (await (await detail(request(panel, `/${proposed.allocationId}`), context(proposed.allocationId))).json()).data;
    expect(current).toMatchObject({ canReview: false, canRevise: false, canCancelProposal: false });
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [proposed.allocationId])).rows[0].n).toBe(0);
  }, 120_000);
  it("returns operational detail, identity-only pages and exact revision/cancellation receipts without commitment", async () => {
    requireOwnedStaffingClone(); const actor = await login("panel"), f = await fixture(actor);
    const command = { requestKey: key(), rationale: "PRIVATE_SYNTHETIC_PROPOSAL_NOTE", allocation: f.allocation };
    const response = await POST(request(actor, "", command));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const proposed = (await response.json()).data;
    expect((await (await POST(request(actor, "", command))).json()).data).toEqual(proposed);
    const read = await detail(request(actor, `/${proposed.allocationId}`), context(proposed.allocationId));
    expect(read.status).toBe(200); expect((await read.json()).data).toMatchObject({ state: "proposed", allocation: f.allocation });
    const list = await GET(request(actor, `?customerId=${f.customerId}&demandId=${f.allocation.demandId}&pageSize=1`));
    expect(list.status).toBe(200); const page = (await list.json()).data;
    expect(page.items[0].allocationId).toBe(proposed.allocationId);
    expect(JSON.stringify(page)).not.toContain("PRIVATE_SYNTHETIC_PROPOSAL_NOTE");
    const revised = await revise(request(actor, `/${proposed.allocationId}/revisions`, { ...exact(proposed), requestKey: key(),
      rationale: "Synthetic reduced proposal", allocation: { ...f.allocation, days: [{ date: f.allocation.days[0].date, minutes: 60 }] } }), context(proposed.allocationId));
    expect(revised.status).toBe(200); const current = (await revised.json()).data;
    const stale = await cancel(request(actor, `/${proposed.allocationId}/cancel-proposal`, { ...exact(proposed), requestKey: key(),
      rationale: "Synthetic stale cancellation" }), context(proposed.allocationId));
    expect(stale.status).toBe(409);
    const cancelled = await cancel(request(actor, `/${proposed.allocationId}/cancel-proposal`, { ...exact(current), requestKey: key(),
      rationale: "Synthetic exact cancellation" }), context(proposed.allocationId));
    expect(cancelled.status).toBe(200); expect((await cancelled.json()).data.state).toBe("cancelled");
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [proposed.allocationId])).rows[0].n).toBe(0);
  }, 120_000);
  it("denies other-author edits, partner proposals/private reads, CSRF and caller confirmation overrides", async () => {
    requireOwnedStaffingClone(); const panel = await login("panel"), manager = await login("mcteer"), partner = await login("partner"), f = await fixture(panel);
    const body = { requestKey: key(), rationale: "PRIVATE_SYNTHETIC_DENIED_PROPOSAL", allocation: f.allocation };
    const created = await POST(request(panel, "", body)); expect(created.status).toBe(200); const proposed = (await created.json()).data;
    expect((await revise(request(manager, `/${proposed.allocationId}/revisions`, { ...exact(proposed), ...body,
      requestKey: key() }), context(proposed.allocationId))).status).toBe(403);
    expect((await POST(request(partner, "", { ...body, requestKey: key() }))).status).toBe(403);
    const denied = await detail(request(partner, `/${proposed.allocationId}`), context(proposed.allocationId));
    expect(denied.status).toBe(403); expect(JSON.stringify(await denied.json())).not.toContain(body.rationale);
    const noCsrf = request(panel, "", body); noCsrf.headers.delete("x-csrf-token"); expect((await POST(noCsrf)).status).toBe(403);
    expect((await POST(request(panel, "", { ...body, allocation: { ...f.allocation, state: "confirmed" } }))).status).toBe(422);
    expect((await GET(request(panel, ""))).status).toBe(422);
    expect((await detail(request(panel, `/${proposed.allocationId}?includePrivate=true`), context(proposed.allocationId))).status).toBe(422);
    const command = { ...exact(proposed), requestKey: key(), rationale: "Synthetic manager cancellation" };
    expect((await cancel(request(manager, `/${proposed.allocationId}/cancel-proposal`, command), context(proposed.allocationId))).status).toBe(200);
    try {
      await query("UPDATE memberships SET role='member' WHERE id=$1", [manager.membershipId]);
      expect((await cancel(request(manager, `/${proposed.allocationId}/cancel-proposal`, command), context(proposed.allocationId))).status).toBe(403);
      const lookup = new Request(`${process.env.TURAS_APP_ORIGIN}/api/staffing/commands/${command.requestKey}`,
        { headers: { cookie: `${sessionCookieName()}=${manager.token}` } });
      expect((await receipt(lookup, { params: Promise.resolve({ requestKey: command.requestKey }) })).status).toBe(403);
    } finally { await query("UPDATE memberships SET role='admin' WHERE id=$1", [manager.membershipId]); }
  }, 120_000);
});
