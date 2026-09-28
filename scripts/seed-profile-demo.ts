import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";
import { closeRuntimePool, query, withTransaction } from "../lib/server/db/client.ts";
import { getServerConfig } from "../lib/server/config.ts";
import { hashSessionToken, issueSession, revokeSession, type CurrentSession } from "../lib/server/auth/sessions.ts";
import { ingestVerifiedResearch } from "../lib/server/profiles/research.ts";
import { submitProfileCommand } from "../lib/server/profiles/service.ts";

const customerId = DEMO_IDS.deniedCustomer;
const fixtureKeys = {
  claimProposal: "00000000-0000-4000-8000-000000003301",
  claimReview: "00000000-0000-4000-8000-000000003302",
  productProposal: "00000000-0000-4000-8000-000000003303",
  productReview: "00000000-0000-4000-8000-000000003304",
  maturityProposal: "00000000-0000-4000-8000-000000003305",
  maturityReview: "00000000-0000-4000-8000-000000003306",
} as const;

async function ensureAccepted(actor: CurrentSession, key: { proposal: string; review: string },
  payload: Record<string, unknown>, evidenceRevisionIds: string[] = []): Promise<string> {
  const proposed = await submitProfileCommand(actor, customerId, { requestKey: key.proposal,
    action: "propose_record", payload, evidenceRevisionIds,
    requestedAudience: "delivery", dataCategory: "delivery_context" }) as {
    recordId: string; revisionId: string };
  const current = await query<{ version: string; current_accepted_revision_id: string | null }>(
    "SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1", [proposed.recordId]);
  const row = current.rows[0];
  if (!row) throw new Error("Synthetic profile root unavailable");
  if (row.current_accepted_revision_id) return row.current_accepted_revision_id;
  const digest = await query<{ content_digest: string }>(
    "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
  await submitProfileCommand(actor, customerId, { requestKey: key.review,
    action: "accept_revision", revisionId: proposed.revisionId,
    digest: digest.rows[0].content_digest, expectedRecordVersion: Number(row.version),
    expectedAcceptedRevisionId: null, rationale: "Reviewed synthetic demonstration fixture" });
  return proposed.revisionId;
}

async function main(): Promise<void> {
  const config = getServerConfig();
  if (!/^(local|test)-/.test(config.TURAS_ENVIRONMENT_ID)) {
    throw new Error("Synthetic profile seeding is limited to local or disposable test environments");
  }
  const marker = await query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  const customer = await query<{ synthetic: boolean }>(
    "SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2",
    [customerId, DEMO_IDS.workspace]);
  if (marker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 12 || !customer.rows[0]?.synthetic) {
    throw new Error("Synthetic customer or profile schema is unavailable");
  }
  const identity = { principalId: DEMO_IDS.mcteer,
    membershipId: DEMO_IDS.mcteerMembership, workspaceId: DEMO_IDS.workspace,
    kind: "internal" as const, role: "admin" as const,
    loginName: "mcteer", displayName: "mcteer" };
  const session = await issueSession(identity);
  const own = await query<{ id: string }>(
    "SELECT id FROM login_sessions WHERE token_hash=$1 AND principal_id=$2",
    [hashSessionToken(session.token), identity.principalId]);
  const sessionId = own.rows[0]?.id;
  if (!sessionId) throw new Error("Synthetic session unavailable");
  const actor: CurrentSession = { ...identity, sessionId, token: session.token,
    expiresAt: session.expiresAt };
  try {
    const source = await withTransaction((client) => ingestVerifiedResearch({
      workspaceId: DEMO_IDS.workspace, customerId,
      trustedIdentity: "synthetic-fixture-v1",
      location: "https://example.com/turas-synthetic-juniper-profile",
      title: "Synthetic public capability reference",
      passage: "A fictional platform documents deployment review checks and a published rollback procedure.",
      supportedClaim: "The fictional platform documents deployment review checks and rollback.",
      publicationAt: "2026-09-01T00:00:00Z", retrievalAt: "2026-09-27T00:00:00Z",
      rights: "Synthetic public fixture", audience: "delivery",
      qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
        reliabilityRationale: "Named synthetic public source",
        directnessRationale: "Exact retained passage",
        corroborationRationale: "One synthetic source",
        informationType: "product_capability", dateBasis: "publication" },
      checks: { identity: true, scope: true, integrity: true, content: true,
        rationale: "Synthetic source, scope, integrity and content verified",
        checkVersion: "research-check-v1" },
    }, client));
    const claimId = await ensureAccepted(actor,
      { proposal: fixtureKeys.claimProposal, review: fixtureKeys.claimReview },
      { kind: "claim", text: "Juniper's synthetic team has a documented deployment review workflow.",
        sourceType: "manual", evidenceRevisionIds: [source.sourceRevisionId] },
      [source.sourceRevisionId]);
    await ensureAccepted(actor,
      { proposal: fixtureKeys.productProposal, review: fixtureKeys.productReview },
      { kind: "product_use", productKey: "synthetic-deployment", displayName: "Synthetic deployment product",
        state: "actual", usageDescription: "Used for a fictional public web workload",
        observedAt: "2026-09-20T00:00:00Z", evidenceRevisionIds: [source.sourceRevisionId] },
      [source.sourceRevisionId]);
    const keys = ["outcome_ownership", "delivery_collaboration", "experience_adoption",
      "operational_trust", "platform_organization", "innovation_ai"];
    await ensureAccepted(actor,
      { proposal: fixtureKeys.maturityProposal, review: fixtureKeys.maturityReview },
      { kind: "maturity_assessment", observationStart: "2026-09-01T00:00:00Z",
        observationEnd: "2026-09-20T00:00:00Z", assessor: "Synthetic review team",
        rubricVersion: "customer-maturity-v1", rationale: "Two dimensions have cited synthetic support; four remain Unknown.",
        dimensions: keys.map((key, index) => ({ key,
          state: index < 2 ? "Emerging" : "Unknown",
          rationale: index < 2 ? "Early documented practice, without measured consistency" :
            "No reviewed evidence for this dimension",
          evidenceRevisionIds: index < 2 ? [claimId] : [],
          nextCapability: index < 2 ? "Measure practice consistency" : "Collect scoped evidence" })),
        nextCapability: "Validate the remaining dimensions with the customer",
        reviewAt: "2026-12-01T00:00:00Z", evidenceRevisionIds: [claimId] },
      [claimId]);
    console.log("Synthetic Juniper profile fixture is ready");
  } finally { await revokeSession(sessionId); }
}

main().catch((error: unknown) => {
  const databaseError = error as { message?: string; code?: string; routine?: string; where?: string };
  console.error(databaseError.message ?? "Synthetic profile seed failed",
    databaseError.code ?? "", databaseError.routine ?? "", databaseError.where ?? "",
    error instanceof Error ? error.stack?.split("\n").slice(1, 4).join("\n") : "");
  process.exitCode = 1;
}).finally(() => closeRuntimePool());
