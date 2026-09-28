import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { maturityDimensions } from "../../lib/server/profiles/maturity";
import { readProfile, readProfileHistory } from "../../lib/server/profiles/read";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as sessionRoute } from "../../app/api/auth/session/route";
import { GET as profileRoute } from "../../app/api/customers/[customerId]/profile/route";
import { GET as reviewRoute } from "../../app/api/customers/[customerId]/review/route";
import { GET as historyRoute } from "../../app/api/customers/[customerId]/records/[recordId]/history/route";
import { POST as commandRoute } from "../../app/api/customers/[customerId]/commands/route";

const customerId = DEMO_IDS.sharedCustomer;
const origin = "http://127.0.0.1:3000";
const scope = { params: Promise.resolve({ customerId }) };

async function httpIdentity(name: "panel" | "mcteer") {
  const password = name === "panel" ? process.env.PANEL_PASSWORD : process.env.TURAS_DEMO_PASSWORD;
  const response = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }) }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  const session = await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }));
  return { cookie, csrf: (await session.json() as { data: { csrfToken: string } }).data.csrfToken };
}

async function httpWrite(actor: { cookie: string; csrf: string }, payload: unknown) {
  return commandRoute(new Request(`${origin}/api/customers/${customerId}/commands`, {
    method: "POST", headers: { origin, cookie: actor.cookie, "x-csrf-token": actor.csrf,
      "content-type": "application/json" }, body: JSON.stringify(payload),
  }), scope);
}

