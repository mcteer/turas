import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingFinanceInputSchema, staffingFinanceRevisionSchema, staffingFinancePolicyApprovalSchema, staffingFinanceListSchema,
  type StaffingFinanceInput } from "../../contracts/staffing-economics";
import { staffingIdSchema } from "../../contracts/staffing";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { lockPlanActor } from "../plans/policy";
import { readPlan } from "../plans/read";
import { lockResourceHeads } from "./resources";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { withTransaction } from "../db/client";
import { staffingPageCursor, readStaffingPageCursor } from "./read";

type FinanceValue = StaffingFinanceInput["input"];
const inputPolicy = Object.freeze({ version: "staffing-finance-input-policy-v1", formulaVersion: "staffing-economics-v1",
  currencies: Object.freeze(["USD", "EUR", "GBP", "CAD", "AUD", "JPY"]),
  minorUnitExponent: "JPY=0;others=2", moneyLimit: "1000000000000", hourlyRateLimit: "100000000",
  derivedAbsoluteLimit: "1000000000000000", effectiveDates: "half_open_resource_local",
  enteredTotals: "exact_half_open_engagement_baseline_period_without_proration",
  rounding: "resource_local_date_rate_revision_group_then_half_away_divide_60",
  contribution: "entered_revenue_minus_loaded_delivery_cost_minus_entered_nonlabor",
  margin: "contribution_over_entered_revenue_half_up_two_percentage_decimals_zero_null",
  missingOrMixed: "incomplete_no_zero_default_no_exchange", serviceRevenue: "separate_hypothetical",
  approval: "planning_formula_and_input_policy_only_no_quote_or_actual_profit" });
export const staffingFinancePolicyDigest = () => staffingSha256(inputPolicy);
export const staffingFinanceInputPolicy = () => inputPolicy;
const dbKind = (input: FinanceValue) => input.kind === "rate" ? input.rateKind : input.kind === "contracted_revenue" ? "revenue" : "nonlabor";

/** Metadata discovery never releases financial or plan prose. Original plan
 * sources are locked before the engagement/economic input group. */
