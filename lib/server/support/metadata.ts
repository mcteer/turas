import type { PoolClient } from "pg";
import type { SupportActor } from "./policy";
import { getServerConfig } from "../config";
import { unsupportedProfileRevisionIds } from "../profiles/eligibility";

/** Caller holds live customer authority. Restrict audience in SQL before reading
 * context; never expose private support lineage in a delivery representation. */
export async function supportWorkspaceMetadata(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: "internal" | "delivery") {
  const metadata = (await db.query<{
    display_name: string; synthetic: boolean;
    workloads: Array<{ id: string; display_name: string }>;
    engagements: Array<{ id: string; workload_id: string | null }>;
    owners: Array<{ id: string; display_name: string }>;
    maturity: Array<{ id: string; payload: { observationEnd: string; reviewAt: string; rubricVersion: string;
      dimensions: Array<{ key: string; state: string; level?: number; rationale: string }> } }>;
  }>(`SELECT c.display_name,c.synthetic,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'display_name',w.display_name)
      ORDER BY w.display_name,w.id) FROM customer_workloads w
    WHERE w.customer_id=$3 AND w.workspace_id=$2 AND w.lifecycle='active' AND ($4='internal' OR EXISTS(
      SELECT 1 FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
      WHERE r.workload_id=w.id AND r.kind='workload_details' AND v.audience='delivery' AND v.data_category='delivery_context'))
    ),'[]'::jsonb) AS workloads,
    COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM (SELECT id,workload_id,created_at FROM engagements
    WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND ($4='internal' OR audience='delivery')
      AND ($5::uuid IS NULL OR workload_id=$5) ORDER BY created_at,id LIMIT 101) e),'[]'::jsonb) AS engagements,
    COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.display_name,o.id) FROM (SELECT m.id,p.display_name
    FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE $6 AND m.workspace_id=$2 AND m.active AND p.active
      AND (m.kind='internal' OR EXISTS(SELECT 1 FROM customer_grants g JOIN partner_organizations o ON o.id=m.partner_org_id AND o.active
        WHERE g.membership_id=m.id AND g.customer_id=$3 AND g.state='active')) ORDER BY p.display_name,m.id LIMIT 101) o),'[]'::jsonb) AS owners,
    COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM (SELECT v.id,v.payload,v.created_at
    FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
    WHERE r.customer_id=$3 AND r.workspace_id=$2 AND r.kind='maturity_assessment'
      AND ($4='internal' OR (v.audience='delivery' AND v.data_category='delivery_context'))
      AND r.workload_id IS NOT DISTINCT FROM $5::uuid ORDER BY v.created_at DESC,v.id LIMIT 20) a),'[]'::jsonb) AS maturity
    FROM customer_references c WHERE c.id=$3 AND c.workspace_id=$2`,
  [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, audience, workloadId, actor.kind === "internal"])).rows[0];
  const { engagements, owners, maturity, workloads } = metadata;
  const unsupported = await unsupportedProfileRevisionIds(db, maturity.map(row => row.id), true);
  return { customer: { id: customerId, displayName: metadata.display_name, synthetic: metadata.synthetic },
    workloads: workloads.map(row => ({ id: row.id, displayName: row.display_name })),
    engagements: engagements.slice(0, 100).map(row => ({ id: row.id, workloadId: row.workload_id })),
    engagementSelectionIncomplete: engagements.length > 100,
    owners: owners.slice(0, 100).map(row => ({ membershipId: row.id, displayName: row.display_name })),
    ownerSelectionIncomplete: owners.length > 100,
    maturity: maturity.filter(row => !unsupported.has(row.id)).map(row => ({ revisionId: row.id,
      observationEnd: row.payload.observationEnd, reviewAt: row.payload.reviewAt, rubricVersion: row.payload.rubricVersion,
      dimensions: row.payload.dimensions.map(dimension => ({ key: dimension.key, state: dimension.state,
        ...(dimension.level === undefined ? {} : { level: dimension.level }), rationale: dimension.rationale })) })) };
}
