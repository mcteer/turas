import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { staffingCreateDemandSchema, staffingReviseDemandSchema, staffingQualifyDemandSchema,
  staffingCancelDemandSchema, staffingDemandListSchema, type StaffingDemandInput } from "../../contracts/staffing-demands";
import { getServerConfig } from "../config";
import { lockPlanActor } from "../plans/policy";
import { readPlan } from "../plans/read";
import { parseStaffing, runStaffingCommand, staffingSha256, tryStaffingCommandReplay } from "./commands";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { withTransaction } from "../db/client";
import { staffingPageCursor, readStaffingPageCursor } from "./read";
import { resolveStaffingOverlap } from "./temporal";

type BaselineBinding = Pick<StaffingDemandInput, "customerId" | "workloadId" | "engagementId" | "planId" |
  "baselineId" | "planRevisionId" | "baselineDigest" | "workPackageKey">;
export type DemandHead = { id: string; customer_id: string; workload_id: string | null; engagement_id: string;
  current_revision_id: string; aggregate_version: string; state: "draft" | "qualified" | "fulfilled" | "cancelled" };
const changed = () => new HttpFailure(409, "baseline_changed", "Accepted baseline changed; reload");

/** Actor -> plan -> original 006 source headers -> engagement. Explicitly select
 * the baseline revision: a changed working draft never replaces its acceptance. */
