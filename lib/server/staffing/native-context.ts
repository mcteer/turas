import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingInitialContextSchema, staffingContextInstruction } from "../../staffing/advice-context";
import { staffingIdSchema } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { staffingScopeForConversation } from "./context";
import { boundStaffingToolActor, type StaffingActorReleaseOptions } from "./tool-actor";
import { resolveStaffingAdvisoryFence } from "./fences";
import { resolveStaffingOverlap } from "./temporal";
import { staffingSha256 } from "./commands";

type Principal = Parameters<typeof boundStaffingToolActor>[1];
const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");

/** Binding metadata only. It never assembles a default internal snapshot. */
export async function staffingResponseScope(principal: Principal) {
  if (!staffingIdSchema.safeParse(principal?.principalId).success ||
    !staffingIdSchema.safeParse(principal?.attributes?.turasAttemptId).success) return null;
  return withTransaction(async db => {
    const row = (await db.query(`SELECT a.conversation_id FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
      WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3`,
      [principal!.attributes!.turasAttemptId, principal!.principalId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    return row ? staffingScopeForConversation(db, row.conversation_id) : null;
  });
}

/** Prepare only the strict zoned overlap outside the final release transaction. */
export async function prepareStaffingNativeFence(principal: Principal, options: StaffingActorReleaseOptions = {}) {
  const bound = await withTransaction(db => boundStaffingToolActor(db, principal, undefined, options));
  return { attemptId: bound.attemptId, preparedOverlap: { revisionId: bound.demand.revisionId,
    contentDigest: bound.demand.contentDigest,
    intervals: bound.demand.demand?.overlap ? resolveStaffingOverlap(bound.demand.demand.overlap) : [] } };
}

/** Read the previously charged snapshot only after current authority and the
 * entire dependency union have been fenced. An exact injection replay adds no
 * second context charge; it cannot replace the original expiry or snapshot. */
export async function readStaffingInitialContext(principal: Principal, turnId: string, nativeSessionId: string, recordInjection = true) {
  if (!turnId || turnId.length > 200) throw hiddenRecord();
  const options = { release: true, incomingTurnId: turnId, allowUnclaimedTurn: true };
  const prepared = await prepareStaffingNativeFence(principal, options);
  return withTransaction(async db => {
    const bound = await boundStaffingToolActor(db, principal, async (client, attemptId, context) => {
      if (attemptId !== prepared.attemptId) throw changed();
      await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap: prepared.preparedOverlap });
    }, options);
    if (bound.nativeTurnId !== turnId) throw hiddenRecord();
    const session = (await db.query("SELECT eve_session_id FROM conversations WHERE id=$1", [bound.scope.conversationId])).rows[0];
    if (!session || session.eve_session_id !== nativeSessionId) throw hiddenRecord();
    const charged = await readChargedStaffingSnapshot(db, bound), { snapshot } = charged;
    if (recordInjection) await db.query(`INSERT INTO context_injection_receipts(attempt_id,turn_id,snapshot_digest)
      VALUES($1,$2,$3) ON CONFLICT(attempt_id,turn_id) DO NOTHING`, [bound.responseAttemptId, turnId, charged.digest]);
    const injected = (await db.query("SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2",
      [bound.responseAttemptId, turnId])).rows[0];
    if (injected?.snapshot_digest !== charged.digest) throw changed();
    const release = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (charged.validUntil.getTime() <= release.getTime() || bound.deadlineAt.getTime() <= release.getTime() ||
      bound.actor.expiresAt.getTime() <= release.getTime()) throw changed();
    return snapshot;
  });
}

/** Internal read only after the complete source fence and attempt mutex. */
export async function readChargedStaffingSnapshot(db: PoolClient, bound: Awaited<ReturnType<typeof boundStaffingToolActor>>) {
    const receipt = (await db.query(`SELECT snapshot,snapshot_digest,customer_id,owner_principal_id,login_session_id,
      membership_id,workspace_id,environment_id,audience,generation,valid_until FROM context_snapshot_receipts
      WHERE attempt_id=$1 AND conversation_id=$2 FOR SHARE`, [bound.responseAttemptId, bound.scope.conversationId])).rows[0];
    if (!receipt || receipt.customer_id !== bound.scope.customerId || receipt.owner_principal_id !== bound.actor.principalId ||
      receipt.login_session_id !== bound.actor.sessionId || receipt.membership_id !== bound.actor.membershipId ||
      receipt.workspace_id !== bound.actor.workspaceId || receipt.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      receipt.audience !== "delivery" || receipt.generation !== bound.deliveryContext.contextVersion) throw changed();
    const snapshot = staffingInitialContextSchema.parse(receipt.snapshot);
    if (staffingSha256(snapshot) !== receipt.snapshot_digest || snapshot.customer.id !== bound.scope.customerId ||
      snapshot.staffing.mode !== bound.scope.mode || snapshot.staffing.scenarioId !== bound.scope.scenarioId ||
      snapshot.staffing.demandId !== bound.scope.demandId || snapshot.staffing.demandRevisionId !== bound.scope.demandRevisionId) throw changed();
    const kinds = new Set((await db.query("SELECT kind FROM staffing_advisory_dependencies WHERE attempt_id=$1", [bound.attemptId])).rows.map(row => row.kind));
    if (["customer", "baseline", "demand"].some(kind => !kinds.has(kind))) throw changed();
    if (!bound.consumedDependenciesFenced || bound.counters.contextBytes < Buffer.byteLength(staffingContextInstruction(snapshot), "utf8")) throw changed();
    const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (receipt.valid_until.getTime() <= now.getTime() || Date.parse(snapshot.validUntil) <= now.getTime() ||
      bound.deadlineAt.getTime() <= now.getTime() || bound.actor.expiresAt.getTime() <= now.getTime()) throw changed();
    return { snapshot, digest: receipt.snapshot_digest as string, validUntil: receipt.valid_until as Date };
}
