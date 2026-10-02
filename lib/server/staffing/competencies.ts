import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { workforceManualAssessmentSchema, workforceCorrectAssessmentSchema, workforceReviewSchema } from "../../contracts/staffing-imports";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import { lockResourceHeads } from "./resources";
import type { StaffingActor } from "./policy";

type CandidateIdentity = { id: string; competency_id: string; resource_id: string; skill_id: string;
  source_version_id: string | null; source_id: string | null; manual_evidence_id: string | null;
  source_generation: string; extraction_id: string | null; mapping_revision_id: string | null;
  row_key: string; content_digest: string; assessment_date: string };
type Assessment = { resourceId: string; skillId: string; level: number; assessmentDate: string;
  nextReviewDate: string; evidence: string };

export async function discoverCandidates(db: PoolClient, actor: StaffingActor, revisionIds: string[]) {
  const result = await db.query<CandidateIdentity>(`SELECT r.id,r.competency_id,c.resource_id,c.skill_id,
    r.source_version_id,v.source_id,r.manual_evidence_id,r.source_generation,r.extraction_id,
    r.mapping_revision_id,r.row_key,r.content_digest,r.assessment_date::text
    FROM workforce_competency_revisions r JOIN workforce_competencies c ON c.id=r.competency_id
    LEFT JOIN workforce_source_versions v ON v.id=r.source_version_id
    WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.id=ANY($3::uuid[])`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, revisionIds]);
  if (result.rowCount !== new Set(revisionIds).size) throw hiddenRecord();
  return result.rows;
}

