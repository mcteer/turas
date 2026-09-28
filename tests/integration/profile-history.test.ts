import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { DEMO_IDS } from "../fixtures/identities";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { readProfile, readProfileHistory } from "../../lib/server/profiles/read";

const customerId = DEMO_IDS.sharedCustomer;
type Candidate = { recordId: string; revisionId: string; workloadId?: string };

async function accept(client: PoolClient, admin: CurrentSession, candidate: Candidate) {
  const revision = await client.query<{ content_digest: string; version: string;
    current_accepted_revision_id: string | null }>(`SELECT v.content_digest,r.version,
      r.current_accepted_revision_id FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1`, [candidate.revisionId]);
  const row = revision.rows[0];
  return submitProfileCommand(admin, customerId, { action: "accept_revision",
    requestKey: randomUUID(), revisionId: candidate.revisionId,
    digest: row.content_digest, expectedRecordVersion: Number(row.version),
    expectedAcceptedRevisionId: row.current_accepted_revision_id,
    rationale: "Synthetic scoped history review" }, client);
}

describe("scoped canonical profile history", () => {
  it("keeps same-product workloads independent through rename, merge and retraction", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          const admin = await createProfileTestSession(client, "mcteer");
          const marker = randomUUID().slice(0, 8);
          const anchorsBefore = await client.query<{ id: string; revision: string }>(
            "SELECT id,revision FROM customer_grants WHERE customer_id=$1 ORDER BY id", [customerId]);
          const chatsBefore = await client.query<{ id: string }>(
            "SELECT id FROM conversations WHERE customer_id=$1 ORDER BY id", [customerId]);
          const createWorkload = async (name: string) => {
            const candidate = await submitProfileCommand(panel, customerId, {
              action: "propose_workload", requestKey: randomUUID(),
              payload: { kind: "workload_details", name, purpose: `Synthetic ${name} workload` },
            }, client) as Candidate;
            expect(candidate.workloadId).toBeTruthy();
            const pending = await readProfile(panel, customerId, client) as {
              workloads: { id: string; displayName: string }[] };
            expect(pending.workloads.find((item) => item.id === candidate.workloadId)?.displayName)
              .toBe("Pending workload");
            await accept(client, admin, candidate);
            return candidate;
          };
          const web = await createWorkload(`Web ${marker}`);
          const commerce = await createWorkload(`Commerce ${marker}`);
          const productKey = `shared-product-${marker}`;
          const product = async (workloadId: string, usage: string) => {
            const candidate = await submitProfileCommand(panel, customerId, {
              action: "propose_record", requestKey: randomUUID(), workloadId,
              requestedAudience: "delivery", dataCategory: "delivery_context",
              payload: { kind: "product_use", productKey, displayName: "Synthetic shared product",
                state: "actual", usageDescription: usage,
                observedAt: "2026-09-01T00:00:00Z" },
            }, client) as Candidate;
            await accept(client, admin, candidate);
            return candidate;
          };
          const webProduct = await product(web.workloadId!, `Web usage ${marker}`);
          const commerceProduct = await product(commerce.workloadId!, `Commerce usage ${marker}`);
          const riskPayload = { kind: "risk", category: `Delivery risk ${marker}`,
            description: "Synthetic deployment dependency", owner: "Synthetic delivery owner",
            likelihood: 3, impact: 4, severity: "high",
            severityRationale: "Deployment could block an agreed checkpoint",
            mitigation: "Review the dependency with the customer", status: "open",
            observedAt: "2026-09-01T00:00:00Z" };
          const risk = await submitProfileCommand(panel, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId: web.workloadId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: riskPayload,
          }, client) as Candidate;
          await accept(client, admin, risk);
          const riskCorrection = await submitProfileCommand(panel, customerId, {
            action: "propose_revision", requestKey: randomUUID(), workloadId: web.workloadId,
            recordId: risk.recordId, expectedRecordVersion: 1,
            expectedAcceptedRevisionId: risk.revisionId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { ...riskPayload, status: "mitigating", mitigation: "Synthetic dependency review scheduled" },
          }, client) as Candidate;
          const beforeRiskReview = await readProfile(panel, customerId, client, web.workloadId) as {
            acceptedFacts: { id: string; payload: { status?: string } }[] };
          expect(beforeRiskReview.acceptedFacts.find((fact) => fact.id === risk.revisionId)?.payload.status)
            .toBe("open");
          await accept(client, admin, riskCorrection);
          const riskHistory = await readProfileHistory(panel, customerId, risk.recordId, {}, client);
          expect(riskHistory.items).toContainEqual(expect.objectContaining({ id: risk.revisionId,
            reviewState: "superseded" }));
          expect(riskHistory.items).toContainEqual(expect.objectContaining({ id: riskCorrection.revisionId,
            reviewState: "accepted" }));
          expect(webProduct.recordId).not.toBe(commerceProduct.recordId);
          const webView = await readProfile(panel, customerId, client, web.workloadId) as {
            acceptedFacts: { id: string; workloadId: string; payload: { usageDescription?: string } }[] };
          expect(webView.acceptedFacts.some((fact) => fact.id === webProduct.revisionId &&
            fact.payload.usageDescription === `Web usage ${marker}`)).toBe(true);
          expect(webView.acceptedFacts.some((fact) => fact.id === commerceProduct.revisionId)).toBe(false);
          const olderObservation = await submitProfileCommand(panel, customerId, {
            action: "propose_record", requestKey: randomUUID(), workloadId: web.workloadId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "product_use", productKey, displayName: "Synthetic shared product",
              state: "planned", usageDescription: `Older observation ${marker}`,
              observedAt: "2026-08-01T00:00:00Z" },
          }, client) as Candidate;
          expect(olderObservation.recordId).toBe(webProduct.recordId);
          const stillWeb = await readProfile(panel, customerId, client, web.workloadId) as {
            acceptedFacts: { id: string }[] };
          expect(stillWeb.acceptedFacts.map((fact) => fact.id)).toContain(webProduct.revisionId);
          await accept(client, admin, olderObservation);
          const currentDespiteOlderDate = await readProfile(panel, customerId, client, web.workloadId) as {
            acceptedFacts: { id: string }[] };
          expect(currentDespiteOlderDate.acceptedFacts.map((fact) => fact.id))
            .toContain(olderObservation.revisionId);
          expect(currentDespiteOlderDate.acceptedFacts.map((fact) => fact.id))
            .not.toContain(webProduct.revisionId);
          await expect(submitProfileCommand(panel, customerId, {
            action: "propose_revision", requestKey: randomUUID(), recordId: web.recordId,
            workloadId: web.workloadId, expectedRecordVersion: 1,
            expectedAcceptedRevisionId: web.revisionId,
            requestedAudience: "internal", dataCategory: "other_internal",
            payload: { kind: "workload_details", name: `Invalid merge ${marker}`,
              purpose: "Invalid synthetic relation", mergeTargetId: randomUUID() },
          }, client)).rejects.toMatchObject({ status: 404 });
          const merge = await submitProfileCommand(panel, customerId, {
            action: "propose_revision", requestKey: randomUUID(), recordId: web.recordId,
            workloadId: web.workloadId, expectedRecordVersion: 1,
            expectedAcceptedRevisionId: web.revisionId,
            requestedAudience: "internal", dataCategory: "other_internal",
            payload: { kind: "workload_details", name: `Web renamed ${marker}`,
              purpose: "Synthetic renamed workload", mergeTargetId: commerce.workloadId },
          }, client) as Candidate;
          const beforeMerge = await readProfile(panel, customerId, client) as {
            workloads: { id: string; displayName: string; lifecycle: string }[] };
          expect(beforeMerge.workloads.find((item) => item.id === web.workloadId)?.displayName)
            .toBe(`Web ${marker}`);
          await accept(client, admin, merge);
          const afterMerge = await readProfile(panel, customerId, client, web.workloadId) as {
            workloads: { id: string; displayName: string; lifecycle: string }[];
            acceptedFacts: { id: string; workloadId: string }[] };
          expect(afterMerge.workloads.find((item) => item.id === web.workloadId)).toMatchObject({
            displayName: `Web renamed ${marker}`, lifecycle: "merged" });
          expect(afterMerge.acceptedFacts.map((fact) => fact.id)).toContain(olderObservation.revisionId);
          expect(afterMerge.acceptedFacts.map((fact) => fact.id)).not.toContain(commerceProduct.revisionId);
          expect((await client.query("SELECT id,revision FROM customer_grants WHERE customer_id=$1 ORDER BY id",
            [customerId])).rows).toEqual(anchorsBefore.rows);
          expect((await client.query("SELECT id FROM conversations WHERE customer_id=$1 ORDER BY id",
            [customerId])).rows).toEqual(chatsBefore.rows);
          await submitProfileCommand(admin, customerId, {
            action: "retract_revision", requestKey: randomUUID(), revisionId: olderObservation.revisionId,
            expectedRecordVersion: 2, rationale: "Synthetic scoped evidence withdrawn",
          }, client);
          const retractedView = await readProfile(panel, customerId, client, web.workloadId) as {
            acceptedFacts: { id: string }[] };
          expect(retractedView.acceptedFacts.map((fact) => fact.id)).not.toContain(olderObservation.revisionId);
          expect(retractedView.acceptedFacts.map((fact) => fact.id)).not.toContain(webProduct.revisionId);
          const commerceView = await readProfile(panel, customerId, client, commerce.workloadId) as {
            acceptedFacts: { id: string }[] };
          expect(commerceView.acceptedFacts.map((fact) => fact.id)).toContain(commerceProduct.revisionId);
          const history = await readProfileHistory(panel, customerId, webProduct.recordId, {}, client);
          expect(history.items).toContainEqual(expect.objectContaining({ id: olderObservation.revisionId,
            reviewState: "retracted" }));
          expect(history.items).toContainEqual(expect.objectContaining({ id: webProduct.revisionId,
            reviewState: "superseded" }));
          await submitProfileCommand(admin, customerId, { action: "retract_revision",
            requestKey: randomUUID(), revisionId: merge.revisionId,
            expectedRecordVersion: 2, rationale: "Synthetic workload identity withdrawn" }, client);
          const unnamedWorkload = await readProfile(panel, customerId, client) as {
            workloads: { id: string; displayName: string }[] };
          expect(unnamedWorkload.workloads.find((item) => item.id === web.workloadId)?.displayName)
            .toBe("Unknown workload");
          const customerDetails = await submitProfileCommand(panel, customerId, {
            action: "propose_record", requestKey: randomUUID(), requestedAudience: "internal",
            dataCategory: "other_internal",
            payload: { kind: "customer_details", displayName: `Cedar renamed ${marker}` },
          }, client) as Candidate;
          await accept(client, admin, customerDetails);
          expect((await client.query<{ display_name: string }>(
            "SELECT display_name FROM customer_references WHERE id=$1", [customerId])).rows[0].display_name)
            .toBe(`Cedar renamed ${marker}`);
          await submitProfileCommand(admin, customerId, { action: "retract_revision",
            requestKey: randomUUID(), revisionId: customerDetails.revisionId,
            expectedRecordVersion: 1, rationale: "Synthetic customer identity withdrawn" }, client);
          expect((await client.query<{ display_name: string }>(
            "SELECT display_name FROM customer_references WHERE id=$1", [customerId])).rows[0].display_name)
            .toBe("Unknown customer");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });
});
