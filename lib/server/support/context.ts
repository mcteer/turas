import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { supportContextCharge } from "../../support/advice";
import { getServerConfig } from "../config";
import type { SupportActor } from "./policy";
import { lockSupportActor } from "./policy";
import { supportDigest } from "./commands";
import { supportScope } from "./repository";
import { supportRevisionSources } from "./repository";
import { projectSupportReadiness, supportRevisionViews } from "./projection";
import { supportWorkspaceMetadata } from "./metadata";
import { dependencyUnion, supportSelectedEngagements, verifySupportSources } from "./sources";
import type { SupportSource } from "./schema";

export type SupportAdviceScope = { bindingId: string; conversationId: string; ownerMembershipId: string;
  customerId: string; workloadId: string | null; audience: "internal" | "delivery"; selectedEngagementIds: string[] };

/** Accepted-only capture. Callers cannot accidentally serialize own pending
 * proposals or unrelated engagements into a model context. */
export async function captureSupportAdviceContext(db: PoolClient, actor: SupportActor, scope: SupportAdviceScope,
  refs: readonly SupportSource[], release = false) {
  await lockSupportActor(db, actor, scope.customerId, release ? "read" : "advice", scope.audience);
  const sourceState = await verifySupportSources(db, actor, scope.customerId, scope.workloadId, scope.audience,
    scope.selectedEngagementIds, refs, true);
  const support = await supportScope(db, actor, scope.customerId, scope.workloadId);
  const readiness = await projectSupportReadiness(db, actor, scope.customerId, scope.workloadId, scope.audience);
  const metadata = await supportWorkspaceMetadata(db, actor, scope.customerId, scope.workloadId, scope.audience);
  const rows = support ? (await db.query(`SELECT id,accepted_revision_id FROM support_records
    WHERE scope_id=$1 AND audience=$2 AND kind='action' AND accepted_revision_id IS NOT NULL ORDER BY created_at,id LIMIT 201`,
  [support.id, scope.audience])).rows : [];
  if (rows.length > 200) throw new HttpFailure(422, "scope_too_large", "Narrow the support advice workload");
  const revisions = await supportRevisionViews(db, actor, scope.customerId, scope.workloadId,
    scope.audience, rows.map(row => row.accepted_revision_id));
  const actions = rows.map(row => ({ recordId: row.id, revision: revisions.get(row.accepted_revision_id)! }));
  const allRefs = new Map<string, SupportSource>();
  for (const ref of refs) allRefs.set(`${ref.kind}:${ref.sourceRevisionId}`, ref);
  for (const revisionId of [readiness.assessment?.revisionId, ...rows.map(row => row.accepted_revision_id)].filter(Boolean))
    for (const ref of await supportRevisionSources(db, revisionId)) allRefs.set(`${ref.kind}:${ref.sourceRevisionId}`, ref);
  if (allRefs.size > 200) throw new HttpFailure(422, "scope_too_large", "Narrow support advice dependencies");
  // Bound the union across every accepted record, including private original
  // lineage, rather than bounding each direct selection independently.
  const dependencies = await dependencyUnion(db, actor, scope.customerId, [...allRefs.values()]);
  const profile = (await db.query(`SELECT internal_generation,delivery_generation FROM customer_profile_state
    WHERE workspace_id=$1 AND customer_id=$2`, [actor.workspaceId, scope.customerId])).rows[0];
  const publications = (await db.query(`SELECT revision_id,head_generation FROM knowledge_publications
    WHERE environment_id=$1 ORDER BY revision_id`, [getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
  const engagements = await supportSelectedEngagements(db, actor, scope.customerId, scope.workloadId,
    scope.selectedEngagementIds, false, scope.audience);
  const fence = { sourceState, scopeGeneration: support?.generation ?? 0,
    profileGeneration: scope.audience === "delivery" ? profile?.delivery_generation : profile?.internal_generation,
    sharedGeneration: supportDigest(publications), acceptedHeads: rows.map(row => [row.id, row.accepted_revision_id]),
    assessmentHead: readiness.assessment?.revisionId ?? null,
    // Head identities can stay unchanged when an original source becomes
    // ineligible before fanout runs. Fence the qualified projections too, so
    // retained prose can never outlive its synchronous eligibility checks.
    eligibleContextDigest: supportDigest({ assessment: readiness.assessment, actions, maturity: metadata.maturity }) };
  const snapshot = { contractVersion: "support-advice-v1", customer: metadata.customer,
    workloadId: scope.workloadId, audience: scope.audience, readiness: readiness.effectiveReadiness,
    assessment: readiness.assessment, maturity: metadata.maturity, actions,
    engagements: engagements.map(row => ({ id: row.id, baselineId: row.active_baseline_id, executionGeneration: row.execution_generation })),
    unknowns: { externalAcknowledgement: "unknown", externalResolution: "unknown", entitlement: "unknown", responseGuarantee: "unknown" } };
  return { snapshot, fence, digest: supportDigest(fence), bytes: supportContextCharge(snapshot), dependencies };
}
