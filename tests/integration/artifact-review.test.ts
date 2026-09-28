import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { publishArtifactRun } from "../../lib/server/artifacts/jobs";
import { submitArtifactProposal } from "../../lib/server/artifacts/proposals";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { listReviewQueue, readProfile } from "../../lib/server/profiles/read";
import { createArtifactReplacementIntent } from "../../lib/server/artifacts/replacements";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { readArtifactUploadIntent } from "../../lib/server/artifacts/upload";
import { retireArtifactVersion } from "../../lib/server/artifacts/lifecycle";

describe("artifact-backed profile review", () => {
  it("requires current exact source at approval and marks accepted history unsupported after withdrawal", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const owner = await createProfileTestSession(client, "panel");
          const reviewer = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          async function source(text: string) {
            const fixture = await createArtifactDatabaseFixture(client, owner,
              DEMO_IDS.sharedCustomer,new Date().toISOString().slice(0,10));
            const token = randomUUID();
            await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1", [fixture.versionId]);
            const lease = await client.query<{ deadline_at: Date }>(`UPDATE artifact_extraction_runs
              SET state='leased',attempt_token=$2,heartbeat_at=now(),lease_expires_at=now()+interval '30 seconds',
                started_at=now(),deadline_at=now()+interval '120 seconds'
              WHERE id=$1 RETURNING deadline_at`, [fixture.runId,token]);
            const claim = { runId: fixture.runId, versionId: fixture.versionId, attemptToken: token,
              lifecycleGeneration: 1, originalDigest: fixture.originalDigest,
              parserImageDigest: fixture.imageDigest, scanPolicyVersion: "004-v1",
              parserPolicyVersion: "004-v1", deadlineAt: lease.rows[0].deadline_at.toISOString() };
            const scan = { contract: "artifact-intake-v1" as const, originalDigest: fixture.originalDigest,
              engineVersion: "synthetic", signatureVersion: "synthetic", scanPolicyVersion: "004-v1",
              scannedAt: new Date().toISOString(), result: "clean" as const };
            await publishArtifactRun(claim, { contract: "artifact-intake-v1", originalDigest: fixture.originalDigest,
              parserVersion: "004-v1", imageDigest: fixture.imageDigest,
              scanReceiptDigest: createHash("sha256").update(JSON.stringify(scan)).digest("hex"),
              format: "txt", status: "ready", coverage: { total: 1, visited: 1, omitted: [] },
              units: [{ id: randomUUID(), ordinal: 1, text,
                locator: { kind: "txt", lineStart: 1, lineEnd: 1 }, origin: "native", ocrConfidence: null }],
              warnings: [] }, scan, client);
            const unit = await client.query<{ id: string }>(
              "SELECT id FROM artifact_extraction_units WHERE run_id=$1", [fixture.runId]);
            const proposed = await submitArtifactProposal(owner, { selection: {
              versionId: fixture.versionId, runId: fixture.runId, lifecycleGeneration: 1,
              ranges: [{ unitId: unit.rows[0].id, start: 0, end: Array.from(text).length }],
              excerpt: text, excerptDigest: createHash("sha256").update(text).digest("hex"),
              audience: "delivery", dataCategory: "delivery_context",
            }, command: { action: "propose_record", requestKey: randomUUID(),
              requestedAudience: "delivery", dataCategory: "delivery_context",
              payload: { kind: "claim", text: `Reviewed ${text}`, sourceType: "manual" },
              qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
                reliabilityRationale: "Synthetic source", directnessRationale: "Exact passage",
                corroborationRationale: "One source", informationType: "product_capability",
                dateBasis: "publication" } } }, client);
            const digest = await client.query<{ content_digest: string }>(
              "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
            return { fixture, proposed, digest: digest.rows[0].content_digest };
          }
          const accepted = await source("Synthetic delivery evidence");
          const pendingQueue = await listReviewQueue(reviewer, DEMO_IDS.sharedCustomer, {}, client) as {
            pending: Array<{ id: string; artifactSource?: { versionId: string; excerpt: string } }> };
          expect(pendingQueue.pending.find((item) => item.id === accepted.proposed.revisionId)?.artifactSource)
            .toMatchObject({ versionId: accepted.fixture.versionId,
              excerpt: "Synthetic delivery evidence" });
          const replacement = await createArtifactReplacementIntent(reviewer,
            accepted.fixture.versionId,{ expectedGeneration: 1,idempotencyKey: randomUUID(),file: {
              name: "replacement.txt",expectedSizeBytes: 12,declaredType: "text/plain",
              sourcePublishedOn: null,sourceObservedOn: null,rightsNote: "Synthetic rights",
              audience: "delivery",dataCategory: "delivery_context" } },client);
          expect(replacement.intent.versionId).toBeNull();
          expect(JSON.stringify(replacement)).not.toContain(accepted.fixture.conversationId);
          const replacementScope = await client.query<{ owner_principal_id: string;
            initiating_principal_id: string }>(`SELECT owner_principal_id,initiating_principal_id
            FROM artifact_upload_intents WHERE id=$1`, [replacement.intent.id]);
          expect(replacementScope.rows[0]).toMatchObject({
            owner_principal_id: owner.principalId,initiating_principal_id: reviewer.principalId });
          expect((await readArtifactUploadIntent(reviewer,replacement.intent.id,client)).versionId).toBeNull();
          await expect(readArtifactUploadIntent(owner,replacement.intent.id,client))
            .rejects.toMatchObject({ status: 404 });
          const pendingPartner = await readProfile(partner, DEMO_IDS.sharedCustomer, client);
          expect(JSON.stringify(pendingPartner)).not.toContain("Synthetic delivery evidence");
          await submitProfileCommand(reviewer, DEMO_IDS.sharedCustomer, {
            action: "accept_revision", requestKey: randomUUID(), revisionId: accepted.proposed.revisionId,
            digest: accepted.digest, expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
            rationale: "Exact synthetic excerpt reviewed",
          }, client);
          const quality = await client.query<{ freshness: number; input: { evidenceAt: string | null } }>(`
            SELECT freshness,input FROM evidence_quality_snapshots WHERE profile_revision_id=$1`,
          [accepted.proposed.revisionId]);
          expect(quality.rows[0].freshness).toBe(4);
          expect(quality.rows[0].input.evidenceAt?.slice(0,10)).toBe(new Date().toISOString().slice(0,10));
          const before = await readProfile(partner, DEMO_IDS.sharedCustomer, client) as {
            acceptedFacts: Array<{ id: string; supportStatus: string;
              approvedArtifactExcerpt?: { excerpt: string; citation: { kind: string } } }> };
          expect(before.acceptedFacts.find((fact) => fact.id === accepted.proposed.revisionId)?.supportStatus)
            .toBe("settled");
          expect(before.acceptedFacts.find((fact) => fact.id === accepted.proposed.revisionId)?.approvedArtifactExcerpt)
            .toMatchObject({ excerpt: "Synthetic delivery evidence", citation: { kind: "txt" } });
          const eligible = await readEligibleContext(partner,DEMO_IDS.sharedCustomer,
            { query: "Synthetic delivery evidence" },client);
          expect(JSON.stringify(eligible)).toContain("Synthetic delivery evidence");
          expect(JSON.stringify(before)).not.toContain("synthetic.txt");
          await client.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer,partner.membershipId]);
          await expect(readProfile(partner,DEMO_IDS.sharedCustomer,client))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE customer_grants SET state='active' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer,partner.membershipId]);
          await client.query("UPDATE artifact_versions SET state='withdrawn',lifecycle_generation=2 WHERE id=$1",
            [accepted.fixture.versionId]);
          const after = await readProfile(partner, DEMO_IDS.sharedCustomer, client) as {
            acceptedFacts: Array<{ id: string; supportStatus: string }> };
          expect(after.acceptedFacts.find((fact) => fact.id === accepted.proposed.revisionId)?.supportStatus)
            .toBe("unsupported");
          const noLongerEligible = await readEligibleContext(partner,DEMO_IDS.sharedCustomer,
            { query: "Synthetic delivery evidence" },client);
          expect(JSON.stringify(noLongerEligible)).not.toContain("Synthetic delivery evidence");
          await retireArtifactVersion(reviewer,accepted.fixture.versionId,{
            action: "delete",expectedGeneration: 2,reason: "Synthetic submitted source deletion",
            idempotencyKey: randomUUID() },client);
          const retained = await readProfile(partner,DEMO_IDS.sharedCustomer,client) as {
            acceptedFacts: Array<{ id: string; supportStatus: string }> };
          expect(retained.acceptedFacts.find((fact) => fact.id === accepted.proposed.revisionId))
            .toMatchObject({ supportStatus: "unsupported" });
          const stale = await source("Synthetic pending evidence");
          await client.query("UPDATE artifact_versions SET state='withdrawn',lifecycle_generation=2 WHERE id=$1",
            [stale.fixture.versionId]);
          await expect(submitProfileCommand(reviewer, DEMO_IDS.sharedCustomer, {
            action: "accept_revision", requestKey: randomUUID(), revisionId: stale.proposed.revisionId,
            digest: stale.digest, expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
            rationale: "Should fail because source withdrew",
          }, client)).rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
