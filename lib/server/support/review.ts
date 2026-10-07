import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { supportActionSchema, supportAssessmentSchema } from "../../contracts/support";
import { getServerConfig } from "../config";
import { lockSupportActor, checkSupportReviewAdmission, requireSupportCapability, type SupportActor } from "./policy";
import { supportScope, supportRevisionSources, requireSupportEnvironment, incrementSupportScope } from "./repository";
import { supportTransaction } from "./service";
import { supportCommandSchema, supportSourcesSchema, type SupportCommand } from "./schema";
import { supportDigest, lockAndReadSupportReceipt, supportReceiptForCommand, enforceSupportRate, type SupportReceipt } from "./commands";
import { verifySupportSources } from "./sources";
import { assessPlanEvidence } from "../plans/sources";
import { validateSupportAction } from "./actions";
import { validateSupportEscalationAcceptance } from "./escalation";
import { getRuntimePool } from "../db/client";

type DecisionCommand = Extract<SupportCommand, { operation: "review_revision" | "withdraw_record" }>;
type Target = { scopeId: string; audience: "internal" | "delivery"; kind: "assessment" | "action";
  version: number; currentRevisionId: string | null; acceptedRevisionId: string | null;
   selected: string[]; content: unknown; contentDigest: string; sourceStateDigest: string;
   sources: ReturnType<typeof supportSourcesSchema.parse>; invalidated: boolean };

async function target(db: PoolClient, actor: SupportActor, customerId: string, workloadId: string | null,
  recordId: string, revisionId: string): Promise<Target> {
  const row = (await db.query(`SELECT r.scope_id,r.audience,r.kind,r.version,r.current_revision_id,r.accepted_revision_id,
        v.selected_engagement_ids,v.content_digest,v.source_state_digest,p.content,
        EXISTS(SELECT 1 FROM support_invalidations i WHERE i.revision_id=v.id) AS invalidated,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.source_key,'kind',d.source_kind,
          'sourceRevisionId',d.source_revision_id,'generation',d.generation,'contentDigest',d.content_digest)
          || CASE WHEN d.locator IS NOT NULL THEN jsonb_build_object('locator',d.locator)
            ELSE jsonb_build_object('engagementId',d.engagement_id) END ORDER BY d.source_kind,d.source_revision_id)
          FROM support_source_dependencies d WHERE d.revision_id=v.id),'[]'::jsonb) AS sources
        FROM support_records r JOIN support_scopes s ON s.id=r.scope_id
      JOIN support_revisions v ON v.record_id=r.id AND v.id=$2 LEFT JOIN support_payloads p ON p.revision_id=v.id
      WHERE r.id=$1 AND r.environment_id=$3 AND r.workspace_id=$4 AND r.customer_id=$5
      AND s.workload_id IS NOT DISTINCT FROM $6::uuid`,
    [recordId, revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, workloadId])).rows[0];
  if (!row) throw hiddenRecord();
  return { scopeId: row.scope_id, audience: row.audience, kind: row.kind, version: Number(row.version),
    currentRevisionId: row.current_revision_id, acceptedRevisionId: row.accepted_revision_id,
     selected: row.selected_engagement_ids, content: row.content, contentDigest: row.content_digest, sourceStateDigest: row.source_state_digest,
     sources: supportSourcesSchema.parse(row.sources), invalidated: row.invalidated };
}

async function currentSourceState(db: PoolClient, actor: SupportActor, customerId: string, workloadId: string | null,
  revisionId: string, row: Target, lock: boolean) {
  const refs = row.sources;
  try {
    if (!row.content || supportDigest(row.content) !== row.contentDigest)
      throw new HttpFailure(409, "source_changed", "Support content unavailable");
    if (row.invalidated)
      throw new HttpFailure(409, "source_changed", "Support content invalidated");
    const digest = await verifySupportSources(db, actor, customerId, workloadId, row.audience, row.selected, refs, lock);
    if (digest !== row.sourceStateDigest) throw new HttpFailure(409, "source_changed", "Selected support inputs changed");
    return { digest, available: true, refs };
  } catch (error) {
    if (!(error instanceof HttpFailure) || ![403, 404, 409].includes(error.status)) throw error;
    return { digest: supportDigest({ unavailable: true, revisionId, refs }), available: false, refs };
  }
}

