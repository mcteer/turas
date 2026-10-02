import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingIdSchema } from "../../contracts/staffing";
import { staffingAllocationPreviewSchema, staffingAllocationDecisionSchema, staffingAllocationInputSchema } from "../../contracts/staffing-allocations";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { parseStaffing, runStaffingCommand, staffingSha256, withStaffingCommandReplay } from "./commands";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { lockDemandIdentity, readDemand } from "./demands";
import { lockResourceHeads } from "./resources";
import { readConfirmedAllocationLedger, lockAllocationLedgers, applyAllocationLedgerChange } from "./ledger";
import { planAllocationLedgerChange, StaffingLedgerConflict } from "../../staffing/allocation-ledger";
import { resolveStaffingOverlap } from "./temporal";
import { staffingFeasibilitySnapshot } from "./matching";
import { requireStaffingEnvironment } from "./repository";

type Exact = { revisionId: string; contentDigest: string; expectedAggregateVersion: number };
const conflict = () => new HttpFailure(409, "version_conflict", "Allocation changed; reload");
const expired = () => new HttpFailure(409, "preview_expired", "Review preview changed or expired; review again");
async function discover(db: PoolClient, actor: StaffingActor, allocationId: string) {
  const row = (await db.query(`SELECT a.id,a.demand_id,a.resource_id,a.current_revision_id,a.confirmed_revision_id,
    a.aggregate_version,a.state,r.content_digest,r.resource_id AS working_resource_id,r.resource_timezone FROM staffing_allocations a
    JOIN staffing_allocation_revisions r ON r.id=a.current_revision_id AND r.allocation_id=a.id
    WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3`,
    [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}

async function prepareCommitment(actor: StaffingActor, allocationId: string, exact: Exact, action: "confirm" | "amend", write = true) {
  const prepared = await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager", { write });
    const prior = await discover(db, actor, allocationId);
    if (prior.current_revision_id !== exact.revisionId || prior.content_digest !== exact.contentDigest || Number(prior.aggregate_version) !== exact.expectedAggregateVersion) throw conflict();
    const demand = await readDemand(actor, prior.demand_id, db);
    if (!demand.demand || demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable") {
      throw new HttpFailure(409, "demand_conflict", "Current qualified demand required");
    }
    const [resource] = await lockResourceHeads(db, actor, [prior.working_resource_id]);
    const profile = (await db.query(`SELECT timezone FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE`, [resource.current_revision_id])).rows[0];
    if (!resource.active || profile?.timezone !== prior.resource_timezone) throw new HttpFailure(409, "source_changed", "Resource changed; reload");
    const payload = (await db.query(`SELECT content FROM staffing_allocation_payloads WHERE revision_id=$1 FOR SHARE`, [exact.revisionId])).rows[0];
    if (!payload) throw hiddenRecord();
    const { resourceTimezone, ...content } = payload.content;
    const allocation = parseStaffing(staffingAllocationInputSchema, content);
    if (resourceTimezone !== prior.resource_timezone || allocation.resourceId !== prior.working_resource_id || allocation.demandId !== prior.demand_id ||
      allocation.demandRevisionId !== demand.revisionId || allocation.demandDigest !== demand.contentDigest || allocation.expectedDemandVersion !== demand.aggregateVersion) throw conflict();
    if (allocation.days.some(day => day.minutes > (demand.demand!.days.find(required => required.date === day.date)?.requiredMinutes ?? 0))) {
      throw new HttpFailure(409, "demand_conflict", "Allocation exceeds current requested effort");
    }
    const today = (await db.query(`SELECT (clock_timestamp() AT TIME ZONE $1)::date::text AS date`, [resourceTimezone])).rows[0].date as string;
    const futureDays = allocation.days.filter(day => day.date >= today);
    if (!futureDays.length || action === "confirm" && futureDays.length !== allocation.days.length) {
      throw new HttpFailure(409, "past_immutable", "Future service dates required for a new commitment");
    }
    return { allocation: { ...allocation, resourceTimezone: resourceTimezone as string }, demand, futureDays };
  });
  // The package load and any timezone conversion run after preflight commits.
  return { ...prepared, overlap: prepared.demand.demand!.overlap ? resolveStaffingOverlap(prepared.demand.demand!.overlap) : [] };
}
type PreparedCommitment = Awaited<ReturnType<typeof prepareCommitment>>;

async function commitmentInputs(db: PoolClient, actor: StaffingActor, allocationId: string, exact: Exact,
  action: "confirm" | "amend", prepared: PreparedCommitment) {
  const prior = await discover(db, actor, allocationId);
  if (prior.current_revision_id !== exact.revisionId || prior.content_digest !== exact.contentDigest || Number(prior.aggregate_version) !== exact.expectedAggregateVersion) throw conflict();
  const oldRows = await readConfirmedAllocationLedger(db, actor, allocationId);
  const ids = [...new Set([prior.resource_id as string, prepared.allocation.resourceId, ...oldRows.map(row => row.resourceId)])].sort();
  const feasible = await staffingFeasibilitySnapshot(db, actor, prior.demand_id, prepared.demand, prepared.overlap, {
    resourceIds: ids, days: prepared.futureDays.map(day => ({ date: day.date, requiredMinutes: day.minutes })), capacityLock: "none", credits: oldRows,
    evaluatedResourceId: prepared.allocation.resourceId });
  const profile = feasible.profiles.find(profile => profile.id === prepared.allocation.resourceId);
  if (profile?.timezone !== prepared.allocation.resourceTimezone) throw new HttpFailure(409, "source_changed", "Resource timezone changed; reload");
  const selected = feasible.matches.find(match => match.resourceId === prepared.allocation.resourceId);
  if (selected?.status !== "eligible") {
    const capacity = selected?.constraints.some(constraint => constraint.kind === "capacity" && constraint.outcome === "failed");
    throw new HttpFailure(409, capacity ? "capacity_conflict" : "source_changed", "Current resource feasibility requires review");
  }
  const newRows = prepared.allocation.days.map(day => ({ resourceId: prepared.allocation.resourceId, resourceTimezone: prepared.allocation.resourceTimezone,
    demandId: prior.demand_id as string, date: day.date, minutes: day.minutes, billable: feasible.demand.demand!.billable }));
  const ledgers = await lockAllocationLedgers(db, actor, oldRows, newRows);
  // Shared calendar/source inputs are already locked. Capacity reads above did
  // not lock a subset before this complete union, avoiding lock-order upgrades.
  const schedulable = new Map<string, number | null>();
  for (const ledger of ledgers.resourceDays) {
    const day = feasible.calendar.get(ledger.resourceId)?.find(day => day.date === ledger.date);
    if (!day) continue; // Removed historical dates require no new feasibility.
    if (day.capacityGeneration === null ? ledger.generation !== 1 || ledger.confirmedMinutes !== 0 : ledger.generation !== day.capacityGeneration) {
      throw new HttpFailure(409, "capacity_conflict", "Capacity changed; review again");
    }
    schedulable.set(`${ledger.resourceId}/${ledger.date}`, day.remainingMinutes === null ? null : day.remainingMinutes + ledger.confirmedMinutes);
  }
  const head = (await db.query(`SELECT current_revision_id,confirmed_revision_id,aggregate_version,state,resource_id,reservation_expires_at
    FROM staffing_allocations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
    [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!head || head.current_revision_id !== prior.current_revision_id || head.confirmed_revision_id !== prior.confirmed_revision_id ||
    head.aggregate_version !== prior.aggregate_version || head.resource_id !== prior.resource_id ||
    action === "confirm" && (!["proposed", "tentative"].includes(head.state) || head.confirmed_revision_id !== null) ||
    action === "amend" && (head.state !== "confirmed" || head.confirmed_revision_id === null)) throw conflict();
  if (head.state === "tentative" && !(await db.query(`SELECT $1::timestamptz>clock_timestamp() AS fresh`, [head.reservation_expires_at])).rows[0].fresh) {
    throw new HttpFailure(409, "reservation_expired", "Reservation expired; propose again");
  }
  if (staffingSha256(await readConfirmedAllocationLedger(db, actor, allocationId)) !== staffingSha256(oldRows)) throw conflict();
  const dates = (await db.query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS as_of)
    SELECT zone,(clock.as_of AT TIME ZONE zone)::date::text AS local_date FROM unnest($1::text[]) AS zones(zone) CROSS JOIN clock`,
    [[...new Set([...oldRows, ...newRows].map(row => row.resourceTimezone))]])).rows;
  const required = new Map(feasible.demand.demand!.days.map(day => [`${prior.demand_id}/${day.date}`, day.requiredMinutes]));
  let effects;
  try {
    effects = planAllocationLedgerChange({ action, oldRows, newRows,
      currentDatesByTimezone: new Map(dates.map(row => [row.zone as string, row.local_date as string])),
      resourceDays: ledgers.resourceDays.map(row => ({ ...row, schedulableMinutes: schedulable.get(`${row.resourceId}/${row.date}`) ?? null })),
      demandDays: ledgers.demandDays.map(row => ({ ...row, requiredMinutes: required.get(`${row.demandId}/${row.date}`) ?? null })) });
  } catch (error) {
    if (error instanceof StaffingLedgerConflict) throw new HttpFailure(409, error.code, "Allocation daily limits or history changed; reload");
    throw error;
  }
  const dependencies = { action, actorSessionId: actor.sessionId,
    allocation: { allocationId, revisionId: exact.revisionId, contentDigest: exact.contentDigest,
      aggregateVersion: exact.expectedAggregateVersion, confirmedRevisionId: head.confirmed_revision_id as string | null },
    feasibilityDigest: feasible.inputDigest, oldRows, newRows, resourceDays: ledgers.resourceDays, demandDays: ledgers.demandDays, localDates: dates };
  if (Buffer.byteLength(JSON.stringify(dependencies), "utf8") > 131_072) throw new HttpFailure(413, "too_large", "Allocation review exceeds limit");
  return { ledgers, effects, dependencies, dependencyDigest: staffingSha256(dependencies), schedulable, required };
}

/** Identity-only release/cancel path. Feasibility for new/replacement time is a
 * separate prerequisite; this path retrieves no withheld allocation/source prose. */
async function removalInputs(db: PoolClient, actor: StaffingActor, allocationId: string, exact: Exact,
  action: "release" | "cancel") {
  const prior = await discover(db, actor, allocationId);
  const demand = await lockDemandIdentity(db, actor, prior.demand_id);
  const oldRows = await readConfirmedAllocationLedger(db, actor, allocationId);
  const resourceIds = [...new Set([prior.resource_id as string, ...oldRows.map(row => row.resourceId)])].sort();
  const resources = await lockResourceHeads(db, actor, resourceIds);
  const ledgers = await lockAllocationLedgers(db, actor, oldRows, []);
  const head = (await db.query(`SELECT current_revision_id,confirmed_revision_id,aggregate_version,state,resource_id
    FROM staffing_allocations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
    [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!head || head.current_revision_id !== prior.current_revision_id || head.confirmed_revision_id !== prior.confirmed_revision_id ||
    head.aggregate_version !== prior.aggregate_version || head.resource_id !== prior.resource_id || head.state !== "confirmed" || !head.confirmed_revision_id ||
    head.current_revision_id !== exact.revisionId || prior.content_digest !== exact.contentDigest || Number(head.aggregate_version) !== exact.expectedAggregateVersion) throw conflict();
  const actual = await readConfirmedAllocationLedger(db, actor, allocationId);
  if (staffingSha256(actual) !== staffingSha256(oldRows)) throw conflict();
  const dates = (await db.query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS as_of)
    SELECT zone,(clock.as_of AT TIME ZONE zone)::date::text AS local_date FROM unnest($1::text[]) AS zones(zone) CROSS JOIN clock`,
    [[...new Set(oldRows.map(row => row.resourceTimezone))]])).rows;
  let effects;
  try {
    effects = planAllocationLedgerChange({ action, oldRows, newRows: [],
      currentDatesByTimezone: new Map(dates.map(row => [row.zone as string, row.local_date as string])),
      resourceDays: ledgers.resourceDays.map(row => ({ ...row, schedulableMinutes: null })),
      demandDays: ledgers.demandDays.map(row => ({ ...row, requiredMinutes: null })) });
  } catch (error) {
    if (error instanceof StaffingLedgerConflict) throw new HttpFailure(409, error.code, "Allocation history changed; reload");
    throw error;
  }
  const dependencies = { action, actorSessionId: actor.sessionId,
    allocation: { allocationId, revisionId: exact.revisionId, contentDigest: exact.contentDigest,
      aggregateVersion: exact.expectedAggregateVersion, confirmedRevisionId: head.confirmed_revision_id as string },
    demand: { demandId: demand.id, revisionId: demand.current_revision_id, aggregateVersion: Number(demand.aggregate_version), state: demand.state },
    resources: resources.map(row => ({ resourceId: row.id, revisionId: row.current_revision_id, aggregateVersion: row.aggregate_version, active: row.active })),
    oldRows, resourceDays: ledgers.resourceDays, demandDays: ledgers.demandDays, localDates: dates };
  if (Buffer.byteLength(JSON.stringify(dependencies), "utf8") > 131_072) throw new HttpFailure(413, "too_large", "Allocation review exceeds limit");
  return { ledgers, effects, dependencies, dependencyDigest: staffingSha256(dependencies) };
}

export async function createAllocationReviewPreview(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingAllocationPreviewSchema, raw);
  const removal = input.action === "release" || input.action === "cancel";
  const request = { ...input, allocationId, reviewAction: input.action, action: "allocation_review_preview" };
  const options = { capability: "manager" as const, allowDisabled: removal };
  return withStaffingCommandReplay(actor, request, options, async () => {
  const prepared = removal ? null : await prepareCommitment(actor, allocationId, input, input.action as "confirm" | "amend");
  return runStaffingCommand(actor, request, options, async db => {
      const current = removal ? await removalInputs(db, actor, allocationId, input, input.action as "release" | "cancel")
        : await commitmentInputs(db, actor, allocationId, input, input.action as "confirm" | "amend", prepared!);
      const previewId = randomUUID(), createdAt = new Date().toISOString(), expiresAt = new Date(Date.parse(createdAt) + 600_000).toISOString();
      await db.query(`INSERT INTO staffing_review_previews(id,environment_id,workspace_id,allocation_id,revision_id,
        actor_membership_id,actor_session_id,action,aggregate_version,content_digest,dependency_digest,dependencies,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [previewId, getServerConfig().TURAS_ENVIRONMENT_ID,
        actor.workspaceId, allocationId, input.revisionId, actor.membershipId, actor.sessionId, input.action,
        input.expectedAggregateVersion, input.contentDigest, current.dependencyDigest, JSON.stringify(current.dependencies), createdAt, expiresAt]);
      return { allocationId, previewId, revisionId: input.revisionId, contentDigest: input.contentDigest,
        aggregateVersion: input.expectedAggregateVersion, expiresAt, state: "prepared" };
    });
  });
}

export async function readAllocationReviewPreview(actor: StaffingActor, rawId: unknown, rawPreview: unknown) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), previewId = parseStaffing(staffingIdSchema, rawPreview);
  const metadata = await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager");
    const metadata = (await db.query(`SELECT revision_id,content_digest,aggregate_version,action FROM staffing_review_previews
      WHERE id=$1 AND allocation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND actor_membership_id=$5 AND actor_session_id=$6`,
      [previewId, allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, actor.sessionId])).rows[0];
    if (!metadata) throw hiddenRecord();
    return metadata;
  });
  const exact = { revisionId: metadata.revision_id as string, contentDigest: metadata.content_digest as string,
    expectedAggregateVersion: Number(metadata.aggregate_version) };
  const removal = metadata.action === "release" || metadata.action === "cancel";
  const prepared = removal ? null : await prepareCommitment(actor, allocationId, exact, metadata.action, false);
  return withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager");
    const current = removal ? await removalInputs(db, actor, allocationId, exact, metadata.action)
      : await commitmentInputs(db, actor, allocationId, exact, metadata.action, prepared!);
    const preview = (await db.query(`SELECT dependency_digest,expires_at,used_decision_id FROM staffing_review_previews
      WHERE id=$1 AND actor_membership_id=$2 AND actor_session_id=$3 FOR SHARE`, [previewId, actor.membershipId, actor.sessionId])).rows[0];
    if (!preview || preview.used_decision_id || preview.dependency_digest !== current.dependencyDigest || new Date(preview.expires_at).getTime() <= Date.now()) throw expired();
    return { contractVersion: "staffing-v1" as const, allocationId, previewId, action: metadata.action as "confirm" | "amend" | "release" | "cancel",
      revisionId: metadata.revision_id as string, contentDigest: metadata.content_digest as string, aggregateVersion: Number(metadata.aggregate_version),
      expiresAt: new Date(preview.expires_at).toISOString(), effects: current.effects, planningOnly: true };
  });
}

export async function decideAllocation(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingAllocationDecisionSchema, raw);
  const removal = input.action === "release" || input.action === "cancel";
  const request = { ...input, allocationId }, options = { capability: "manager" as const, allowDisabled: removal };
  return withStaffingCommandReplay(actor, request, options, async () => {
  const prepared = removal ? null : await prepareCommitment(actor, allocationId, input, input.action as "confirm" | "amend");
  return runStaffingCommand(actor, request, options, async db => {
    const current = removal ? await removalInputs(db, actor, allocationId, input, input.action as "release" | "cancel")
      : await commitmentInputs(db, actor, allocationId, input, input.action as "confirm" | "amend", prepared!);
    const preview = (await db.query(`SELECT revision_id,content_digest,aggregate_version,action,dependency_digest,used_decision_id,
      expires_at>clock_timestamp() AS fresh FROM staffing_review_previews WHERE id=$1 AND allocation_id=$2
      AND environment_id=$3 AND workspace_id=$4 AND actor_membership_id=$5 AND actor_session_id=$6 FOR UPDATE`,
      [input.reviewPreviewId, allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, actor.sessionId])).rows[0];
    if (!preview) throw hiddenRecord();
    if (!preview.fresh || preview.used_decision_id || preview.action !== input.action || preview.revision_id !== input.revisionId ||
      preview.content_digest !== input.contentDigest || Number(preview.aggregate_version) !== input.expectedAggregateVersion || preview.dependency_digest !== current.dependencyDigest) throw expired();
    await applyAllocationLedgerChange(db, actor, current.ledgers, { allocationId, revisionId: input.revisionId,
      action: input.action, schedulableMinutes: "schedulable" in current ? current.schedulable : new Map(),
      requiredMinutes: "required" in current ? current.required : new Map() });
    await requireStaffingEnvironment(db, !removal);
    if (!(await db.query(`SELECT id FROM login_sessions WHERE id=$1 AND principal_id=$2
      AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [actor.sessionId, actor.principalId])).rowCount) {
      throw new HttpFailure(401, "authentication_required", "Sign in again");
    }
    const decisionId = randomUUID();
    await db.query(`INSERT INTO staffing_decisions(id,environment_id,workspace_id,allocation_id,revision_id,preview_id,
      actor_membership_id,actor_session_id,action,request_key,content_digest,dependency_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [decisionId, getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId, allocationId, input.revisionId, input.reviewPreviewId, actor.membershipId, actor.sessionId,
      input.action, input.requestKey, input.contentDigest, current.dependencyDigest]);
    await db.query(`INSERT INTO staffing_decision_payloads(decision_id,rationale) VALUES($1,$2)`, [decisionId, input.rationale]);
    const consumed = await db.query(`UPDATE staffing_review_previews SET used_decision_id=$2
      WHERE id=$1 AND expires_at>clock_timestamp() AND used_decision_id IS NULL`, [input.reviewPreviewId, decisionId]);
    if (consumed.rowCount !== 1) throw expired();
    const state = input.action === "release" ? "released" : input.action === "cancel" ? "cancelled" : "confirmed";
    const updated = await db.query(`UPDATE staffing_allocations SET state=$2,aggregate_version=aggregate_version+1,
      confirmed_revision_id=CASE WHEN $3::uuid IS NULL THEN confirmed_revision_id ELSE $3 END,
      resource_id=CASE WHEN $4::uuid IS NULL THEN resource_id ELSE $4 END,reservation_expires_at=NULL,updated_at=now()
      WHERE id=$1 AND (state<>'tentative' OR $2<>'confirmed' OR reservation_expires_at>clock_timestamp())`,
      [allocationId, state, removal ? null : input.revisionId, prepared?.allocation.resourceId ?? null]);
    if (updated.rowCount !== 1) throw new HttpFailure(409, "reservation_expired", "Reservation expired; propose again");
    return { allocationId, revisionId: input.revisionId, contentDigest: input.contentDigest,
      aggregateVersion: input.expectedAggregateVersion + 1, decisionId, state };
  });
  });
}
