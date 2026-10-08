import type {PoolClient} from "pg";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import {getServerConfig} from "../config";
import type {ExpansionActor} from "./policy";
import type {ExpansionSource} from "./schema";
type OriginalKind="accepted_profile"|"approved_excerpt"|"verified_research"|"shared_knowledge";
export type ExpansionDependency={kind:ExpansionSource["kind"];revisionId:string;generation:number;contentDigest:string;engagementId?:string};
type DependencyIdentity=ExpansionDependency;
export async function dependencyUnion(db: PoolClient, actor: ExpansionActor, customerId: string,
  refs: readonly {kind:ExpansionSource["kind"];sourceRevisionId:string;generation:number;contentDigest:string;engagementId?:string}[]): Promise<DependencyIdentity[]> {
  const pending: DependencyIdentity[] = refs.map(ref => ({ kind: ref.kind, revisionId: ref.sourceRevisionId,
    generation: ref.generation, contentDigest: ref.contentDigest,
    ...("engagementId" in ref ? { engagementId: ref.engagementId } : {}) }));
  const seen = new Map<string, DependencyIdentity>();
  while (pending.length) {
    const next = pending.pop()!, key = `${next.kind}:${next.revisionId}`;
    if (seen.has(key)) {
      const previous=seen.get(key)!;
      if(previous.generation!==next.generation||previous.contentDigest!==next.contentDigest||previous.engagementId!==next.engagementId)
        throw new HttpFailure(409,"source_changed","Conflicting source identities; refresh evidence");
      continue;
    }
    seen.set(key, next);
    if (seen.size > 200) throw new HttpFailure(422, "scope_too_large", "Narrow the expansion evidence closure");
    if (next.kind === "execution_record") {
      const rows = (await db.query<{ source_kind: ExpansionSource["kind"]; source_revision_id: string; source_generation: string; content_digest: string }>(
        `SELECT source_kind,source_revision_id,source_generation,content_digest FROM execution_record_sources WHERE revision_id=$1
          AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
        [next.revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, next.engagementId])).rows;
      pending.push(...rows.map(row => ({ kind: row.source_kind, revisionId: row.source_revision_id,
        generation: Number(row.source_generation), contentDigest: row.content_digest, ...(['execution_record','milestone_baseline'].includes(row.source_kind)?{engagementId:next.engagementId}:{}) })));
    } else if (next.kind === "milestone_baseline") {
      const row = (await db.query<{ revision_id: string }>(`SELECT revision_id FROM milestone_baselines
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
      [next.revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, next.engagementId])).rows[0];
      if (!row) throw hiddenRecord();
      const dependencies = (await db.query<{ source_kind: OriginalKind; source_revision_id: string; source_generation: string; source_digest: string }>(
        `SELECT source_kind,source_revision_id,source_generation,source_digest FROM plan_source_dependencies WHERE revision_id=$1
          UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,
            source_revision_id,source_generation,source_digest FROM plan_private_dependencies WHERE revision_id=$1`, [row.revision_id])).rows;
      pending.push(...dependencies.map(dependency => ({ kind: dependency.source_kind, revisionId: dependency.source_revision_id,
        generation: Number(dependency.source_generation), contentDigest: dependency.source_digest })));
    } else if (next.kind === "shared_knowledge") {
      const dependencies = (await db.query<{ source_kind: OriginalKind | "published_shared"; source_revision_id: string; source_generation: string; source_digest: string }>(
        "SELECT source_kind,source_revision_id,source_generation,source_digest FROM knowledge_lineage WHERE revision_id=$1", [next.revisionId])).rows;
      pending.push(...dependencies.map(dependency => ({ kind: dependency.source_kind === "published_shared" ? "shared_knowledge" : dependency.source_kind,
        revisionId: dependency.source_revision_id, generation: Number(dependency.source_generation), contentDigest: dependency.source_digest })));
    }
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.revisionId.localeCompare(b.revisionId));
}
