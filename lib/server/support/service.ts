import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { supportTemporalIssues } from "../../contracts/support";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { isSupportReviewer, lockSupportActor, requireSupportCapability, type SupportActor } from "./policy";
import { requireSupportEnvironment, supportScope, incrementSupportScope } from "./repository";
import { supportCommandSchema, type SupportCommand } from "./schema";
import { verifySupportSources, dependencyUnion } from "./sources";
import { supportDigest, lockSupportCommandKey, supportReceiptForCommand, enforceSupportRate, type SupportReceipt } from "./commands";
import { validateSupportAction } from "./actions";

export async function supportTransaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await withTransaction(run); }
    catch (error) {
      if (attempt >= 2 || !["40001", "40P01"].includes(String((error as { code?: unknown }).code))) throw error;
    }
  }
}

type SaveCommand = Extract<SupportCommand, { operation: "save_assessment" | "save_action" }>;

/** Draft saving accepts no facts or dispositions. All decisions have a separate exact-review path. */
export async function saveSupportProposal(actor: SupportActor, customerId: string, raw: unknown): Promise<SupportReceipt> {
  const command = supportCommandSchema.parse(raw);
  if (command.operation !== "save_assessment" && command.operation !== "save_action")
    throw new HttpFailure(422, "unsupported_action", "Use the exact support decision workflow");
  return supportTransaction(db => saveProposal(db, actor, customerId, command));
}

