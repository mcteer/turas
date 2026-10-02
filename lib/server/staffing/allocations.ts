import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingIdSchema } from "../../contracts/staffing";
import { staffingProposeAllocationSchema, staffingReviseAllocationSchema, staffingCancelProposalSchema, staffingReserveAllocationSchema,
  staffingAllocationListSchema, staffingAllocationInputSchema, type StaffingAllocationInput } from "../../contracts/staffing-allocations";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256, tryStaffingCommandReplay } from "./commands";
import { readDemand, lockDemandIdentity } from "./demands";
import { lockResourceHeads } from "./resources";
import { lockStaffingActor, requireStaffingCapability, type StaffingActor } from "./policy";
import { withTransaction } from "../db/client";
import { staffingPageCursor, readStaffingPageCursor, isStaffingManager } from "./read";
import { resolveStaffingReservationDeadline, resolveStaffingOverlap } from "./temporal";
import { readConfirmedAllocationLedger } from "./ledger";
import { staffingFeasibilitySnapshot } from "./matching";

async function appendEvent(db: PoolClient, actor: StaffingActor, allocationId: string, revisionId: string,
  version: number, digest: string, state: string, action: string, requestKey: string, rationale: string) {
  const eventId = randomUUID();
  await db.query(`INSERT INTO staffing_allocation_events(id,environment_id,workspace_id,allocation_id,revision_id,
    aggregate_version,content_digest,state,action,actor_membership_id,actor_session_id,request_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [eventId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId,
    allocationId, revisionId, version, digest, state, action, actor.membershipId, actor.sessionId, requestKey]);
  await db.query(`INSERT INTO staffing_allocation_event_payloads(event_id,rationale) VALUES($1,$2)`, [eventId, rationale]);
}

async function qualifiedDemand(db: PoolClient, actor: StaffingActor, allocation: StaffingAllocationInput) {
  const demand = await readDemand(actor, allocation.demandId, db);
  if (demand.revisionId !== allocation.demandRevisionId || demand.contentDigest !== allocation.demandDigest || demand.aggregateVersion !== allocation.expectedDemandVersion) {
    throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
  }
  if (demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable" || !demand.demand) {
    throw new HttpFailure(409, "demand_conflict", "Current qualified demand required");
  }
  if (allocation.days.some(day => {
    const required = demand.demand!.days.find(d => d.date === day.date);
    return !required || day.minutes > required.requiredMinutes;
  })) throw new HttpFailure(422, "invalid_input", "Allocation must fit its demand service dates");
  return demand;
}
async function resourceTimezone(db: PoolClient, actor: StaffingActor, resourceId: string, otherResourceId?: string) {
  const resources = await lockResourceHeads(db, actor, [resourceId, ...(otherResourceId ? [otherResourceId] : [])]);
  const resource = resources.find(r => r.id === resourceId)!;
  if (!resource.active) throw new HttpFailure(409, "source_changed", "Resource unavailable");
  const profile = (await db.query(`SELECT timezone FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE`, [resource.current_revision_id])).rows[0];
  if (!profile) throw hiddenRecord();
  return profile.timezone as string;
}
async function appendAllocation(db: PoolClient, actor: StaffingActor, allocationId: string, version: number,
  customerId: string, allocation: StaffingAllocationInput, timezone: string, rationale: string, confirmed = false) {
  const revisionId = randomUUID(), content = { ...allocation, resourceTimezone: timezone }, digest = staffingSha256(content);
  const dates = allocation.days.map(d => d.date).sort();
  await db.query(`INSERT INTO staffing_allocation_revisions(id,environment_id,workspace_id,allocation_id,customer_id,demand_id,
    demand_revision_id,resource_id,revision_number,content_digest,resource_timezone,actor_membership_id,from_date,to_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [revisionId, getServerConfig().TURAS_ENVIRONMENT_ID,
    actor.workspaceId, allocationId, customerId, allocation.demandId, allocation.demandRevisionId, allocation.resourceId,
    version, digest, timezone, actor.membershipId, dates[0], dates.at(-1)]);
  await db.query(`INSERT INTO staffing_allocation_payloads(revision_id,content,rationale) VALUES($1,$2,$3)`, [revisionId, JSON.stringify(content), rationale]);
  // Proposing an amendment never changes a confirmed revision or its daily ledger.
  await db.query(`UPDATE staffing_allocations SET current_revision_id=$2,aggregate_version=$3,updated_at=now(),
    resource_id=CASE WHEN state='confirmed' THEN resource_id ELSE $4 END,
    state=CASE WHEN state='confirmed' THEN state ELSE 'proposed' END,reservation_expires_at=NULL WHERE id=$1`,
    [allocationId, revisionId, version, allocation.resourceId]);
  return { allocationId, revisionId, contentDigest: digest, aggregateVersion: version, state: confirmed ? "confirmed" : "proposed",
    warnings: [confirmed ? "amendment_unconfirmed" : "feasibility_unreviewed"] };
}

/** A proposal is not a capacity reservation or human staffing decision. Full
 * calendar/competency/grant feasibility is rechecked at matching and confirmation. */
export async function proposeAllocation(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingProposeAllocationSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "allocation_propose" }, { capability: "operational" }, async db => {
    const demand = await qualifiedDemand(db, actor, input.allocation);
    const timezone = await resourceTimezone(db, actor, input.allocation.resourceId);
    const allocationId = randomUUID();
    await db.query(`INSERT INTO staffing_allocations(id,environment_id,workspace_id,customer_id,demand_id,resource_id,created_by_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId,
      demand.customerId, input.allocation.demandId, input.allocation.resourceId, actor.membershipId]);
    const result = await appendAllocation(db, actor, allocationId, 1, demand.customerId, input.allocation, timezone, input.rationale);
    await appendEvent(db, actor, allocationId, result.revisionId, 1, result.contentDigest, result.state, "propose", input.requestKey, input.rationale);
    return result;
  }, client);
}
export async function reviseAllocation(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingReviseAllocationSchema, raw);
  return runStaffingCommand(actor, { ...input, allocationId, action: "allocation_revise" }, { capability: "operational",
    authorizeReplay: async db => {
      const head = await discoverAllocation(db, actor, allocationId);
      if (head.confirmed_revision_id !== null) requireStaffingCapability(actor, "manager");
      else if (head.created_by_membership_id !== actor.membershipId) throw new HttpFailure(403, "forbidden", "Allocation revision not allowed");
    } }, async db => {
    // Discovery is metadata only; source/demand locks precede resource/allocation.
    const prior = (await db.query(`SELECT demand_id,customer_id,resource_id FROM staffing_allocations
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`, [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!prior || prior.demand_id !== input.allocation.demandId) throw hiddenRecord();
    const demand = await qualifiedDemand(db, actor, input.allocation);
    if (prior.customer_id !== demand.customerId) throw hiddenRecord();
    const timezone = await resourceTimezone(db, actor, input.allocation.resourceId, prior.resource_id);
    const head = (await db.query(`SELECT current_revision_id,confirmed_revision_id,resource_id,aggregate_version,state,created_by_membership_id
      FROM staffing_allocations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
      [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!head || head.resource_id !== prior.resource_id) throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
    const revision = (await db.query(`SELECT content_digest FROM staffing_allocation_revisions WHERE id=$1 AND allocation_id=$2`, [head.current_revision_id, allocationId])).rows[0];
    if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion || revision?.content_digest !== input.contentDigest) {
      throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
    }
    if (head.state === "confirmed") requireStaffingCapability(actor, "manager");
    else if (!["proposed", "tentative"].includes(head.state) || head.created_by_membership_id !== actor.membershipId) {
      throw new HttpFailure(403, "forbidden", "Allocation revision not allowed");
    }
    const result = await appendAllocation(db, actor, allocationId, input.expectedAggregateVersion + 1, demand.customerId, input.allocation,
      timezone, input.rationale, head.state === "confirmed");
    await appendEvent(db, actor, allocationId, result.revisionId, result.aggregateVersion, result.contentDigest,
      result.state, "revise", input.requestKey, input.rationale);
    return result;
  }, client);
}

