import type { PoolClient } from 'pg';
import { getServerConfig } from '../config';
import { profilePayloadSchema } from '../../contracts/profile-payloads';
import type { readPublicInventoryReference } from './public-inventory-reference';

export const customerAdoptionVersion = 'customer-adoption-v1';

type Input = {
  workloads: readonly { id: string; displayName: string }[];
  acceptedFacts: readonly Record<string, unknown>[];
  publicInventory?: Awaited<ReturnType<typeof readPublicInventoryReference>>;
};

/** Only typed reviewed records and curated, lifecycle-checked public metadata.
 * A legacy product mention, source title or raw passage never proves adoption. */
export async function customerAdoptionEntries(db: PoolClient, workspaceId: string, customerId: string, profile: Input) {
  const facts = profile.acceptedFacts.filter(fact => fact.kind === 'product_use' &&
    fact.supportStatus === 'settled' && typeof fact.id === 'string');
  const stories = profile.publicInventory?.evidence ?? [];
  const manual = facts.map(fact => fact.id);
  const research = [...new Set(stories.flatMap(story => [story.sourceRevisionId, story.referenceSourceRevisionId]))];
  if (!manual.length && !research.length) return [];
  // Match retrieval's confirmed-conflict scope, including conflicts on the exact
  // original reference for a curated story rebound to a checked successor.
  const result = await db.query<{ kind: string; id: string }>(`SELECT DISTINCT target.kind,target.id
    FROM evidence_conflict_targets conflict CROSS JOIN LATERAL
      (VALUES (conflict.first_kind,conflict.first_revision_id),(conflict.second_kind,conflict.second_revision_id)) target(kind,id)
    WHERE conflict.environment_id=$1 AND conflict.state='confirmed'
      AND (conflict.scope='shared' OR (conflict.scope='customer' AND conflict.workspace_id=$2 AND conflict.customer_id=$3))
      AND ((target.kind='accepted_profile' AND target.id=ANY($4::uuid[]))
        OR (target.kind='verified_research' AND target.id=ANY($5::uuid[])))`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, workspaceId, customerId, manual, research]);
  const disputed = new Set(result.rows.map(row => `${row.kind}:${row.id}`));
  const workloads = new Map(profile.workloads.map(workload => [workload.id, workload.displayName]));
  const reviewed = facts.flatMap(fact => {
    if (typeof fact.id !== 'string' || disputed.has(`accepted_profile:${fact.id}`)) return [];
    const payload = profilePayloadSchema.safeParse(fact.payload);
    if (!payload.success || payload.data.kind !== 'product_use') return [];
    const workloadId = typeof fact.workloadId === 'string' ? fact.workloadId : null;
    if (workloadId && !workloads.has(workloadId)) return [];
    return [{ type: 'accepted_manual' as const, citationId: fact.id, name: payload.data.displayName,
      workload: workloadId ? workloads.get(workloadId)! : null, state: payload.data.state,
      observedAt: payload.data.observedAt }];
  });
  const attributed = stories.filter(story => ![story.sourceRevisionId, story.referenceSourceRevisionId]
    .some(id => disputed.has(`verified_research:${id}`))).flatMap(story => story.products.map(name => ({
    type: 'attributed_research' as const, citationId: story.sourceRevisionId, name, workload: story.scope,
    state: 'documented_public_signal' as const, publishedAt: story.publishedAt, lastCheckedAt: story.retrievalAt,
    url: story.url,
  })));
  return [...reviewed, ...attributed];
}