/** Source headers precede competency/resource heads; no personnel payload is read here. */
export async function lockCandidateSources(db: PoolClient, actor: StaffingActor, candidates: CandidateIdentity[],
  allowRetired = false, requireCurrentMapping = false) {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  for (const kind of ["manual", "import"] as const) {
    const ids = [...new Set(candidates.map(c => kind === "manual" ? c.manual_evidence_id : c.source_id)
      .filter((v): v is string => Boolean(v)))].sort();
    if (!ids.length) continue;
    const table = kind === "manual" ? "workforce_manual_evidence" : "workforce_sources";
    const sources = await db.query<{ id: string; generation: string; state: string; current_version_id?: string }>(
      `SELECT id,generation,state${kind === "import" ? ",current_version_id" : ""} FROM ${table}
        WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR SHARE`,
      [environmentId, actor.workspaceId, ids]);
    if (sources.rowCount !== ids.length) throw hiddenRecord();
    if (allowRetired) continue;
    for (const candidate of candidates) {
      const id = kind === "manual" ? candidate.manual_evidence_id : candidate.source_id;
      if (!id) continue;
      const source = sources.rows.find(s => s.id === id)!;
      if (source.generation !== candidate.source_generation || (kind === "manual" ? source.state !== "active" :
        !["ready", "reviewed"].includes(source.state) || source.current_version_id !== candidate.source_version_id)) {
        throw new HttpFailure(409, "source_changed", "Evidence source changed");
      }
      if (kind === "import") {
        const extraction = await db.query(`SELECT id FROM workforce_extractions WHERE id=$1 AND source_version_id=$2
          AND complete AND scan_clean`, [candidate.extraction_id, candidate.source_version_id]);
        if (!extraction.rowCount) throw new HttpFailure(409, "source_changed", "Complete reviewed extraction required");
        if (requireCurrentMapping) {
          const current = (await db.query("SELECT id FROM workforce_mapping_revisions WHERE source_version_id=$1 ORDER BY revision_number DESC LIMIT 1", [candidate.source_version_id])).rows[0];
          if (current?.id !== candidate.mapping_revision_id) throw new HttpFailure(409, "source_changed", "Mapping changed; reload");
        }
      }
    }
  }
}
export async function lockSkills(db: PoolClient, actor: StaffingActor, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  const rows = await db.query(`SELECT id,active FROM workforce_skills WHERE environment_id=$1 AND workspace_id=$2
    AND id=ANY($3::uuid[]) ORDER BY id FOR SHARE`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, unique]);
  if (rows.rowCount !== unique.length) throw hiddenRecord();
  if (rows.rows.some(r => !r.active)) throw new HttpFailure(409, "source_changed", "Skill is retired");
}
export async function validateAssessmentDate(db: PoolClient, resourceId: string, date: string) {
  const profile = (await db.query(`SELECT p.timezone FROM workforce_resources r
    JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id WHERE r.id=$1`, [resourceId])).rows[0];
  if (!profile) throw hiddenRecord();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone,
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (date > today) throw new HttpFailure(422, "invalid_input", "Assessment cannot be future-dated");
}
async function createManualEvidence(db: PoolClient, actor: StaffingActor) {
  const id = randomUUID();
  await db.query(`INSERT INTO workforce_manual_evidence(id,environment_id,workspace_id,state,actor_membership_id)
    VALUES($1,$2,$3,'active',$4)`, [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId]);
  return id;
}
async function appendCandidate(db: PoolClient, actor: StaffingActor, competencyId: string, version: number,
  assessment: Assessment, lineage: { sourceVersionId: string | null; manualEvidenceId: string | null;
    generation: number; extractionId: string | null; mappingRevisionId: string | null; rowKey: string; locators: unknown[] }) {
  const revisionId = randomUUID();
  const contentDigest = staffingSha256({ resourceId: assessment.resourceId, skillId: assessment.skillId,
    level: assessment.level, assessmentDate: assessment.assessmentDate, nextReviewDate: assessment.nextReviewDate,
    evidence: assessment.evidence, ...lineage });
  await db.query(`INSERT INTO workforce_competency_revisions(id,environment_id,workspace_id,competency_id,
    revision_number,level,assessment_date,next_review_date,source_version_id,manual_evidence_id,source_generation,
    extraction_id,mapping_revision_id,row_key,content_digest,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, competencyId, version, assessment.level,
      assessment.assessmentDate, assessment.nextReviewDate, lineage.sourceVersionId, lineage.manualEvidenceId,
      lineage.generation, lineage.extractionId, lineage.mappingRevisionId, lineage.rowKey, contentDigest, actor.membershipId]);
  await db.query("INSERT INTO workforce_competency_payloads(revision_id,evidence,locators) VALUES($1,$2,$3)",
    [revisionId, assessment.evidence, JSON.stringify(lineage.locators)]);
  await db.query("UPDATE workforce_competencies SET current_pending_revision_id=$2,aggregate_version=$3 WHERE id=$1",
    [competencyId, revisionId, version]);
  return { competencyId, revisionId, contentDigest, generation: lineage.generation, aggregateVersion: version, state: "pending" };
}
export async function createManualAssessment(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(workforceManualAssessmentSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "competency_manual" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const manualEvidenceId = await createManualEvidence(db, actor);
      await lockSkills(db, actor, [input.skillId]);
      if (!(await db.query("SELECT id FROM workforce_resources WHERE id=$1 AND environment_id=$2 AND workspace_id=$3",
        [input.resourceId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rowCount) throw hiddenRecord();
      await db.query(`INSERT INTO workforce_competencies(id,environment_id,workspace_id,resource_id,skill_id)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(resource_id,skill_id) DO NOTHING`,
        [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.resourceId, input.skillId]);
      const head = (await db.query(`SELECT id,aggregate_version,current_pending_revision_id,current_accepted_revision_id
        FROM workforce_competencies WHERE resource_id=$1 AND skill_id=$2 AND environment_id=$3 AND workspace_id=$4 FOR UPDATE`,
        [input.resourceId, input.skillId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
      if (!head) throw hiddenRecord();
      if (head.current_pending_revision_id) throw new HttpFailure(409, "version_conflict", "Pending assessment already exists");
      const [resource] = await lockResourceHeads(db, actor, [input.resourceId], "UPDATE");
      if (!resource.active) throw new HttpFailure(409, "source_changed", "Resource is inactive");
      await validateAssessmentDate(db, input.resourceId, input.assessmentDate);
      return appendCandidate(db, actor, head.id, Number(head.aggregate_version) + (head.current_accepted_revision_id ? 1 : 0), input,
        { sourceVersionId: null, manualEvidenceId, generation: 1, extractionId: null, mappingRevisionId: null,
          rowKey: manualEvidenceId, locators: [] });
    }, client);
}
export async function correctAssessment(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const competencyId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(workforceCorrectAssessmentSchema, raw);
  return runStaffingCommand(actor, { ...input, competencyId, action: "competency_correct" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const [old] = await discoverCandidates(db, actor, [input.revisionId]);
      if (old.competency_id !== competencyId || old.resource_id !== input.resourceId || old.skill_id !== input.skillId) throw hiddenRecord();
      await lockCandidateSources(db, actor, [old]);
      const manualEvidenceId = old.manual_evidence_id ? await createManualEvidence(db, actor) : null;
      await lockSkills(db, actor, [old.skill_id]);
      const head = (await db.query("SELECT aggregate_version,current_pending_revision_id,current_accepted_revision_id FROM workforce_competencies WHERE id=$1 FOR UPDATE", [competencyId])).rows[0];
      if (Number(head.aggregate_version) !== input.expectedAggregateVersion || old.content_digest !== input.contentDigest ||
        (head.current_pending_revision_id ?? head.current_accepted_revision_id) !== input.revisionId) {
        throw new HttpFailure(409, "version_conflict", "Assessment changed; reload");
      }
      const [resource] = await lockResourceHeads(db, actor, [old.resource_id], "UPDATE");
      if (!resource.active) throw new HttpFailure(409, "source_changed", "Resource is inactive");
      await validateAssessmentDate(db, old.resource_id, input.assessmentDate);
      const prior = (await db.query("SELECT locators FROM workforce_competency_payloads WHERE revision_id=$1 FOR SHARE", [old.id])).rows[0];
      if (!prior) throw new HttpFailure(409, "source_changed", "Evidence unavailable");
      return appendCandidate(db, actor, competencyId, input.expectedAggregateVersion + 1, input,
        { sourceVersionId: old.source_version_id, manualEvidenceId,
          generation: manualEvidenceId ? 1 : Number(old.source_generation), extractionId: old.extraction_id,
          mappingRevisionId: old.mapping_revision_id, rowKey: manualEvidenceId ?? old.row_key, locators: prior.locators });
    }, client);
}
export async function decideCompetencies(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(workforceReviewSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "competency_decide" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const candidates = await discoverCandidates(db, actor, input.rows.map(r => r.candidateRevisionId));
      if (new Set(candidates.map(c => `${c.resource_id}:${c.skill_id}`)).size !== candidates.length) {
        throw new HttpFailure(422, "invalid_input", "Duplicate resource skill decisions");
      }
      // Retraction may remove an accepted identity after source eligibility is lost.
      await lockCandidateSources(db, actor, candidates, true);
      for (const row of input.rows) if (row.action !== "retract") {
        await lockCandidateSources(db, actor, [candidates.find(c => c.id === row.candidateRevisionId)!], false, row.action === "accept");
      }
      await lockSkills(db, actor, candidates.filter(c => input.rows.find(r => r.candidateRevisionId === c.id)?.action === "accept").map(c => c.skill_id));
      const ids = candidates.map(c => c.competency_id).sort();
      const heads = await db.query(`SELECT id,aggregate_version,current_accepted_revision_id,current_pending_revision_id
        FROM workforce_competencies WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]);
      const resources = await lockResourceHeads(db, actor, candidates.map(c => c.resource_id), "UPDATE");
      for (const row of input.rows) {
        const candidate = candidates.find(c => c.id === row.candidateRevisionId)!, head = heads.rows.find(h => h.id === candidate.competency_id)!;
        if (candidate.competency_id !== row.competencyId || candidate.content_digest !== row.candidateDigest ||
            Number(candidate.source_generation) !== row.sourceGeneration || Number(head.aggregate_version) !== row.expectedAggregateVersion ||
            (row.action === "retract" ? head.current_accepted_revision_id : head.current_pending_revision_id) !== candidate.id) {
          throw new HttpFailure(409, "version_conflict", "Assessment changed; reload");
        }
        if (row.action === "accept" && !resources.find(r => r.id === candidate.resource_id)?.active) {
          throw new HttpFailure(409, "source_changed", "Resource is inactive");
        }
        if (row.action === "accept") await validateAssessmentDate(db, candidate.resource_id, candidate.assessment_date);
        const payload = await db.query("SELECT revision_id FROM workforce_competency_payloads WHERE revision_id=$1 FOR SHARE", [candidate.id]);
        if (row.action !== "retract" && !payload.rowCount) throw new HttpFailure(409, "source_changed", "Evidence unavailable");
      }
      const results = [];
      for (const row of input.rows) {
        const decisionId = randomUUID();
        await db.query(`INSERT INTO workforce_review_decisions(id,environment_id,workspace_id,competency_id,revision_id,
          action,actor_membership_id,actor_session_id,source_generation,content_digest,request_key)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [decisionId, getServerConfig().TURAS_ENVIRONMENT_ID,
          actor.workspaceId, row.competencyId, row.candidateRevisionId, row.action, actor.membershipId,
          actor.sessionId, row.sourceGeneration, row.candidateDigest, input.requestKey]);
        await db.query("INSERT INTO workforce_decision_payloads(revision_id,rationale) VALUES($1,$2)", [decisionId, row.rationale]);
        await db.query(`UPDATE workforce_competencies SET aggregate_version=aggregate_version+1,
          current_accepted_revision_id=CASE WHEN $2='accept' THEN $3::uuid WHEN $2='retract' THEN NULL ELSE current_accepted_revision_id END,
          current_pending_revision_id=CASE WHEN $2='retract' THEN current_pending_revision_id ELSE NULL END WHERE id=$1`,
          [row.competencyId, row.action, row.candidateRevisionId]);
        results.push({ competencyId: row.competencyId, revisionId: row.candidateRevisionId, decisionId,
          aggregateVersion: row.expectedAggregateVersion + 1, contentDigest: row.candidateDigest,
          state: row.action === "accept" ? "accepted" : row.action === "reject" ? "rejected" : "retracted" });
      }
      return { rows: results };
    }, client);
}
