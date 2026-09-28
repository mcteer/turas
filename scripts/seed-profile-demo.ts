import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";
import { closeRuntimePool, query, withTransaction } from "../lib/server/db/client.ts";
import { getServerConfig } from "../lib/server/config.ts";
import { hashSessionToken, issueSession, revokeSession, type CurrentSession } from "../lib/server/auth/sessions.ts";
import { ingestVerifiedResearch } from "../lib/server/profiles/research.ts";
import { submitProfileCommand as submitDirect } from "../lib/server/profiles/service.ts";
import { HttpFailure } from "../lib/contracts/http.ts";

async function submitProfileCommand(actor: CurrentSession, targetCustomerId: string,
  command: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await submitDirect(actor, targetCustomerId, command); }
    catch (error) {
      if (!(error instanceof HttpFailure) || error.status !== 429 || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, (error.retryAfterSeconds ?? 60) * 1_000 + 250));
    }
  }
  throw new Error("Synthetic fixture request limit did not recover");
}

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
  payload: Record<string, unknown>, evidenceRevisionIds: string[] = [],
  workloadId?: string): Promise<{ recordId: string; revisionId: string }> {
  const proposed = await submitProfileCommand(actor, customerId, { requestKey: key.proposal,
    action: "propose_record", payload, evidenceRevisionIds, workloadId,
    requestedAudience: "delivery", dataCategory: "delivery_context" }) as {
    recordId: string; revisionId: string };
  const current = await query<{ version: string; current_accepted_revision_id: string | null }>(
    "SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1", [proposed.recordId]);
  const row = current.rows[0];
  if (!row) throw new Error("Synthetic profile root unavailable");
  if (row.current_accepted_revision_id) return {
    recordId: proposed.recordId, revisionId: row.current_accepted_revision_id };
  const digest = await query<{ content_digest: string }>(
    "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
  await submitProfileCommand(actor, customerId, { requestKey: key.review,
    action: "accept_revision", revisionId: proposed.revisionId,
    digest: digest.rows[0].content_digest, expectedRecordVersion: Number(row.version),
    expectedAcceptedRevisionId: null, rationale: "Reviewed synthetic demonstration fixture" });
  return proposed;
}

function walkthroughKey(index: number): { proposal: string; review: string } {
  const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
  return { proposal: id(3400 + index * 2), review: id(3401 + index * 2) };
}

async function ensureWorkload(actor: CurrentSession, index: number, name: string): Promise<string> {
  const key = walkthroughKey(index);
  const proposed = await submitProfileCommand(actor, customerId, {
    action: "propose_workload", requestKey: key.proposal,
    payload: { kind: "workload_details", name, purpose: `Synthetic ${name} delivery workload` },
  }) as { workloadId: string; recordId: string; revisionId: string };
  const current = await query<{ version: string; current_accepted_revision_id: string | null }>(
    "SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1", [proposed.recordId]);
  const row = current.rows[0];
  if (!row) throw new Error("Synthetic workload root unavailable");
  if (!row.current_accepted_revision_id) {
    const digest = await query<{ content_digest: string }>(
      "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
    await submitProfileCommand(actor, customerId, { requestKey: key.review,
      action: "accept_revision", revisionId: proposed.revisionId,
      digest: digest.rows[0].content_digest, expectedRecordVersion: Number(row.version),
      expectedAcceptedRevisionId: null, rationale: "Reviewed synthetic walkthrough workload" });
  }
  return proposed.workloadId;
}

async function seedWalkthrough(actor: CurrentSession, sourceRevisionId: string): Promise<void> {
  const web = await ensureWorkload(actor, 0, "Public web");
  const commerce = await ensureWorkload(actor, 1, "Commerce checkout");
  await ensureAccepted(actor, walkthroughKey(2), {
    kind: "product_use", productKey: "synthetic-deployment", displayName: "Synthetic deployment product",
    state: "actual", usageDescription: "Public web releases use a reviewed deployment path",
    observedAt: "2026-09-20T00:00:00Z", evidenceRevisionIds: [sourceRevisionId],
  }, [sourceRevisionId], web);
  await ensureAccepted(actor, walkthroughKey(3), {
    kind: "product_use", productKey: "synthetic-deployment", displayName: "Synthetic deployment product",
    state: "evaluating", usageDescription: "Commerce checkout is evaluating the deployment path",
    observedAt: "2026-09-20T00:00:00Z", evidenceRevisionIds: [sourceRevisionId],
  }, [sourceRevisionId], commerce);
  const risk = await ensureAccepted(actor, walkthroughKey(4), {
    kind: "risk", category: "Release coordination", description: "Checkout rollback ownership is unresolved",
    owner: "Synthetic delivery lead", likelihood: 4, impact: 4, severity: "high",
    severityRationale: "A failed checkout release could interrupt the review milestone",
    mitigation: "Agree a rollback owner and rehearse the checkout release", status: "open",
    observedAt: "2026-09-20T00:00:00Z", reviewAt: "2026-10-15T00:00:00Z",
  }, [], commerce);
  await ensureAccepted(actor, walkthroughKey(5), {
    kind: "next_review", subject: "Checkout rollback ownership", recordReferenceId: risk.recordId,
    owner: "Synthetic delivery lead", dueAt: "2026-10-15T00:00:00Z",
    action: "Confirm rollback owner and record rehearsal outcome",
  }, [], commerce);
  const claimTexts = [
    "Checkout rollback rehearsal is complete.",
    "Checkout rollback rehearsal has not been completed.",
    "Public web release checklist has an assigned owner.",
    "Public web release review occurs before promotion.",
    "Commerce checkout uses a separate release approval step.",
    "Commerce checkout has a documented test environment.",
    "The synthetic team records deployment decisions.",
    "The synthetic team tracks release follow-up actions.",
    "The public web team shares a deployment checklist.",
    "The checkout team has requested rollback training.",
    "A delivery contact attends weekly release reviews.",
    "The synthetic team keeps an incident follow-up list.",
    "Checkout release ownership is under discussion.",
    "The public web workload has a named technical owner.",
    "The checkout workload has a named technical owner.",
    "The next release review includes rollback readiness.",
  ];
  const claims = [];
  for (const [offset, text] of claimTexts.entries()) {
    claims.push(await ensureAccepted(actor, walkthroughKey(6 + offset), {
      kind: "claim", text, sourceType: "manual",
    }, [], offset < 2 ? commerce : offset % 2 === 0 ? web : commerce));
  }
  const flag = await submitProfileCommand(actor, customerId, {
    action: "flag_conflict", requestKey: walkthroughKey(22).proposal,
    firstRevisionId: claims[0].revisionId, secondRevisionId: claims[1].revisionId,
    reason: "Synthetic contradictory rehearsal status for review training",
  }) as { conflictId: string; version: number; state: string };
  if (flag.state === "flagged") await submitProfileCommand(actor, customerId, {
    action: "confirm_conflict", requestKey: walkthroughKey(22).review,
    conflictId: flag.conflictId, expectedVersion: flag.version,
    rationale: "Confirmed synthetic contradiction; verify with delivery owner",
  });
  await submitProfileCommand(actor, customerId, {
    action: "propose_record", requestKey: walkthroughKey(23).proposal,
    requestedAudience: "delivery", dataCategory: "delivery_context", workloadId: commerce,
    payload: { kind: "claim", text: "Checkout rollback owner has agreed to the rehearsal plan.",
      sourceType: "manual" },
  });
  const count = await query<{ count: number }>(`SELECT count(*)::int AS count FROM profile_records
    WHERE customer_id=$1 AND current_accepted_revision_id IS NOT NULL`, [customerId]);
  if (count.rows[0]?.count < 25) throw new Error("Walkthrough fixture has fewer than 25 accepted records");
  console.log(JSON.stringify({ customerId, acceptedRecords: count.rows[0].count,
    workloadIds: [web, commerce], riskRecordId: risk.recordId,
    conflictRevisionIds: [claims[0].revisionId, claims[1].revisionId],
    sourceRevisionId, reviewAction: "Confirm rollback owner and record rehearsal outcome" }));
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
    const claim = await ensureAccepted(actor,
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
          evidenceRevisionIds: index < 2 ? [claim.revisionId] : [],
          nextCapability: index < 2 ? "Measure practice consistency" : "Collect scoped evidence" })),
        nextCapability: "Validate the remaining dimensions with the customer",
        reviewAt: "2026-12-01T00:00:00Z", evidenceRevisionIds: [claim.revisionId] },
      [claim.revisionId]);
    if (process.argv.includes("--walkthrough")) await seedWalkthrough(actor, source.sourceRevisionId);
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