export async function createSupportReviewPreview(actor: SupportActor, customerId: string, input: {
  workloadId: string | null; recordId: string; revisionId: string;
}) {
  // Commit quota admission promptly: holding its shared reviewer row throughout
  // source validation serializes otherwise independent customer previews. Live
  // authority is checked before admission and again before preview retrieval.
  await checkSupportReviewAdmission(getRuntimePool(), actor, customerId);
  // A single atomic capped UPSERT commits admission without holding the shared
  // quota row across content work. Denied admissions cannot grow the counter.
  await enforceSupportRate(getRuntimePool(), actor, "write");
  return supportTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "review", "internal");
    const row = await target(db, actor, customerId, input.workloadId, input.recordId, input.revisionId);
    const sources = await currentSourceState(db, actor, customerId, input.workloadId, input.revisionId, row, true);
    // Originals/engagements are locked above; acquire the support scope last.
    // Validate its workload and reread the exact record version in that same SQL
    // statement rather than issuing three sequential metadata reads.
    const current = (await db.query(`SELECT r.version FROM support_scopes s
      JOIN support_records r ON r.scope_id=s.id AND r.id=$2
      WHERE s.id=$1 AND s.environment_id=$3 AND s.workspace_id=$4 AND s.customer_id=$5
        AND s.workload_id IS NOT DISTINCT FROM $6::uuid
        AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM customer_workloads w
          WHERE w.id=$6 AND w.workspace_id=$4 AND w.customer_id=$5 AND w.lifecycle='active'))
      FOR UPDATE OF s`, [row.scopeId, input.recordId, getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId, customerId, input.workloadId])).rows[0];
    if (!current) throw hiddenRecord();
    if (Number(current.version) !== row.version) throw new HttpFailure(409, "version_conflict", "Support record changed; refresh preview");
    const id = randomUUID(), expiresAt = new Date(Date.now() + 300_000);
    const digest = supportDigest({ id, recordId: input.recordId, revisionId: input.revisionId,
      version: row.version, sourceDigest: sources.digest, expiresAt: expiresAt.toISOString() });
    await db.query(`INSERT INTO support_review_previews(id,record_id,revision_id,actor_membership_id,workspace_id,
      expected_version,source_digest,preview_digest,source_state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, input.recordId, input.revisionId, actor.membershipId, actor.workspaceId, row.version, sources.digest, digest,
      sources.available ? "current" : "unavailable", expiresAt]);
    return { sourceDigest: digest, expectedVersion: row.version, expiresAt: expiresAt.toISOString(),
      content: sources.available ? row.content : null, sourceState: sources.available ? "current" : "unavailable" };
  });
}

export async function decideSupportRevision(actor: SupportActor, customerId: string, raw: unknown): Promise<SupportReceipt> {
  const command = supportCommandSchema.parse(raw);
  if (command.operation !== "review_revision" && command.operation !== "withdraw_record")
    throw new HttpFailure(422, "unsupported_action", "Exact support decision required");
  // Quota classification only: no command admission, retained authority or result
  // is granted here. The decision transaction below always takes the command
  // mutex and checks expiration/replay again after acquiring live authority.
  // A concurrent completion/cleanup can change which quota is charged, never
  // whether the command is executed or an expired key is reused.
  await checkSupportReviewAdmission(getRuntimePool(), actor, customerId, { newWork: false });
  const replay = Boolean(await supportReceiptForCommand(getRuntimePool(), actor, customerId, command.requestKey,
    supportDigest({ customerId, command })));
  if (!replay && process.env.TURAS_010_DISABLED === "1")
    throw new HttpFailure(503, "feature_disabled", "New support work is temporarily unavailable");
  await enforceSupportRate(getRuntimePool(), actor, replay ? "read" : "write");
  // This preflight grants no authority fence or command result. Reacquire the
  // command mutex, live authority and exact receipt/source state below.
  return supportTransaction(db => decide(db, actor, customerId, command));
}

async function decide(db: PoolClient, actor: SupportActor, customerId: string, command: DecisionCommand): Promise<SupportReceipt> {
  await lockSupportActor(db, actor, customerId, "read", "internal");
  requireSupportCapability(actor, "review");
  const requestDigest = supportDigest({ customerId, command });
  const prior = await lockAndReadSupportReceipt(db, actor, customerId, command.requestKey, requestDigest);
  if (prior) return prior;
  await requireSupportEnvironment(db, true);
  const row = await target(db, actor, customerId, command.workloadId, command.recordId, command.revisionId);
  const sources = await currentSourceState(db, actor, customerId, command.workloadId, command.revisionId, row, true);
  const currentRow = (await db.query(`WITH locked_scope AS MATERIALIZED (
      SELECT s.id FROM support_scopes s WHERE s.id=$1 AND s.environment_id=$3 AND s.workspace_id=$4
        AND s.customer_id=$5 AND s.workload_id IS NOT DISTINCT FROM $6::uuid
        AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM customer_workloads w
          WHERE w.id=$6 AND w.workspace_id=$4 AND w.customer_id=$5 AND w.lifecycle='active')) FOR UPDATE OF s)
    SELECT r.version,r.accepted_revision_id,r.current_revision_id FROM locked_scope s
      JOIN support_records r ON r.scope_id=s.id AND r.id=$2 FOR UPDATE OF r`,
  [row.scopeId, command.recordId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, command.workloadId])).rows[0];
  if (!currentRow) throw hiddenRecord();
  const current = { version: Number(currentRow.version), acceptedRevisionId: currentRow.accepted_revision_id,
    currentRevisionId: currentRow.current_revision_id };
  const decision = command.operation === "withdraw_record" ? "withdraw" : command.decision;
  const head = decision === "withdraw" ? current.acceptedRevisionId : current.currentRevisionId;
  if (current.version !== command.expectedVersion || head !== command.revisionId)
    throw new HttpFailure(409, "version_conflict", "Support record changed; refresh before review");
  const preview = (await db.query(`SELECT source_digest,source_state FROM support_review_previews
    WHERE preview_digest=$1 AND record_id=$2 AND revision_id=$3 AND actor_membership_id=$4
      AND workspace_id=$5 AND expected_version=$6 AND expires_at>now()`,
  [command.sourceDigest, command.recordId, command.revisionId, actor.membershipId, actor.workspaceId, command.expectedVersion])).rows[0];
  if (!preview || preview.source_digest !== sources.digest || preview.source_state !== (sources.available ? "current" : "unavailable"))
    throw new HttpFailure(409, "preview_changed", "Review preview changed or expired; refresh it");
  if (decision === "accept") {
    if (!sources.available) throw new HttpFailure(409, "source_changed", "Support evidence is unavailable");
    const content = row.kind === "assessment" ? supportAssessmentSchema.parse(row.content) : supportActionSchema.parse(row.content);
    if ("disposition" in content) {
      await validateSupportAction(db, actor, customerId, content, sources.refs, command.recordId,
        { workloadId: command.workloadId, audience: row.audience });
      validateSupportEscalationAcceptance(content, sources.refs);
    }
    const critical = "checks" in content ? content.checks.filter(check => ["ready", "gap"].includes(check.status)).flatMap(check => check.sourceKeys)
      : [...content.outcomeSourceKeys, ...(content.handoff?.supportingSourceKeys ?? []),
        ...(content.escalation?.routeKnown ? sources.refs.map(ref => ref.id) : [])];
    const originals = sources.refs.filter(ref => "locator" in ref);
    const assessment = await assessPlanEvidence(db, actor, customerId, { sourceDependencies: originals,
      assertions: critical.filter(id => originals.some(ref => ref.id === id)).map((id, index) => ({ key: `support_${index}`,
        kind: "accepted_fact" as const, text: "Decision-critical support judgment", sourceDependencyIds: [id], decisionCritical: true })) });
    if (assessment.issues.length) throw new HttpFailure(422, "evidence_insufficient", "Verify decision-critical support evidence before acceptance");
  }
  const decisionId = randomUUID();
  const outcome = decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "withdrawn";
  const receipt: SupportReceipt = { id: randomUUID(), operation: command.operation, scopeId: row.scopeId,
    recordId: command.recordId, revisionId: command.revisionId, decisionId, outcome };
  await db.query(`WITH decision AS (
    INSERT INTO support_review_decisions(id,record_id,revision_id,actor_membership_id,workspace_id,
      decision,source_digest,expected_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id),
    rationale AS (
      INSERT INTO support_decision_payloads(decision_id,rationale) SELECT id,$9 FROM decision RETURNING decision_id),
    changed AS (
      UPDATE support_records SET version=version+1,state=$10,
        accepted_revision_id=CASE WHEN $10='accepted' THEN $3::uuid WHEN $10='withdrawn' THEN NULL ELSE accepted_revision_id END
        WHERE id=$2 AND EXISTS(SELECT 1 FROM rationale) RETURNING scope_id),
    advanced AS (
      UPDATE support_scopes SET generation=generation+1,updated_at=now()
        WHERE id IN(SELECT scope_id FROM changed) RETURNING id)
    INSERT INTO support_command_receipts(id,environment_id,workspace_id,actor_membership_id,request_key,request_digest,
      operation,scope_id,record_id,revision_id,decision_id,outcome)
      SELECT $11,$12,$5,$4,$13,$14,$15,id,$2,$3,$1,$10 FROM advanced`,
  [decisionId, command.recordId, command.revisionId, actor.membershipId, actor.workspaceId, decision, sources.digest,
    command.expectedVersion, command.rationale, outcome, receipt.id, getServerConfig().TURAS_ENVIRONMENT_ID,
    command.requestKey, requestDigest, command.operation]);
  if (decision === "withdraw") await db.query("INSERT INTO support_invalidations(revision_id,cause_generation) VALUES($1,$2) ON CONFLICT DO NOTHING", [command.revisionId, current.version + 1]);
  return receipt;
}