describe("scoped maturity acceptance", () => {
  it("rejects evidence from another workload rather than promoting that state", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const webId = randomUUID(), commerceId = randomUUID();
          for (const [id, name] of [[webId, "Synthetic web"], [commerceId, "Synthetic commerce"]]) {
            await client.query(`INSERT INTO customer_workloads
              (id,workspace_id,customer_id,display_name) VALUES ($1,$2,$3,$4)`,
            [id, DEMO_IDS.workspace, customerId, name]);
          }
          const claim = await submitProfileCommand(admin, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId: webId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: "Synthetic web maturity evidence", sourceType: "manual" },
          }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [claim.revisionId]);
          await submitProfileCommand(admin, customerId, { action: "accept_revision",
            requestKey: randomUUID(), revisionId: claim.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic support reviewed" }, client);
          const payload = { kind: "maturity_assessment", observationStart: "2026-08-01T00:00:00Z",
            observationEnd: "2026-09-01T00:00:00Z", assessor: "Synthetic assessor",
            rubricVersion: "customer-maturity-v1", rationale: "One dimension has support",
            nextCapability: "Validate another dimension", reviewAt: "2026-12-01T00:00:00Z",
            evidenceRevisionIds: [],
            dimensions: maturityDimensions.map(({ key }, index) => ({ key,
              state: index === 0 ? "Emerging" : "Unknown",
              rationale: index === 0 ? "Supported by synthetic web evidence" : "Missing evidence",
              nextCapability: "Gather current evidence",
              evidenceRevisionIds: index === 0 ? [claim.revisionId] : [],
            })),
          };
          await expect(submitProfileCommand(admin, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId: commerceId,
            requestedAudience: "delivery", dataCategory: "delivery_context", payload,
          }, client)).rejects.toMatchObject({ status: 422 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });

  it("keeps a pending correction out of current maturity and requires older-window acknowledgment", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const workloadId = randomUUID();
          await client.query(`INSERT INTO customer_workloads
            (id,workspace_id,customer_id,display_name) VALUES ($1,$2,$3,$4)`,
          [workloadId, DEMO_IDS.workspace, customerId, "Synthetic maturity correction"]);
          const claim = await submitProfileCommand(admin, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: `Synthetic maturity support ${randomUUID()}`,
              sourceType: "manual" },
          }, client) as { recordId: string; revisionId: string };
          const approve = async (candidate: { revisionId: string }, version: number,
            head: string | null, acknowledgeOlderObservation = false) => {
            const digest = await client.query<{ content_digest: string }>(
              "SELECT content_digest FROM profile_revisions WHERE id=$1", [candidate.revisionId]);
            return submitProfileCommand(admin, customerId, {
              action: "accept_revision", requestKey: randomUUID(), revisionId: candidate.revisionId,
              digest: digest.rows[0].content_digest, expectedRecordVersion: version,
              expectedAcceptedRevisionId: head, acknowledgeOlderObservation,
              rationale: "Synthetic maturity assessment reviewed",
            }, client);
          };
          await approve(claim, 0, null);
          const assessment = (end: string, rationale: string) => ({
            kind: "maturity_assessment", observationStart: "2026-07-01T00:00:00Z",
            observationEnd: end, assessor: "Synthetic assessor", rubricVersion: "customer-maturity-v1",
            rationale, nextCapability: "Measure the next outcome", reviewAt: "2026-12-01T00:00:00Z",
            evidenceRevisionIds: [],
            dimensions: maturityDimensions.map(({ key }, index) => ({ key,
              state: index === 0 ? "Emerging" : "Unknown",
              rationale: index === 0 ? "Supported by a reviewed claim" : "Missing evidence",
              nextCapability: "Gather current evidence",
              evidenceRevisionIds: index === 0 ? [claim.revisionId] : [],
            })),
          });
          const first = await submitProfileCommand(admin, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: assessment("2026-09-20T00:00:00Z", "Recent synthetic assessment"),
          }, client) as { recordId: string; revisionId: string };
          await approve(first, 0, null);
          const older = await submitProfileCommand(admin, customerId, {
            action: "propose_revision", requestKey: randomUUID(), recordId: first.recordId,
            expectedRecordVersion: 1, expectedAcceptedRevisionId: first.revisionId,
            workloadId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: assessment("2026-09-10T00:00:00Z", "Older synthetic assessment"),
          }, client) as { recordId: string; revisionId: string };
          const pending = await readProfile(admin, customerId, client) as {
            acceptedFacts: { id: string }[] };
          expect(pending.acceptedFacts.map((fact) => fact.id)).toContain(first.revisionId);
          expect(pending.acceptedFacts.map((fact) => fact.id)).not.toContain(older.revisionId);
          await expect(approve(older, 1, first.revisionId)).rejects.toMatchObject({ status: 409 });
          await approve(older, 1, first.revisionId, true);
          const current = await readProfile(admin, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          expect(current.acceptedFacts.map((fact) => fact.id)).toContain(older.revisionId);
          await submitProfileCommand(admin, customerId, {
            action: "retract_revision", requestKey: randomUUID(), revisionId: claim.revisionId,
            expectedRecordVersion: 1, rationale: "Synthetic support withdrawn",
          }, client);
          const unsupported = await readProfile(admin, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          expect(unsupported.acceptedFacts.find((fact) => fact.id === older.revisionId)?.supportStatus)
            .toBe("unsupported");
          await submitProfileCommand(admin, customerId, {
            action: "retract_revision", requestKey: randomUUID(), revisionId: older.revisionId,
            expectedRecordVersion: 2, rationale: "Synthetic maturity withdrawn",
          }, client);
          const empty = await readProfile(admin, customerId, client) as {
            acceptedFacts: { id: string }[] };
          expect(empty.acceptedFacts.map((fact) => fact.id)).not.toContain(first.revisionId);
          expect(empty.acceptedFacts.map((fact) => fact.id)).not.toContain(older.revisionId);
          const history = await readProfileHistory(admin, customerId, first.recordId, {}, client);
          expect(history.items).toContainEqual(expect.objectContaining({ id: first.revisionId,
            reviewState: "superseded" }));
          expect(history.items).toContainEqual(expect.objectContaining({ id: older.revisionId,
            reviewState: "retracted" }));
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });
  it("keeps an HTTP assessment Pending until review and exposes accepted history", async () => {
    const testDatabaseUrl = requireTestDatabaseUrl();
    const workloadId = randomUUID();
    await withTestDatabase((client) => client.query(`INSERT INTO customer_workloads
      (id,workspace_id,customer_id,display_name) VALUES ($1,$2,$3,$4)`,
    [workloadId, DEMO_IDS.workspace, customerId, "Synthetic HTTP maturity"]));
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    const contributor = await httpIdentity("panel");
    const admin = await httpIdentity("mcteer");
    const support = await httpWrite(contributor, { action: "propose_record", requestKey: randomUUID(), workloadId,
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: `Synthetic HTTP maturity ${randomUUID()}`, sourceType: "manual" } });
    expect(support.status).toBe(201);
    const supportId = (await support.json() as { data: { revisionId: string } }).data.revisionId;
    const accept = async (revisionId: string, version: number, head: string | null) => {
      const queue = await reviewRoute(new Request(`${origin}/api/customers/${customerId}/review`,
        { headers: { cookie: admin.cookie } }), scope);
      const candidate = (await queue.json() as { data: { pending: { id: string;
        contentDigest: string }[] } }).data.pending.find((item) => item.id === revisionId)!;
      return httpWrite(admin, { action: "accept_revision", requestKey: randomUUID(), revisionId,
        digest: candidate.contentDigest, expectedRecordVersion: version,
        expectedAcceptedRevisionId: head, rationale: "Synthetic HTTP maturity reviewed" });
    };
    expect((await accept(supportId, 0, null)).status).toBe(200);
    const proposal = await httpWrite(contributor, { action: "propose_record", requestKey: randomUUID(), workloadId,
      requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "maturity_assessment", observationStart: "2026-08-01T00:00:00Z",
        observationEnd: "2026-09-01T00:00:00Z", assessor: "Synthetic HTTP assessor",
        rubricVersion: "customer-maturity-v1", rationale: "One supported dimension",
        nextCapability: "Gather the next outcome", reviewAt: "2026-12-01T00:00:00Z",
        evidenceRevisionIds: [], dimensions: maturityDimensions.map(({ key }, index) => ({
          key, state: index === 0 ? "Emerging" : "Unknown",
          rationale: index === 0 ? "Reviewed synthetic support" : "Evidence is missing",
          nextCapability: "Gather evidence", evidenceRevisionIds: index === 0 ? [supportId] : [],
        })) } });
    expect(proposal.status).toBe(201);
    const ids = (await proposal.json() as { data: { recordId: string; revisionId: string } }).data;
    const before = await profileRoute(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: contributor.cookie } }), scope);
    expect((await before.json() as { data: { acceptedFacts: { id: string }[] } }).data.acceptedFacts
      .map((fact) => fact.id)).not.toContain(ids.revisionId);
    expect((await accept(ids.revisionId, 0, null)).status).toBe(200);
    const after = await profileRoute(new Request(`${origin}/api/customers/${customerId}/profile`,
      { headers: { cookie: contributor.cookie } }), scope);
    expect((await after.json() as { data: { acceptedFacts: { id: string }[] } }).data.acceptedFacts
      .map((fact) => fact.id)).toContain(ids.revisionId);
    const history = await historyRoute(new Request(`${origin}/api/customers/${customerId}/records/${ids.recordId}/history`,
      { headers: { cookie: contributor.cookie } }), { params: Promise.resolve({ customerId, recordId: ids.recordId }) });
    expect((await history.json() as { data: { items: { id: string; reviewState: string }[] } })
      .data.items).toContainEqual(expect.objectContaining({ id: ids.revisionId, reviewState: "accepted" }));
    expect((await httpWrite(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: ids.revisionId, expectedRecordVersion: 1,
      rationale: "Synthetic HTTP assessment cleanup" })).status).toBe(200);
    expect((await httpWrite(admin, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: supportId, expectedRecordVersion: 1,
      rationale: "Synthetic HTTP support cleanup" })).status).toBe(200);
  });
});
