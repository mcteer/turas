import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { verifyPlanSources, currentPlanSourceDigest, lockOriginalHeader } from "../plans/sources";
import { getServerConfig } from "../config";
import type { ExecutionActor } from "./policy";
import { executionDigest } from "./commands";

export { executionSourceSchema, executionSourcesSchema } from "./schema";
import { executionSourcesSchema, type ExecutionSource } from "./schema";
export type { ExecutionSource } from "./schema";
type Evidence = Extract<ExecutionSource, { locator: unknown }>;
type SourceKind = Evidence["kind"];
const changed = () => new HttpFailure(409, "source_changed", "Reviewed execution evidence changed");

/** Metadata-only discovery keeps the original lock union stable even when one
 * candidate's acceptance or purgeable payload has been withdrawn. Callers still
 * verify each candidate separately before releasing content. */
export async function lockExecutionOriginalSources(db:PoolClient,actor:ExecutionActor,customerId:string,
  engagementId:string,refs:readonly Pick<ExecutionSource,"kind"|"sourceRevisionId">[]) {
  const env=getServerConfig().TURAS_ENVIRONMENT_ID,seen=new Set<string>();
  const originals=new Map<string,{kind:SourceKind;id:string}>();
  const pending=[...refs];
  while(pending.length) {
    const ref=pending.pop()!,key=`${ref.kind}:${ref.sourceRevisionId}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(seen.size>200)throw new HttpFailure(422,"scope_too_large","Narrow the execution evidence closure");
    if(ref.kind==="execution_record") {
      const rows=(await db.query<{source_kind:ExecutionSource["kind"];source_revision_id:string}>(`SELECT source_kind,source_revision_id
        FROM execution_record_sources WHERE revision_id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
        [ref.sourceRevisionId,env,actor.workspaceId,customerId,engagementId])).rows;
      pending.push(...rows.map(r=>({kind:r.source_kind,sourceRevisionId:r.source_revision_id})));
    } else if(ref.kind==="milestone_baseline") {
      const baseline=(await db.query<{revision_id:string}>(`SELECT revision_id FROM milestone_baselines
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
        [ref.sourceRevisionId,env,actor.workspaceId,customerId,engagementId])).rows[0];
      if(!baseline)continue;
      const rows=(await db.query<{source_kind:SourceKind;source_revision_id:string}>(`SELECT source_kind,source_revision_id FROM plan_source_dependencies WHERE revision_id=$1
        UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,source_revision_id
        FROM plan_private_dependencies WHERE revision_id=$1`,[baseline.revision_id])).rows;
      pending.push(...rows.map(r=>({kind:r.source_kind,sourceRevisionId:r.source_revision_id})));
    } else originals.set(key,{kind:ref.kind,id:ref.sourceRevisionId});
  }
  for(const source of [...originals.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))) {
    try {await lockOriginalHeader(db,source.kind,source.id);}
    catch(error) {if(!(error instanceof HttpFailure)||error.status!==409)throw error;}
  }
}

/** Caller holds live actor/customer authority. Discover the bounded metadata
 * closure, lock the complete original-source union, then execution heads, and
 * recheck exact pointers before any accepted content can leave the transaction. */
export async function verifyExecutionSources(db: PoolClient, actor: ExecutionActor, customerId: string,
  engagementId: string, audience: "internal" | "delivery", refs: readonly ExecutionSource[], lock = false, lockExecutionSuffix = true): Promise<string> {
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const scope = (await db.query<{ workload_id: string | null; active_baseline_id: string }>(`SELECT workload_id,active_baseline_id
    FROM engagements WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4`,
    [engagementId,env,actor.workspaceId,customerId])).rows[0];
  if (!scope) throw hiddenRecord();
  const originals = new Map<string,{kind: SourceKind; id: string}>();
  const evidence: Evidence[] = [], baselines: Array<{ref:ExecutionSource; revisionId:string}> = [];
  const records: Array<{ref:ExecutionSource; recordId:string}> = [];
  let count = 0;
  const path = new Set<string>();
  async function discover(items: readonly ExecutionSource[]) {
    if ((count += items.length) > 200) throw new HttpFailure(422,"scope_too_large","Narrow the execution evidence closure");
    for (const ref of [...items].sort((a,b) => a.kind.localeCompare(b.kind) || a.sourceRevisionId.localeCompare(b.sourceRevisionId))) {
      const key = `${ref.kind}:${ref.sourceRevisionId}`;
      if (path.has(key)) throw changed();
      if ("locator" in ref) { evidence.push(ref); originals.set(key,{kind:ref.kind,id:ref.sourceRevisionId}); continue; }
      path.add(key);
      try {
        if (ref.kind === "milestone_baseline") {
          const row = (await db.query<{ revision_id:string; content_digest:string; baseline_number:string }>(`SELECT revision_id,content_digest,baseline_number
            FROM milestone_baselines WHERE id=$1 AND engagement_id=$2 AND environment_id=$3 AND workspace_id=$4 AND customer_id=$5`,
            [ref.sourceRevisionId,engagementId,env,actor.workspaceId,customerId])).rows[0];
          if (!row || scope.active_baseline_id !== ref.sourceRevisionId || row.content_digest !== ref.contentDigest || Number(row.baseline_number) !== ref.generation) throw changed();
          baselines.push({ref,revisionId:row.revision_id});
          const dependencies = (await db.query<{source_kind:SourceKind;source_revision_id:string}>(`SELECT source_kind,source_revision_id
            FROM plan_source_dependencies WHERE revision_id=$1 UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,
            source_revision_id FROM plan_private_dependencies WHERE revision_id=$1`,[row.revision_id])).rows;
          if ((count += dependencies.length) > 200) throw new HttpFailure(422,"scope_too_large","Narrow the execution evidence closure");
          for (const d of dependencies) {
            if (!["accepted_profile","approved_excerpt","verified_research","shared_knowledge"].includes(d.source_kind)) throw changed();
            originals.set(`${d.source_kind}:${d.source_revision_id}`,{kind:d.source_kind,id:d.source_revision_id});
          }
        } else {
          const row = (await db.query<{ record_id:string; content_digest:string; revision_number:string; content:{references?:unknown} }>(`SELECT v.record_id,v.content_digest,v.revision_number,p.content
            FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id JOIN execution_record_payloads p ON p.revision_id=v.id
            WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5
              AND r.accepted_revision_id=v.id AND (v.audience='delivery' OR $6='internal')`,
            [ref.sourceRevisionId,env,actor.workspaceId,customerId,engagementId,audience])).rows[0];
          if (!row || row.content_digest !== ref.contentDigest || Number(row.revision_number) !== ref.generation) throw changed();
          records.push({ref,recordId:row.record_id});
          await discover(executionSourcesSchema.parse(row.content.references ?? []));
        }
      } finally { path.delete(key); }
    }
  }
  await discover(refs);
  if (lock) for (const source of [...originals.values()].sort((a,b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)))
    await lockOriginalHeader(db,source.kind,source.id);
  await verifyPlanSources(db,actor,customerId,scope.workload_id,audience,evidence,false,true);
  for (const baseline of baselines) await currentPlanSourceDigest(db,actor,baseline.revisionId,customerId,scope.workload_id,audience,false,true);
  if (lock && lockExecutionSuffix) {
    await db.query("SELECT id FROM engagements WHERE id=$1 FOR UPDATE",[engagementId]);
    await db.query("SELECT id FROM execution_workspaces WHERE engagement_id=$1 FOR UPDATE",[engagementId]);
    for (const id of [...new Set(records.map(r => r.recordId))].sort()) await db.query("SELECT id FROM execution_records WHERE id=$1 FOR SHARE",[id]);
    for (const record of records) {
      const row = (await db.query("SELECT accepted_revision_id FROM execution_records WHERE id=$1",[record.recordId])).rows[0];
      if (row?.accepted_revision_id !== record.ref.sourceRevisionId) throw changed();
    }
    if (baselines.length && (await db.query("SELECT active_baseline_id FROM engagements WHERE id=$1",[engagementId])).rows[0]?.active_baseline_id !== scope.active_baseline_id) throw changed();
  }
  return executionDigest([...refs].sort((a,b) => a.kind.localeCompare(b.kind) || a.sourceRevisionId.localeCompare(b.sourceRevisionId)));
}

export async function executionRevisionEligible(db: PoolClient, actor: ExecutionActor, customerId: string,
  engagementId: string, revisionId: string, audience: "internal" | "delivery", lock = false): Promise<boolean> {
  const row = (await db.query<{ audience:"internal"|"delivery"; content:{references?:unknown} }>(`SELECT v.audience,p.content
    FROM execution_record_revisions v JOIN execution_record_payloads p ON p.revision_id=v.id
    WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5
      AND (v.audience='delivery' OR $6='internal')`,[revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,audience])).rows[0];
  if (!row) return false;
  try { await verifyExecutionSources(db,actor,customerId,engagementId,row.audience,executionSourcesSchema.parse(row.content.references ?? []),lock); return true; }
  catch (error) { if (error instanceof HttpFailure && [403,404,409].includes(error.status)) return false; throw error; }
}
