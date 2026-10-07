import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import type { SupportAction } from "../../contracts/support";
import type { SupportActor } from "./policy";
import type { SupportSource } from "./schema";
import { supportRevisionSources } from "./repository";

export async function validateSupportAction(db: PoolClient, actor: SupportActor, customerId: string,
  content: SupportAction, refs: readonly SupportSource[], recordId?: string,
  scope?: { workloadId: string | null; audience: "internal" | "delivery" }) {
  if (content.owner.kind === "membership") {
    const eligible = (await db.query(`SELECT 1 FROM memberships m JOIN principals p ON p.id=m.principal_id
      WHERE m.id=$1 AND m.workspace_id=$2 AND m.active AND p.active
        AND (m.kind='internal' OR EXISTS(SELECT 1 FROM customer_grants g
          JOIN partner_organizations o ON o.id=m.partner_org_id AND o.active
          WHERE g.membership_id=m.id AND g.customer_id=$3 AND g.state='active'))`,
    [content.owner.membershipId, actor.workspaceId, customerId])).rowCount;
    if (!eligible) throw new HttpFailure(422, "invalid_owner", "Choose a current eligible owner or an explicit unknown");
  } else if (content.owner.kind === "customer_role") {
    const sourceKey = content.owner.sourceKey;
    const ref = refs.find(ref => ref.id === sourceKey && ref.kind === "accepted_profile");
    const row = ref ? (await db.query(`SELECT v.payload FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1 AND r.customer_id=$2
        AND r.workspace_id=$3 AND r.current_accepted_revision_id=v.id`,
    [ref.sourceRevisionId, customerId, actor.workspaceId])).rows[0] : null;
    if (row?.payload?.kind !== "stakeholder" || row.payload.role.trim().toLowerCase() !== content.owner.label.trim().toLowerCase())
      throw new HttpFailure(422, "invalid_owner", "Customer roles require an accepted stakeholder source");
  }
  if (content.basedOnAssessmentRevisionId) {
    const row = (await db.query(`SELECT r.accepted_revision_id,r.audience,s.workload_id FROM support_revisions v
      JOIN support_records r ON r.id=v.record_id JOIN support_scopes s ON s.id=r.scope_id
      WHERE v.id=$1 AND r.customer_id=$2 AND r.workspace_id=$3 AND r.kind='assessment' AND r.accepted_revision_id=v.id
        AND NOT EXISTS(SELECT 1 FROM support_invalidations i WHERE i.revision_id=v.id)`,
    [content.basedOnAssessmentRevisionId, customerId, actor.workspaceId])).rows[0];
    if (!row || !scope || row.audience !== scope.audience || row.workload_id !== scope.workloadId)
      throw new HttpFailure(422, "invalid_assessment", "Choose a current accepted assessment in this scope and audience");
    const underlying = await supportRevisionSources(db, content.basedOnAssessmentRevisionId);
    if (underlying.some(source => !refs.some(ref => ref.kind === source.kind && ref.sourceRevisionId === source.sourceRevisionId &&
      ref.contentDigest === source.contentDigest && ref.generation === source.generation)))
      throw new HttpFailure(422, "invalid_assessment", "Retain the assessment's original evidence dependencies");
  }
  if (recordId && content.disposition === "open") {
    const previous = (await db.query(`SELECT p.content FROM support_records r
      JOIN support_payloads p ON p.revision_id=r.accepted_revision_id WHERE r.id=$1`, [recordId])).rows[0]?.content;
    if (["completed", "dismissed"].includes(previous?.disposition) && !content.dispositionRationale)
      throw new HttpFailure(422, "reopen_rationale_required", "Explain why the accepted action should reopen");
  }
}

export async function supportOwnerUnavailable(db: PoolClient, actor: SupportActor, customerId: string, content: SupportAction) {
  try { await validateSupportAction(db, actor, customerId, { ...content, basedOnAssessmentRevisionId: undefined }, []); return false; }
  catch (error) {
    if (error instanceof HttpFailure && error.code === "invalid_owner") return content.owner.kind === "membership";
    throw error;
  }
}

/** Read-only owner checks for already authorized, source-qualified projections.
 * This is scoped to the current transaction, not an eligibility cache. */
export async function unavailableSupportMembershipOwners(db: PoolClient, actor: SupportActor,
  customerId: string, membershipIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(membershipIds)];
  if (!ids.length) return new Set();
  const rows = (await db.query<{ id: string }>(`SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id
    WHERE m.id=ANY($1::uuid[]) AND m.workspace_id=$2 AND m.active AND p.active
      AND (m.kind='internal' OR EXISTS(SELECT 1 FROM customer_grants g
        JOIN partner_organizations o ON o.id=m.partner_org_id AND o.active
        WHERE g.membership_id=m.id AND g.customer_id=$3 AND g.state='active'))`,
  [ids, actor.workspaceId, customerId])).rows;
  const eligible = new Set(rows.map(row => row.id));
  return new Set(ids.filter(id => !eligible.has(id)));
}