export async function saveProposal(db: PoolClient, actor: SupportActor, customerId: string, command: SaveCommand,
  receiptIdentity?: { requestDigest: string; operation: "save_suggestion" }): Promise<SupportReceipt> {
  const ownerMembership = "owner" in command.content && command.content.owner.kind === "membership" ? command.content.owner.membershipId : undefined;
  await lockSupportActor(db, actor, customerId, "read", command.audience, ownerMembership);
  requireSupportCapability(actor, "propose");
  await lockSupportCommandKey(db, actor, command.requestKey);
  const requestDigest = receiptIdentity?.requestDigest ?? supportDigest({ customerId, command });
  const prior = await supportReceiptForCommand(db, actor, customerId, command.requestKey, requestDigest);
  if (prior) { await enforceSupportRate(db, actor, "read"); return prior; }
  await requireSupportEnvironment(db, true);
  await enforceSupportRate(db, actor, "write");
  if (supportTemporalIssues(command.content, Temporal.Now.instant()).length)
    throw new HttpFailure(422, "invalid_date", "Support observations cannot be future dated");
  const sourceKeys = new Set(command.sourceRefs.map(ref => ref.id));
  const linkedKeys = "checks" in command.content ? command.content.checks.flatMap(check => check.sourceKeys) :
    [...command.content.outcomeSourceKeys, ...(command.content.handoff?.supportingSourceKeys ?? []),
      ...(command.content.owner.kind === "customer_role" ? [command.content.owner.sourceKey] : [])];
  if (linkedKeys.some(key => !sourceKeys.has(key))) throw new HttpFailure(422, "invalid_source", "Choose exact support sources");
  const sourceStateDigest = await verifySupportSources(db, actor, customerId, command.workloadId, command.audience,
    command.selectedEngagementIds, command.sourceRefs, true);
  if ("disposition" in command.content) await validateSupportAction(db, actor, customerId, command.content, command.sourceRefs,
    command.recordId, { workloadId: command.workloadId, audience: command.audience });
  const scope = await supportScope(db, actor, customerId, command.workloadId, { create: true, lock: true });
  if (!scope) throw hiddenRecord();
  const kind = command.operation === "save_assessment" ? "assessment" : "action";
  let recordId = command.recordId, ordinal = 1;
  if (recordId) {
    const row = (await db.query(`SELECT r.*,v.author_membership_id AS current_author FROM support_records r
      LEFT JOIN support_revisions v ON v.id=r.current_revision_id WHERE r.id=$1 AND r.scope_id=$2 FOR UPDATE OF r`, [recordId, scope.id])).rows[0];
    if (!row || row.audience !== command.audience || row.kind !== kind) throw hiddenRecord();
    if (Number(row.version) !== command.expectedVersion) throw new HttpFailure(409, "version_conflict", "Support record changed; refresh before saving");
    if (!isSupportReviewer(actor) && row.current_revision_id !== row.accepted_revision_id &&
      row.state === "proposed" && row.current_author !== actor.membershipId) throw hiddenRecord();
    ordinal = Number((await db.query("SELECT COALESCE(max(ordinal),0)+1 AS ordinal FROM support_revisions WHERE record_id=$1", [recordId])).rows[0].ordinal);
  } else {
    if ("disposition" in command.content && command.content.disposition !== "open")
      throw new HttpFailure(422, "invalid_disposition", "A new proposed action must be open");
    if (command.expectedVersion !== 0) throw new HttpFailure(409, "version_conflict", "New support record requires version zero");
    if (kind === "assessment" && (await db.query("SELECT 1 FROM support_records WHERE scope_id=$1 AND kind='assessment' AND audience=$2", [scope.id, command.audience])).rowCount)
      throw new HttpFailure(409, "version_conflict", "An assessment already exists; revise its exact record");
    recordId = randomUUID();
    await db.query(`INSERT INTO support_records(id,scope_id,environment_id,workspace_id,customer_id,kind,audience,author_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [recordId, scope.id, getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId, customerId, kind, command.audience, actor.membershipId]);
  }
  const revisionId = randomUUID(), contentDigest = supportDigest(command.content);
  await db.query(`INSERT INTO support_revisions(id,record_id,scope_id,author_membership_id,workspace_id,ordinal,content_digest,contract_version,selected_engagement_ids,source_state_digest,disposition)
    VALUES($1,$2,$3,$4,$5,$6,$7,'support-v1',$8,$9,$10)`, [revisionId, recordId, scope.id, actor.membershipId, actor.workspaceId, ordinal, contentDigest, command.selectedEngagementIds, sourceStateDigest,
    "disposition" in command.content ? command.content.disposition : null]);
  await db.query("INSERT INTO support_payloads(revision_id,content_digest,content) VALUES($1,$2,$3::jsonb)", [revisionId, contentDigest, JSON.stringify(command.content)]);
  for (const dependency of await dependencyUnion(db, actor, customerId, command.sourceRefs))
    await db.query("INSERT INTO support_private_dependencies(revision_id,source_kind,source_revision_id) VALUES($1,$2,$3)",
      [revisionId, dependency.kind, dependency.revisionId]);
  for (const ref of command.sourceRefs) await db.query(`INSERT INTO support_source_dependencies
    (revision_id,source_key,source_kind,source_id,source_revision_id,generation,content_digest,locator,engagement_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [revisionId, ref.id, ref.kind, ref.id, ref.sourceRevisionId, ref.generation,
    ref.contentDigest, "locator" in ref ? JSON.stringify(ref.locator) : null, "engagementId" in ref ? ref.engagementId : null]);
  await db.query("UPDATE support_records SET current_revision_id=$2,state='proposed',version=$3 WHERE id=$1", [recordId, revisionId, command.expectedVersion + 1]);
  await incrementSupportScope(db, scope.id);
  const receipt: SupportReceipt = { id: randomUUID(), operation: receiptIdentity?.operation ?? command.operation, scopeId: scope.id,
    recordId, revisionId, decisionId: null, outcome: "proposed" };
  await db.query(`INSERT INTO support_command_receipts(id,environment_id,workspace_id,actor_membership_id,request_key,request_digest,
    operation,scope_id,record_id,revision_id,outcome) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'proposed')`,
  [receipt.id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, command.requestKey,
    requestDigest, receiptIdentity?.operation ?? command.operation, scope.id, recordId, revisionId]);
  return receipt;
}
