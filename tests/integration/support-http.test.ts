import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { GET } from "../../app/api/support/customers/[customerId]/route";
import { POST } from "../../app/api/support/customers/[customerId]/commands/route";
import { GET as receiptGET } from "../../app/api/support/receipts/[requestKey]/route";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { issueSession, sessionCookieName, type CurrentSession } from "../../lib/server/auth/sessions";
import { getServerConfig } from "../../lib/server/config";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

describe("support authenticated HTTP boundary", () => {
  let author: CurrentSession;
  beforeAll(async () => {
    author = await withSupportDatabase(db => createProfileTestSession(db, "panel"));
    author = { ...author, ...await issueSession(author) };
  });
  function request(path: string, body?: unknown, csrf = true) {
    const config = getServerConfig();
    return new Request(config.TURAS_APP_ORIGIN + path, { method: body === undefined ? "GET" : "POST",
      headers: { cookie: `${sessionCookieName(config)}=${author.token}`, origin: config.TURAS_APP_ORIGIN,
        "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrfTokenForSession(author.token, config) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const context = { params: Promise.resolve({ customerId: DEMO_IDS.sharedCustomer }) };
  it("returns no-store empty readiness and never initializes on GET", async () => {
    const response = await GET(request(`/api/support/customers/${DEMO_IDS.sharedCustomer}`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data.effectiveReadiness).toBe("not_assessed");
    await withSupportDatabase(async db => expect(Number((await db.query("SELECT count(*) AS count FROM support_scopes")).rows[0].count)).toBe(0));
  });
  it("requires session, CSRF and strict query/command fields", async () => {
    expect((await GET(new Request(getServerConfig().TURAS_APP_ORIGIN + "/api/support/customers/" + DEMO_IDS.sharedCustomer), context)).status).toBe(401);
    expect((await POST(request("/api/support/commands", {}, false), context)).status).toBe(403);
    expect((await GET(request(`/api/support/customers/${DEMO_IDS.sharedCustomer}?unknown=value`), context)).status).toBe(400);
    expect((await POST(request("/api/support/commands", { operation: "save_assessment", principalId: randomUUID() }), context)).status).toBe(400);
  });
  it("reconciles the exact actor-owned committed key without returning a saved body", async () => {
    const requestKey = randomUUID();
    const saved = await POST(request("/api/support/commands", { contractVersion: "support-v1", operation: "save_assessment",
      requestKey, workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [],
      content: unknownSupportAssessment() }), context);
    expect(saved.status).toBe(200);
    const receipt = await receiptGET(request(`/api/support/receipts/${requestKey}`), { params: Promise.resolve({ requestKey }) });
    expect(receipt.status).toBe(200);
    const body = await receipt.json();
    expect(body.data.state).toBe("committed");
    expect(body.data.requestKey).toBe(requestKey);
    expect(body.data.content).toBeUndefined();
  });
});