async function discoverAllocation(db: PoolClient, actor: StaffingActor, allocationId: string) {
  const row = (await db.query(`SELECT id,demand_id,customer_id,resource_id,current_revision_id,confirmed_revision_id,
    aggregate_version,state,created_by_membership_id,reservation_expires_at,created_at FROM staffing_allocations
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`,
    [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}
async function lockDiscoveredAllocation(db: PoolClient, actor: StaffingActor, prior: Awaited<ReturnType<typeof discoverAllocation>>,
  mode: "SHARE" | "UPDATE") {
  const row = (await db.query(`SELECT id,demand_id,customer_id,resource_id,current_revision_id,confirmed_revision_id,
    aggregate_version,state,created_by_membership_id,reservation_expires_at,created_at FROM staffing_allocations
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR ${mode}`,
    [prior.id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
  if (!row || row.resource_id !== prior.resource_id || row.current_revision_id !== prior.current_revision_id ||
    row.confirmed_revision_id !== prior.confirmed_revision_id || row.aggregate_version !== prior.aggregate_version) {
    throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
  }
  return row;
}

export async function cancelAllocationProposal(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingCancelProposalSchema, raw);
  return runStaffingCommand(actor, { ...input, allocationId, action: "allocation_cancel_proposal" },
    { capability: "operational", allowDisabled: true, authorizeReplay: async db => {
      const head = await discoverAllocation(db, actor, allocationId);
      if (head.created_by_membership_id !== actor.membershipId) requireStaffingCapability(actor, "manager");
    } }, async db => {
      const prior = await discoverAllocation(db, actor, allocationId);
      await lockDemandIdentity(db, actor, prior.demand_id);
      await lockResourceHeads(db, actor, [prior.resource_id]);
      const head = await lockDiscoveredAllocation(db, actor, prior, "UPDATE");
      // Even a canonical manager must use a governed decision for confirmed time.
      if (!["proposed", "tentative"].includes(head.state) || head.confirmed_revision_id !== null) {
        throw new HttpFailure(409, "version_conflict", "Exact unconfirmed proposal required");
      }
      if (head.created_by_membership_id !== actor.membershipId) requireStaffingCapability(actor, "manager");
      const revision = (await db.query(`SELECT content_digest FROM staffing_allocation_revisions WHERE id=$1 AND allocation_id=$2`,
        [head.current_revision_id, allocationId])).rows[0];
      if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion ||
        revision?.content_digest !== input.contentDigest) throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
      await db.query(`UPDATE staffing_allocations SET state='cancelled',reservation_expires_at=NULL,
        aggregate_version=aggregate_version+1,updated_at=now() WHERE id=$1`, [allocationId]);
      await appendEvent(db, actor, allocationId, input.revisionId, input.expectedAggregateVersion + 1, input.contentDigest,
        "cancelled", "cancel_proposal", input.requestKey, input.rationale);
      return { allocationId, revisionId: input.revisionId, contentDigest: input.contentDigest,
        aggregateVersion: input.expectedAggregateVersion + 1, state: "cancelled" };
    }, client);
}

/** A tentative reservation records interest separately from confirmed ledgers.
 * Its bounded expiry is resolved outside transactions and rechecked at commit. */
export async function reserveAllocation(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const allocationId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingReserveAllocationSchema, raw);
  const request = { ...input, allocationId, action: "allocation_reserve" };
  const options = { capability: "operational" as const };
  const priorReceipt = await tryStaffingCommandReplay(actor, request, options);
  if (priorReceipt) return priorReceipt;
  try {
  const prepared = await withTransaction(async db => {
    const projection = await readAllocation(actor, allocationId, db);
    const head = await discoverAllocation(db, actor, allocationId);
    if (!projection.allocation || projection.reviewRequired || projection.state !== "proposed" || projection.confirmedRevisionId !== null ||
      projection.revisionId !== input.revisionId || projection.contentDigest !== input.contentDigest || projection.aggregateVersion !== input.expectedAggregateVersion) {
      throw new HttpFailure(409, "version_conflict", "Exact current unconfirmed proposal required");
    }
    return { allocation: projection.allocation, createdAt: new Date(head.created_at).toISOString() };
  });
  const expiry = resolveStaffingReservationDeadline(prepared.allocation.days.map(day => day.date).sort()[0],
    prepared.allocation.resourceTimezone, prepared.createdAt, new Date().toISOString());
  return await runStaffingCommand(actor, request, options, async db => {
      const prior = await discoverAllocation(db, actor, allocationId);
      await qualifiedDemand(db, actor, prepared.allocation);
      const timezone = await resourceTimezone(db, actor, prepared.allocation.resourceId);
      const head = await lockDiscoveredAllocation(db, actor, prior, "UPDATE");
      const revision = (await db.query(`SELECT content_digest FROM staffing_allocation_revisions WHERE id=$1 AND allocation_id=$2`, [head.current_revision_id, allocationId])).rows[0];
      if (head.state !== "proposed" || head.confirmed_revision_id !== null || head.current_revision_id !== input.revisionId ||
        Number(head.aggregate_version) !== input.expectedAggregateVersion || revision?.content_digest !== input.contentDigest ||
        timezone !== prepared.allocation.resourceTimezone) throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
      const changed = await db.query(`UPDATE staffing_allocations SET state='tentative',reservation_expires_at=$2,
        aggregate_version=aggregate_version+1,updated_at=now() WHERE id=$1 AND $2::timestamptz>clock_timestamp()`, [allocationId, expiry]);
      if (changed.rowCount !== 1) throw new HttpFailure(409, "reservation_expired", "Reservation would already be expired");
      await appendEvent(db, actor, allocationId, input.revisionId, input.expectedAggregateVersion + 1, input.contentDigest,
        "tentative", "reserve", input.requestKey, input.rationale);
      return { allocationId, revisionId: input.revisionId, contentDigest: input.contentDigest,
        aggregateVersion: input.expectedAggregateVersion + 1, expiresAt: expiry, state: "tentative" };
    });
  } catch (error) {
    // A concurrent identical command may commit between the first receipt read
    // and the head lock. Reconcile that exact receipt after rollback; never
    // re-execute a mutation or reinterpret a different request digest.
    if (error instanceof HttpFailure && error.status === 409) {
      const receipt = await tryStaffingCommandReplay(actor, request, options);
      if (receipt) return receipt;
    }
    throw error;
  }
}

/** Source eligibility precedes payload access. Proposals expose operational
 * assignment data only; this projection never reads competency or leave prose. */
async function readAllocationProjection(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const allocationId = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const prior = await discoverAllocation(db, actor, allocationId);
    const demand = await readDemand(actor, prior.demand_id, db);
    const revision = (await db.query(`SELECT resource_id,demand_revision_id,content_digest,resource_timezone
      FROM staffing_allocation_revisions WHERE id=$1 AND allocation_id=$2`, [prior.current_revision_id, allocationId])).rows[0];
    if (!revision) throw hiddenRecord();
    const resources = await lockResourceHeads(db, actor, [prior.resource_id, revision.resource_id]);
    const head = await lockDiscoveredAllocation(db, actor, prior, "SHARE");
    const identity = { contractVersion: "staffing-v1" as const, allocationId, demandId: head.demand_id as string,
      customerId: head.customer_id as string, resourceId: head.resource_id as string,
      revisionId: head.current_revision_id as string, contentDigest: revision.content_digest as string,
      aggregateVersion: Number(head.aggregate_version), state: head.state as string,
      canReview: isStaffingManager(actor), canReserve: head.state === "proposed" && head.confirmed_revision_id === null,
      canRevise: head.state === "confirmed" ? isStaffingManager(actor) : ["proposed", "tentative"].includes(head.state) && head.created_by_membership_id === actor.membershipId,
      canCancelProposal: ["proposed", "tentative"].includes(head.state) && head.confirmed_revision_id === null && (head.created_by_membership_id === actor.membershipId || isStaffingManager(actor)),
      confirmedRevisionId: head.confirmed_revision_id as string | null,
      reservationExpiresAt: head.reservation_expires_at ? new Date(head.reservation_expires_at).toISOString() : null };
    if (!demand.demand || resources.some(resource => !resource.active)) return { ...identity, contentAvailability: "withheld" as const,
      reviewRequired: true, allocation: null, rationale: null, warnings: ["source_unavailable"] };
    const payload = (await db.query(`SELECT content,rationale FROM staffing_allocation_payloads WHERE revision_id=$1 FOR SHARE`,
      [head.current_revision_id])).rows[0];
    if (!payload) return { ...identity, contentAvailability: "purged" as const, reviewRequired: true,
      allocation: null, rationale: null, warnings: ["source_unavailable"] };
    const { resourceTimezone, ...input } = payload.content;
    const allocation = parseStaffing(staffingAllocationInputSchema, input);
    if (allocation.resourceId !== revision.resource_id || resourceTimezone !== revision.resource_timezone) throw hiddenRecord();
    const reviewRequired = demand.reviewRequired || demand.state !== "qualified" || demand.revisionId !== revision.demand_revision_id;
    return { ...identity, contentAvailability: reviewRequired ? "historical_warning" as const : "readable" as const,
      reviewRequired, allocation: { ...allocation, resourceTimezone: revision.resource_timezone as string },
      rationale: payload.rationale as string, warnings: [...(reviewRequired ? ["demand_changed"] : []),
        ...(head.state === "confirmed" && head.current_revision_id !== head.confirmed_revision_id ? ["amendment_unconfirmed"] : []),
        ...(head.state === "proposed" ? ["feasibility_unreviewed"] : [])] };
  };
  return client ? run(client) : withTransaction(run);
}

/** Current confirmed feasibility is rechecked without erasing existing time.
 * Timezone overlap preparation occurs outside SQL locks. Transaction callers
 * receive a conservative review state rather than an unverified clean claim. */
export async function readAllocation(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const allocationId = parseStaffing(staffingIdSchema, rawId);
  const annotate = (projection: Awaited<ReturnType<typeof readAllocationProjection>>) => ({ ...projection,
    reviewRequired: true, contentAvailability: projection.contentAvailability === "readable" ? "historical_warning" as const : projection.contentAvailability,
    warnings: [...new Set([...projection.warnings, "current_feasibility_review_required"])] });
  const first = await readAllocationProjection(actor, allocationId, client);
  if (first.state !== "confirmed" || first.reviewRequired || !first.allocation) return first;
  if (client || first.confirmedRevisionId !== first.revisionId) return annotate(first);
  try {
    const prepared = await withTransaction(async db => {
      await lockStaffingActor(db, actor, "operational");
      const prior = await discoverAllocation(db, actor, allocationId);
      if (prior.current_revision_id !== first.revisionId || Number(prior.aggregate_version) !== first.aggregateVersion || prior.confirmed_revision_id !== first.confirmedRevisionId) {
        throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
      }
      const demand = await readDemand(actor, first.demandId, db), rows = await readConfirmedAllocationLedger(db, actor, allocationId);
      const localDates = (await db.query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS as_of)
        SELECT zone,(clock.as_of AT TIME ZONE zone)::date::text AS local_date FROM unnest($1::text[]) AS zones(zone) CROSS JOIN clock`,
        [[...new Set(rows.map(row => row.resourceTimezone))]])).rows;
      const today = new Map(localDates.map(row => [row.zone as string, row.local_date as string]));
      const future = rows.filter(row => row.date >= today.get(row.resourceTimezone)!);
      return { demand, rows, future };
    });
    if (!prepared.future.length) return readAllocationProjection(actor, allocationId);
    const overlap = prepared.demand.demand?.overlap ? resolveStaffingOverlap(prepared.demand.demand.overlap) : [];
    return await withTransaction(async db => {
      await lockStaffingActor(db, actor, "operational");
      const resourceIds = [...new Set(prepared.future.map(row => row.resourceId))].sort();
      const feasible = await staffingFeasibilitySnapshot(db, actor, first.demandId, prepared.demand, overlap, {
        resourceIds, days: prepared.future.map(row => ({ date: row.date, requiredMinutes: row.minutes })), credits: prepared.rows });
      // Reject changed identities before the ordinary projection could discover
      // a new earlier-order resource/source lock after this prefix was acquired.
      const current = (await db.query(`SELECT current_revision_id,confirmed_revision_id,aggregate_version FROM staffing_allocations
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE`,
        [allocationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
      if (!current || current.current_revision_id !== first.revisionId || current.confirmed_revision_id !== first.confirmedRevisionId || Number(current.aggregate_version) !== first.aggregateVersion ||
        staffingSha256(await readConfirmedAllocationLedger(db, actor, allocationId)) !== staffingSha256(prepared.rows)) throw new HttpFailure(409, "version_conflict", "Allocation changed; reload");
      const projection = await readAllocationProjection(actor, allocationId, db);
      const needsReview = projection.reviewRequired || feasible.matches.some(match => match.status !== "eligible");
      return { ...(needsReview ? annotate(projection) : projection), asOf: feasible.asOf };
    });
  } catch (error) {
    if (error instanceof HttpFailure && (error.status === 409 || error.code === "staffing_calendar_unavailable")) {
      return annotate(await readAllocationProjection(actor, allocationId));
    }
    throw error;
  }
}

export async function listAllocations(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingAllocationListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational", { customerId: input.customerId });
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "allocation-identities", customer: input.customerId,
      demand: input.demandId ?? null, resource: input.resourceId ?? null };
    const after = readStaffingPageCursor(input.cursor, scope);
    const rows = (await db.query(`SELECT id,demand_id,resource_id,current_revision_id,confirmed_revision_id,aggregate_version,state
      FROM staffing_allocations WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
      AND ($4::uuid IS NULL OR demand_id=$4) AND ($5::uuid IS NULL OR resource_id=$5) AND ($6::uuid IS NULL OR id>$6)
      ORDER BY id LIMIT $7 FOR SHARE`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.customerId,
      input.demandId ?? null, input.resourceId ?? null, after, input.pageSize + 1])).rows;
    const page = rows.slice(0, input.pageSize);
    return { items: page.map(row => ({ allocationId: row.id as string, demandId: row.demand_id as string,
      resourceId: row.resource_id as string, revisionId: row.current_revision_id as string,
      confirmedRevisionId: row.confirmed_revision_id as string | null, aggregateVersion: Number(row.aggregate_version), state: row.state as string })),
      nextCursor: rows.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return client ? run(client) : withTransaction(run);
}