export async function lockDemandBaseline(db: PoolClient, actor: StaffingActor, binding: BaselineBinding,
  options: { current: boolean; readable: boolean; identityOnly?: boolean; engagementLock?: "SHARE" | "UPDATE" }) {
  await lockPlanActor(db, actor, binding.customerId, false);
  const plan = (await db.query(`SELECT id,customer_id,workload_id,engagement_id FROM delivery_plans
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR SHARE`,
    [binding.planId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, binding.customerId])).rows[0];
  if (!plan || plan.workload_id !== binding.workloadId || plan.engagement_id !== binding.engagementId) throw hiddenRecord();
  // Identity-only cancellation never retrieves source or plan prose.
  const detail = options.identityOnly ? null : await readPlan(actor, binding.planId, binding.planRevisionId, db);
  const engagement = (await db.query(`SELECT id,plan_id,workload_id,active_baseline_id FROM engagements
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR ${options.engagementLock === "UPDATE" ? "UPDATE" : "SHARE"}`,
    [binding.engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, binding.customerId])).rows[0];
  const baseline = (await db.query(`SELECT id,plan_id,revision_id,content_digest FROM milestone_baselines
    WHERE id=$1 AND engagement_id=$2 AND environment_id=$3 AND workspace_id=$4 AND customer_id=$5`,
    [binding.baselineId, binding.engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, binding.customerId])).rows[0];
  if (!engagement || engagement.plan_id !== binding.planId || engagement.workload_id !== binding.workloadId || !baseline ||
    baseline.plan_id !== binding.planId || baseline.revision_id !== binding.planRevisionId || baseline.content_digest !== binding.baselineDigest) throw hiddenRecord();
  if (options.current && (engagement.active_baseline_id !== binding.baselineId || detail?.acceptedRevisionId !== binding.planRevisionId)) throw changed();
  if (!options.identityOnly) {
    if (!detail?.content || ["withheld", "purged"].includes(detail.contentAvailability)) {
      throw new HttpFailure(409, "source_changed", "Baseline evidence unavailable; reload");
    }
    if (detail.contentDigest !== binding.baselineDigest || detail.engagementId !== binding.engagementId ||
      (options.readable && (detail.contentAvailability !== "readable" || detail.reviewRequired))) throw changed();
    // Only after current source eligibility has been checked may work-package
    // payload be inspected. Baseline payloads themselves are immutable.
    const payload = (await db.query(`SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1 FOR SHARE`, [binding.baselineId])).rows[0];
    if (!payload || !Array.isArray(payload.content.workPackages) ||
      !payload.content.workPackages.some((work: { key?: unknown }) => work?.key === binding.workPackageKey)) throw hiddenRecord();
  }
  return { baselineId: baseline.id as string, current: engagement.active_baseline_id === binding.baselineId,
    reviewRequired: detail?.reviewRequired ?? true };
}
async function metadata(db: PoolClient, actor: StaffingActor, demandId: string) {
  const row = (await db.query(`SELECT d.id,d.customer_id,d.workload_id,d.engagement_id,d.current_revision_id,d.aggregate_version,d.state,
    r.plan_id,r.baseline_id,r.plan_revision_id,r.baseline_digest,r.work_package_key,r.content_digest
    FROM staffing_demands d JOIN staffing_demand_revisions r ON r.id=d.current_revision_id AND r.demand_id=d.id
    WHERE d.id=$1 AND d.environment_id=$2 AND d.workspace_id=$3`,
    [demandId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}
function bindingOf(row: Awaited<ReturnType<typeof metadata>>): BaselineBinding {
  return { customerId: row.customer_id, workloadId: row.workload_id, engagementId: row.engagement_id,
    planId: row.plan_id, baselineId: row.baseline_id, planRevisionId: row.plan_revision_id,
    baselineDigest: row.baseline_digest, workPackageKey: row.work_package_key };
}
/** Existing commitment cancellation can lock scoped identities after evidence
 * withdrawal. This deliberately never retrieves baseline or demand prose. */
export async function lockDemandIdentity(db: PoolClient, actor: StaffingActor, demandId: string) {
  const prior = await metadata(db, actor, demandId);
  await lockDemandBaseline(db, actor, bindingOf(prior), { current: false, readable: false, identityOnly: true });
  const head = await lockDemandHead(db, actor, demandId);
  if (head.current_revision_id !== prior.current_revision_id || head.aggregate_version !== prior.aggregate_version) {
    throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
  }
  return head;
}
export async function lockDemandHead(db: PoolClient, actor: StaffingActor, demandId: string,
  mode: "SHARE" | "UPDATE" = "SHARE"): Promise<DemandHead> {
  const row = (await db.query<DemandHead>(`SELECT id,customer_id,workload_id,engagement_id,current_revision_id,aggregate_version,state
    FROM staffing_demands WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR ${mode}`,
    [demandId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}
async function exactHead(db: PoolClient, head: DemandHead, expected: { revisionId: string; contentDigest: string; expectedAggregateVersion: number }) {
  const revision = (await db.query(`SELECT content_digest FROM staffing_demand_revisions WHERE id=$1 AND demand_id=$2`, [head.current_revision_id, head.id])).rows[0];
  if (head.current_revision_id !== expected.revisionId || Number(head.aggregate_version) !== expected.expectedAggregateVersion || revision?.content_digest !== expected.contentDigest) {
    throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
  }
}
async function activeSkills(db: PoolClient, actor: StaffingActor, demand: StaffingDemandInput) {
  const ids = [...demand.requiredSkills, ...demand.desiredSkills].map(s => s.skillId).sort();
  const rows = await db.query(`SELECT id,active FROM workforce_skills WHERE id=ANY($1::uuid[])
    AND environment_id=$2 AND workspace_id=$3 ORDER BY id FOR SHARE`, [ids, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
  if (rows.rowCount !== ids.length || rows.rows.some(row => !row.active)) throw new HttpFailure(409, "source_changed", "Demand skills unavailable; reload");
}
async function appendEvent(db: PoolClient, actor: StaffingActor, demandId: string, revisionId: string,
  version: number, digest: string, state: string, action: string, requestKey: string, rationale: string) {
  const id = randomUUID();
  await db.query(`INSERT INTO staffing_demand_events(id,environment_id,workspace_id,demand_id,revision_id,aggregate_version,
    content_digest,state,action,actor_membership_id,actor_session_id,request_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId,
    demandId, revisionId, version, digest, state, action, actor.membershipId, actor.sessionId, requestKey]);
  await db.query(`INSERT INTO staffing_demand_event_payloads(event_id,rationale) VALUES($1,$2)`, [id, rationale]);
}
async function appendDemand(db: PoolClient, actor: StaffingActor, demandId: string, version: number, demand: StaffingDemandInput, rationale: string) {
  const revisionId = randomUUID(), digest = staffingSha256(demand), env = getServerConfig().TURAS_ENVIRONMENT_ID;
  await db.query(`INSERT INTO staffing_demand_revisions(id,environment_id,workspace_id,demand_id,customer_id,engagement_id,
    baseline_id,plan_id,plan_revision_id,baseline_digest,work_package_key,revision_number,content_digest,actor_membership_id,
    from_date,to_date,billable,total_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [revisionId, env, actor.workspaceId, demandId, demand.customerId, demand.engagementId, demand.baselineId, demand.planId,
      demand.planRevisionId, demand.baselineDigest, demand.workPackageKey, version, digest, actor.membershipId,
      demand.fromDate, demand.toDate, demand.billable, demand.days.reduce((sum, day) => sum + day.requiredMinutes, 0)]);
  await db.query(`INSERT INTO staffing_demand_payloads(revision_id,content,rationale) VALUES($1,$2,$3)`, [revisionId, JSON.stringify(demand), rationale]);
  // Never reset or delete stable demand/day rows. Prior revisions' confirmed
  // allocations continue to consume the same ledger after edits/reductions.
  for (const day of [...demand.days].sort((a, b) => a.date.localeCompare(b.date))) {
    await db.query(`INSERT INTO staffing_demand_days(demand_id,service_date) VALUES($1,$2) ON CONFLICT DO NOTHING`, [demandId, day.date]);
  }
  await db.query(`UPDATE staffing_demands SET current_revision_id=$2,aggregate_version=$3,state='draft',updated_at=now() WHERE id=$1`, [demandId, revisionId, version]);
  return { demandId, revisionId, contentDigest: digest, aggregateVersion: version, state: "draft" };
}
export async function createDemand(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingCreateDemandSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "demand_create" }, { capability: "operational", customerId: input.demand.customerId }, async db => {
    await lockDemandBaseline(db, actor, input.demand, { current: false, readable: false });
    await activeSkills(db, actor, input.demand);
    const demandId = randomUUID();
    await db.query(`INSERT INTO staffing_demands(id,environment_id,workspace_id,customer_id,workload_id,engagement_id,created_by_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [demandId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.demand.customerId,
      input.demand.workloadId, input.demand.engagementId, actor.membershipId]);
    const result = await appendDemand(db, actor, demandId, 1, input.demand, input.rationale);
    await appendEvent(db, actor, demandId, result.revisionId, 1, result.contentDigest, "draft", "create", input.requestKey, input.rationale);
    return result;
  }, client);
}
export async function reviseDemand(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const demandId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingReviseDemandSchema, raw);
  return runStaffingCommand(actor, { ...input, demandId, action: "demand_revise" }, { capability: "operational", customerId: input.demand.customerId }, async db => {
    const prior = await metadata(db, actor, demandId);
    if (prior.customer_id !== input.demand.customerId || prior.workload_id !== input.demand.workloadId || prior.engagement_id !== input.demand.engagementId || prior.plan_id !== input.demand.planId) throw hiddenRecord();
    await lockDemandBaseline(db, actor, input.demand, { current: false, readable: false });
    const head = await lockDemandHead(db, actor, demandId, "UPDATE"); await exactHead(db, head, input);
    if (head.state === "cancelled") throw new HttpFailure(409, "version_conflict", "Cancelled demand cannot be revised");
    await activeSkills(db, actor, input.demand);
    const result = await appendDemand(db, actor, demandId, input.expectedAggregateVersion + 1, input.demand, input.rationale);
    await appendEvent(db, actor, demandId, result.revisionId, result.aggregateVersion, result.contentDigest, "draft", "revise", input.requestKey, input.rationale);
    return result;
  }, client);
}
export async function qualifyDemand(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const demandId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingQualifyDemandSchema, raw);
  if (!client) {
    const receipt = await tryStaffingCommandReplay(actor, { ...input, demandId, action: "demand_qualify" }, { capability: "operational" });
    if (receipt) return receipt;
  }
  // Standalone calls resolve timezone endpoints after releasing preflight locks.
  // Transaction callers remain supported for demands without zoned overlap.
  const prepared = !client ? await withTransaction(async db => {
    await lockStaffingActor(db, actor, "operational", { write: true });
    const prior = await metadata(db, actor, demandId);
    await lockDemandBaseline(db, actor, bindingOf(prior), { current: true, readable: true });
    await lockDemandHead(db, actor, demandId);
    if (prior.current_revision_id !== input.revisionId) throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
    const payload = (await db.query(`SELECT content FROM staffing_demand_payloads WHERE revision_id=$1 FOR SHARE`, [prior.current_revision_id])).rows[0];
    if (!payload) throw new HttpFailure(409, "source_changed", "Demand unavailable; reload");
    return parseStaffing(staffingCreateDemandSchema.shape.demand, payload.content);
  }) : null;
  const resolvedOverlapDigest = prepared?.overlap ? (resolveStaffingOverlap(prepared.overlap), staffingSha256(prepared.overlap)) : null;
  return runStaffingCommand(actor, { ...input, demandId, action: "demand_qualify" }, { capability: "operational" }, async db => {
    const prior = await metadata(db, actor, demandId);
    await lockDemandBaseline(db, actor, bindingOf(prior), { current: true, readable: true });
    const head = await lockDemandHead(db, actor, demandId, "UPDATE"); await exactHead(db, head, input);
    if (head.state !== "draft") throw new HttpFailure(409, "version_conflict", "Exact draft demand required");
    const payload = (await db.query(`SELECT content FROM staffing_demand_payloads WHERE revision_id=$1 FOR SHARE`, [head.current_revision_id])).rows[0];
    if (!payload) throw hiddenRecord();
    const demand = parseStaffing(staffingCreateDemandSchema.shape.demand, payload.content);
    if (demand.overlap && resolvedOverlapDigest !== staffingSha256(demand.overlap)) {
      throw new HttpFailure(503, "staffing_calendar_unavailable", "Zoned qualification requires standalone timezone validation");
    }
    await activeSkills(db, actor, demand);
    await db.query(`UPDATE staffing_demands SET state='qualified',aggregate_version=aggregate_version+1,updated_at=now() WHERE id=$1`, [demandId]);
    await appendEvent(db, actor, demandId, head.current_revision_id, input.expectedAggregateVersion + 1, input.contentDigest, "qualified", "qualify", input.requestKey, input.rationale);
    return { demandId, revisionId: head.current_revision_id, contentDigest: input.contentDigest, aggregateVersion: input.expectedAggregateVersion + 1, state: "qualified" };
  }, client);
}
export async function cancelDemand(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const demandId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingCancelDemandSchema, raw);
  return runStaffingCommand(actor, { ...input, demandId, action: "demand_cancel" }, { capability: "operational", allowDisabled: true }, async db => {
    const prior = await metadata(db, actor, demandId);
    await lockDemandBaseline(db, actor, bindingOf(prior), { current: false, readable: false, identityOnly: true });
    const head = await lockDemandHead(db, actor, demandId, "UPDATE"); await exactHead(db, head, input);
    if (head.state === "cancelled") throw new HttpFailure(409, "version_conflict", "Demand already cancelled");
    await db.query(`UPDATE staffing_demands SET state='cancelled',aggregate_version=aggregate_version+1,updated_at=now() WHERE id=$1`, [demandId]);
    await appendEvent(db, actor, demandId, head.current_revision_id, input.expectedAggregateVersion + 1, input.contentDigest, "cancelled", "cancel", input.requestKey, input.rationale);
    return { demandId, revisionId: head.current_revision_id, contentDigest: input.contentDigest, aggregateVersion: input.expectedAggregateVersion + 1, state: "cancelled" };
  }, client);
}

/** No demand prose is returned until the baseline's original sources have been
 * rechecked in this transaction. Withheld histories retain safe identities. */
export async function readDemand(actor: StaffingActor, rawId: unknown, client?: PoolClient, engagementLock: "SHARE" | "UPDATE" = "SHARE",
  deferHeadLock = false) {
  const demandId = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const prior = await metadata(db, actor, demandId);
    let baseline: Awaited<ReturnType<typeof lockDemandBaseline>> | null = null;
    try { baseline = await lockDemandBaseline(db, actor, bindingOf(prior), { current: false, readable: false, engagementLock }); }
    catch (error) {
      if (!(error instanceof HttpFailure) || ![404, 409].includes(error.status)) throw error;
    }
    // Native union composition may defer this row lock until all same-engagement
    // demand identities have been discovered. It must acquire/recheck that union
    // before releasing this transaction-local content or locking workforce rows.
    const head = deferHeadLock ? (await db.query<DemandHead>(`SELECT id,customer_id,workload_id,engagement_id,current_revision_id,aggregate_version,state
      FROM staffing_demands WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`,
      [demandId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0] : await lockDemandHead(db, actor, demandId);
    if (!head) throw hiddenRecord();
    if (head.current_revision_id !== prior.current_revision_id || head.aggregate_version !== prior.aggregate_version) {
      throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
    }
    const identity = { contractVersion: "staffing-v1" as const, demandId, customerId: head.customer_id,
      workloadId: head.workload_id, engagementId: head.engagement_id, revisionId: head.current_revision_id,
      contentDigest: prior.content_digest as string, aggregateVersion: Number(head.aggregate_version), state: head.state,
      baselineId: prior.baseline_id as string, planId: prior.plan_id as string, planRevisionId: prior.plan_revision_id as string,
      baselineDigest: prior.baseline_digest as string, workPackageKey: prior.work_package_key as string };
    if (!baseline) return { ...identity, contentAvailability: "withheld" as const, reviewRequired: true, demand: null, rationale: null };
    const payload = (await db.query(`SELECT content,rationale FROM staffing_demand_payloads WHERE revision_id=$1 FOR SHARE`, [head.current_revision_id])).rows[0];
    if (!payload) return { ...identity, contentAvailability: "purged" as const, reviewRequired: true, demand: null, rationale: null };
    return { ...identity, contentAvailability: baseline.current ? "readable" as const : "historical_warning" as const,
      reviewRequired: !baseline.current || baseline.reviewRequired, demand: parseStaffing(staffingCreateDemandSchema.shape.demand, payload.content),
      rationale: payload.rationale as string };
  };
  return client ? run(client) : withTransaction(run);
}

/** Lists are identity/state projections. Detail retrieval performs governed
 * baseline and payload checks; this path never retrieves plan/personnel prose. */
export async function listDemands(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingDemandListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational", { customerId: input.customerId });
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "demand-identities", customer: input.customerId, engagement: input.engagementId ?? null };
    const after = readStaffingPageCursor(input.cursor, scope);
    const rows = (await db.query(`SELECT id,customer_id,workload_id,engagement_id,current_revision_id,aggregate_version,state
      FROM staffing_demands WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
      AND ($4::uuid IS NULL OR engagement_id=$4) AND ($5::uuid IS NULL OR id>$5)
      ORDER BY id LIMIT $6 FOR SHARE`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId,
      input.customerId, input.engagementId ?? null, after, input.pageSize + 1])).rows;
    const page = rows.slice(0, input.pageSize);
    return { items: page.map(row => ({ demandId: row.id as string, customerId: row.customer_id as string,
      workloadId: row.workload_id as string | null, engagementId: row.engagement_id as string,
      revisionId: row.current_revision_id as string, aggregateVersion: Number(row.aggregate_version), state: row.state as DemandHead["state"] })),
      nextCursor: rows.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return client ? run(client) : withTransaction(run);
}