export async function lockFinanceBaseline(db: PoolClient, actor: StaffingActor, input: Pick<Exclude<FinanceValue, { kind: "rate" }>, "engagementId" | "baselineId">,
  mode: "SHARE" | "UPDATE" = "SHARE") {
  const baseline = (await db.query(`SELECT b.customer_id,b.plan_id,b.revision_id,b.content_digest,e.workload_id
    FROM milestone_baselines b JOIN engagements e ON e.id=b.engagement_id
    WHERE b.id=$1 AND b.engagement_id=$2 AND b.environment_id=$3 AND b.workspace_id=$4`,
    [input.baselineId, input.engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!baseline) throw hiddenRecord();
  await lockPlanActor(db, actor, baseline.customer_id, false);
  const plan = await db.query(`SELECT id FROM delivery_plans WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    AND customer_id=$4 FOR SHARE`, [baseline.plan_id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, baseline.customer_id]);
  if (!plan.rowCount) throw hiddenRecord();
  const detail = await readPlan(actor, baseline.plan_id, baseline.revision_id, db);
  const engagement = (await db.query(`SELECT active_baseline_id FROM engagements WHERE id=$1
    AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR ${mode === "UPDATE" ? "UPDATE" : "SHARE"}`,
    [input.engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, baseline.customer_id])).rows[0];
  if (!engagement || engagement.active_baseline_id !== input.baselineId || detail.acceptedRevisionId !== baseline.revision_id ||
    detail.contentDigest !== baseline.content_digest || detail.contentAvailability !== "readable" || detail.reviewRequired) {
    throw new HttpFailure(409, "baseline_changed", "Current readable accepted baseline required");
  }
  return baseline.customer_id as string;
}
async function lockInputGroup(db: PoolClient, actor: StaffingActor, input: FinanceValue) {
  let customerId: string | null = null;
  if (input.kind === "rate") {
    // A stable resource mutex also serializes two first inserts, where no rate
    // head yet exists to lock. Never infer absence from an unlocked SELECT.
    const [resource] = await lockResourceHeads(db, actor, [input.resourceId], "UPDATE");
    if (!resource.active) throw new HttpFailure(409, "source_changed", "Resource unavailable");
  } else {
    customerId = await lockFinanceBaseline(db, actor, input);
    const group = staffingSha256({ kind: "finance-input-group", environment: getServerConfig().TURAS_ENVIRONMENT_ID,
      workspace: actor.workspaceId, baseline: input.baselineId, inputKind: dbKind(input) });
    await db.query("SELECT pg_advisory_xact_lock($1::bigint)", [BigInt.asIntN(64, BigInt(`0x${group.slice(0, 16)}`)).toString()]);
  }
  const heads = (await db.query(`SELECT id,kind,resource_id,customer_id,engagement_id,baseline_id,current_revision_id,aggregate_version
    FROM staffing_economic_inputs WHERE environment_id=$1 AND workspace_id=$2 AND kind=$3 AND
    ${input.kind === "rate" ? "resource_id=$4" : "baseline_id=$4 AND engagement_id=$5"} ORDER BY id FOR UPDATE`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, dbKind(input), input.kind === "rate" ? input.resourceId : input.baselineId,
      ...(input.kind === "rate" ? [] : [input.engagementId])])).rows;
  return { customerId, heads };
}
async function checkPeriod(db: PoolClient, input: FinanceValue, heads: Awaited<ReturnType<typeof lockInputGroup>>["heads"], excludeId?: string) {
  const revisions = (await db.query(`SELECT input_id,currency,from_date::text,to_date::text FROM staffing_economic_input_revisions
    WHERE id=ANY($1::uuid[])`, [heads.filter(h => h.id !== excludeId).map(h => h.current_revision_id)])).rows;
  if (revisions.some(r => r.currency === input.currency && r.from_date < input.toDate && input.fromDate < r.to_date)) {
    throw new HttpFailure(409, "version_conflict", "Effective input period overlaps; revise its current input");
  }
}
async function appendInput(db: PoolClient, actor: StaffingActor, id: string, version: number, input: FinanceValue, provenance: string, rationale: string) {
  const revisionId = randomUUID(), digest = staffingSha256({ input, provenance }), amount = input.kind === "rate" ? input.minorUnitsPerHour : input.minorUnits;
  await db.query(`INSERT INTO staffing_economic_input_revisions(id,environment_id,workspace_id,input_id,kind,revision_number,
    currency,minor_units,from_date,to_date,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, id, dbKind(input), version, input.currency,
      amount, input.fromDate, input.toDate, digest, actor.membershipId]);
  await db.query(`INSERT INTO staffing_economic_input_payloads(revision_id,provenance,rationale) VALUES($1,$2,$3)`, [revisionId, provenance, rationale]);
  await db.query(`UPDATE staffing_economic_inputs SET current_revision_id=$2,aggregate_version=$3 WHERE id=$1`, [id, revisionId, version]);
  return { entityId: id, revisionId, contentDigest: digest, aggregateVersion: version, state: "current" };
}
export async function createFinanceInput(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingFinanceInputSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "finance_input_create" }, { capability: "finance" }, async db => {
    const group = await lockInputGroup(db, actor, input.input); await checkPeriod(db, input.input, group.heads);
    const id = randomUUID(), value = input.input;
    await db.query(`INSERT INTO staffing_economic_inputs(id,environment_id,workspace_id,kind,resource_id,customer_id,engagement_id,baseline_id,created_by_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, dbKind(value),
      value.kind === "rate" ? value.resourceId : null, group.customerId, value.kind === "rate" ? null : value.engagementId,
      value.kind === "rate" ? null : value.baselineId, actor.membershipId]);
    return appendInput(db, actor, id, 1, value, input.provenance, input.rationale);
  }, client);
}
export async function reviseFinanceInput(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const id = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingFinanceRevisionSchema, raw);
  return runStaffingCommand(actor, { ...input, inputId: id, action: "finance_input_revise" }, { capability: "finance" }, async db => {
    const group = await lockInputGroup(db, actor, input.input), head = group.heads.find(h => h.id === id);
    if (!head) throw hiddenRecord();
    const revision = (await db.query(`SELECT content_digest FROM staffing_economic_input_revisions WHERE id=$1 AND input_id=$2`, [head.current_revision_id, id])).rows[0];
    if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion || revision?.content_digest !== input.contentDigest) {
      throw new HttpFailure(409, "version_conflict", "Finance input changed; reload");
    }
    await checkPeriod(db, input.input, group.heads, id);
    return appendInput(db, actor, id, input.expectedAggregateVersion + 1, input.input, input.provenance, input.rationale);
  }, client);
}
export async function approveFinancePolicy(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingFinancePolicyApprovalSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "finance_policy_approve" }, { capability: "finance" }, async db => {
    const digest = staffingFinancePolicyDigest();
    if (input.inputPolicyDigest !== digest) throw new HttpFailure(409, "version_conflict", "Finance input policy changed; reload");
    const id = randomUUID();
    await db.query(`INSERT INTO staffing_finance_policy_decisions(id,environment_id,workspace_id,actor_membership_id,actor_session_id,
      formula_version,input_policy_digest,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId, actor.membershipId, actor.sessionId, input.formulaVersion, digest, input.requestKey]);
    await db.query(`INSERT INTO staffing_finance_policy_payloads(decision_id,rationale) VALUES($1,$2)`, [id, input.rationale]);
    return { decisionId: id, contentDigest: digest, state: "approved", warnings: ["planning_policy_only"] };
  }, client);
}

export async function readFinancePolicy(actor: StaffingActor, client?: PoolClient) {
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "finance");
    const digest = staffingFinancePolicyDigest(), decision = (await db.query(`SELECT id,created_at
      FROM staffing_finance_policy_decisions WHERE environment_id=$1 AND workspace_id=$2
      AND formula_version=$3 AND input_policy_digest=$4 ORDER BY created_at DESC,id DESC LIMIT 1`,
      [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, inputPolicy.formulaVersion, digest])).rows[0];
    return { formulaVersion: inputPolicy.formulaVersion, inputPolicyDigest: digest, inputPolicy,
      policyApproval: decision ? "approved" as const : "unvalidated" as const, decisionId: decision?.id as string | undefined ?? null,
      approvedAt: decision?.created_at.toISOString() as string | undefined ?? null, warning: "planning_policy_only" as const };
  };
  return client ? run(client) : withTransaction(run);
}
export async function listFinanceInputs(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingFinanceListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "finance");
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "finance-input-identities", resource: input.resourceId ?? null,
      engagement: input.engagementId ?? null, baseline: input.baselineId ?? null }, after = readStaffingPageCursor(input.cursor, scope);
    const rows = (await db.query(`SELECT id,kind,resource_id,customer_id,engagement_id,baseline_id,current_revision_id,aggregate_version
      FROM staffing_economic_inputs WHERE environment_id=$1 AND workspace_id=$2 AND ($3::uuid IS NULL OR resource_id=$3)
      AND ($4::uuid IS NULL OR engagement_id=$4) AND ($5::uuid IS NULL OR baseline_id=$5) AND ($6::uuid IS NULL OR id>$6)
      ORDER BY id LIMIT $7 FOR SHARE`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId,
      input.resourceId ?? null, input.engagementId ?? null, input.baselineId ?? null, after, input.pageSize + 1])).rows;
    const page = rows.slice(0, input.pageSize);
    return { items: page.map(row => ({ inputId: row.id as string, kind: row.kind as "loaded_cost" | "service" | "revenue" | "nonlabor",
      resourceId: row.resource_id as string | null, customerId: row.customer_id as string | null, engagementId: row.engagement_id as string | null,
      baselineId: row.baseline_id as string | null, revisionId: row.current_revision_id as string, aggregateVersion: Number(row.aggregate_version) })),
      nextCursor: rows.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return client ? run(client) : withTransaction(run);
}
export async function readFinanceInput(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const id = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "finance");
    const prior = (await db.query(`SELECT kind,resource_id,engagement_id,baseline_id,current_revision_id FROM staffing_economic_inputs
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`, [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!prior) throw hiddenRecord();
    let withheld = false;
    if (prior.resource_id) {
      const [resource] = await lockResourceHeads(db, actor, [prior.resource_id]); withheld = !resource.active;
    } else {
      try { await lockFinanceBaseline(db, actor, { engagementId: prior.engagement_id, baselineId: prior.baseline_id }); }
      catch (error) { if (!(error instanceof HttpFailure) || ![404, 409].includes(error.status)) throw error; withheld = true; }
    }
    const head = (await db.query(`SELECT kind,resource_id,customer_id,engagement_id,baseline_id,current_revision_id,aggregate_version
      FROM staffing_economic_inputs WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE`,
      [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!head || head.current_revision_id !== prior.current_revision_id) throw new HttpFailure(409, "version_conflict", "Finance input changed; reload");
    const identity = { inputId: id, kind: head.kind as string, resourceId: head.resource_id as string | null,
      customerId: head.customer_id as string | null, engagementId: head.engagement_id as string | null, baselineId: head.baseline_id as string | null,
      revisionId: head.current_revision_id as string, aggregateVersion: Number(head.aggregate_version) };
    if (withheld) return { ...identity, withheld: true, input: null, provenance: null, rationale: null };
    const revision = (await db.query(`SELECT r.currency,r.minor_units,r.from_date::text,r.to_date::text,r.content_digest,p.provenance,p.rationale
      FROM staffing_economic_input_revisions r JOIN staffing_economic_input_payloads p ON p.revision_id=r.id WHERE r.id=$1 FOR SHARE OF p`, [head.current_revision_id])).rows[0];
    if (!revision) return { ...identity, withheld: true, input: null, provenance: null, rationale: null };
    const period = { currency: revision.currency, fromDate: revision.from_date, toDate: revision.to_date };
    const value = head.resource_id ? { ...period, kind: "rate", resourceId: head.resource_id, rateKind: head.kind, minorUnitsPerHour: revision.minor_units }
      : { ...period, kind: head.kind === "revenue" ? "contracted_revenue" : "nonlabor", engagementId: head.engagement_id, baselineId: head.baseline_id, minorUnits: revision.minor_units };
    return { ...identity, withheld: false, contentDigest: revision.content_digest as string,
      input: parseStaffing(staffingFinanceInputSchema.shape.input, value), provenance: revision.provenance as string, rationale: revision.rationale as string };
  };
  return client ? run(client) : withTransaction(run);
}
