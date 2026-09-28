import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase, requireTestDatabaseUrl } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as sessionRoute } from "../../app/api/auth/session/route";
import { GET as sourceRoute } from "../../app/api/customers/[customerId]/sources/[sourceRevisionId]/route";
import { GET as profileRoute } from "../../app/api/customers/[customerId]/profile/route";
import { POST as commandRoute } from "../../app/api/customers/[customerId]/commands/route";

const origin = "http://127.0.0.1:3000";
const customerId = DEMO_IDS.sharedCustomer;
const sourceScope = (sourceRevisionId: string, customer: string = customerId) => ({ params: Promise.resolve({
  customerId: customer, sourceRevisionId,
}) });

async function identity(name: "mcteer" | "partner") {
  const password = name === "partner" ? process.env.PARTNER_PASSWORD : process.env.TURAS_DEMO_PASSWORD;
  const response = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }) }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  const session = await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }));
  return { cookie, csrf: (await session.json() as { data: { csrfToken: string } }).data.csrfToken };
}

describe("checked source HTTP projection", () => {
  it("shows public checked detail, hides internal detail and withdraws delivery context", async () => {
    const testDatabaseUrl = requireTestDatabaseUrl();
    const marker = randomUUID();
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    const sources = await withTestDatabase(async (client) => {
      const shared = { workspaceId: DEMO_IDS.workspace, customerId,
        trustedIdentity: "synthetic-fixture-v1", title: `Synthetic checked source ${marker}`,
        passage: `Synthetic public passage ${marker}`, supportedClaim: "A fictional capability is documented.",
        publicationAt: "2026-09-01T00:00:00Z", retrievalAt: "2026-09-27T00:00:00Z",
        rights: "Synthetic fixture", qualityInput: { rubricVersion: "evidence-quality-v1",
          R: 2, D: 4, C: 1, reliabilityRationale: "Named synthetic fixture",
          directnessRationale: "Exact public passage", corroborationRationale: "One source",
          informationType: "product_capability", dateBasis: "publication" },
        checks: { identity: true, scope: true, integrity: true, content: true,
          rationale: "Verified synthetic source", checkVersion: "research-check-v1" },
      } as const;
      const delivery = await ingestVerifiedResearch({ ...shared, audience: "delivery",
        location: `https://example.com/public-${marker}` }, client);
      const internal = await ingestVerifiedResearch({ ...shared, audience: "internal",
        location: `https://example.com/internal-${marker}` }, client);
      return { delivery: delivery.sourceRevisionId, internal: internal.sourceRevisionId };
    });
    process.env.DATABASE_URL = testDatabaseUrl;
    const admin = await identity("mcteer");
    const partner = await identity("partner");
    const get = (cookie: string, sourceRevisionId: string, customer: string = customerId) =>
      sourceRoute(new Request(`${origin}/api/customers/${customer}/sources/${sourceRevisionId}`,
        { headers: { cookie } }), sourceScope(sourceRevisionId, customer));
    const publicResponse = await get(partner.cookie, sources.delivery);
    expect(publicResponse.status).toBe(200);
    const publicData = (await publicResponse.json() as { data: { passage: string;
      checks: Record<string, unknown>; quality: Record<string, unknown> } }).data;
    expect(publicData.passage).toContain(marker);
    expect(publicData.checks).toMatchObject({ version: "research-check-v1" });
    expect(publicData.checks).not.toHaveProperty("rationale");
    expect(publicData.quality).not.toHaveProperty("input");
    expect((await get(partner.cookie, sources.internal)).status).toBe(404);
    const internalResponse = await get(admin.cookie, sources.internal);
    expect(internalResponse.status).toBe(200);
    expect((await internalResponse.json() as { data: { checks: Record<string, unknown> } })
      .data.checks).toHaveProperty("rationale");
    expect((await get(admin.cookie, sources.delivery, DEMO_IDS.deniedCustomer)).status).toBe(404);
    const withdraw = await commandRoute(new Request(`${origin}/api/customers/${customerId}/commands`, {
      method: "POST", headers: { origin, cookie: admin.cookie, "x-csrf-token": admin.csrf,
        "content-type": "application/json" },
      body: JSON.stringify({ action: "withdraw_source", requestKey: randomUUID(),
        sourceRevisionId: sources.delivery, expectedLifecycleVersion: 0,
        rationale: "Synthetic source withdrawn" }),
    }), { params: Promise.resolve({ customerId }) });
    expect(withdraw.status).toBe(200);
    expect((await get(partner.cookie, sources.delivery)).status).toBe(404);
    const internalAfter = await get(admin.cookie, sources.delivery);
    expect((await internalAfter.json() as { data: { state: string } }).data.state).toBe("withdrawn");
    const profile = await profileRoute(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId }) });
    expect((await profile.json() as { data: { attributedResearch: { sourceRevisionId: string }[] } })
      .data.attributedResearch.map((source) => source.sourceRevisionId)).not.toContain(sources.delivery);
    const manualUrl = `https://example.com/unverified-${marker}`;
    const manual = await commandRoute(new Request(`${origin}/api/customers/${customerId}/commands`, {
      method: "POST", headers: { origin, cookie: partner.cookie,
        "x-csrf-token": partner.csrf, "content-type": "application/json" },
      body: JSON.stringify({ action: "propose_record", requestKey: randomUUID(),
        requestedAudience: "delivery", dataCategory: "delivery_context",
        payload: { kind: "claim", text: `Unverified manual URL ${marker}`,
          sourceType: "manual", sourceUrl: manualUrl } }),
    }), { params: Promise.resolve({ customerId }) });
    expect(manual.status).toBe(201);
    const manualId = (await manual.json() as { data: { revisionId: string } }).data.revisionId;
    const beforeReview = await profileRoute(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: partner.cookie } }), { params: Promise.resolve({ customerId }) });
    const projected = (await beforeReview.json() as { data: {
      acceptedFacts: { id: string }[]; attributedResearch: { location: string }[] } }).data;
    expect(projected.acceptedFacts.map((fact) => fact.id)).not.toContain(manualId);
    expect(projected.attributedResearch.map((source) => source.location)).not.toContain(manualUrl);
    const reject = await commandRoute(new Request(`${origin}/api/customers/${customerId}/commands`, {
      method: "POST", headers: { origin, cookie: admin.cookie,
        "x-csrf-token": admin.csrf, "content-type": "application/json" },
      body: JSON.stringify({ action: "reject_revision", requestKey: randomUUID(),
        revisionId: manualId, expectedRecordVersion: 0,
        rationale: "Unverified user-provided URL", partnerSafeReason: "Please provide checked evidence" }),
    }), { params: Promise.resolve({ customerId }) });
    expect(reject.status).toBe(200);
  });
});
