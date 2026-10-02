import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema, staffingListSchema, staffingOperationalResourceSchema } from "../../contracts/staffing";
import { competencyFreshness } from "../../staffing/freshness";
import { DEMO_IDS } from "../bootstrap-ids";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { parseStaffing, staffingSha256 } from "./commands";
import { lockResourceHeads } from "./resources";
import { observeStaffingRead, recordStaffingTelemetry } from "./telemetry";

export const staffingCursorMac = (text: string) => createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET).update(text).digest("base64url");
export function staffingPageCursor(id: string, scope: object) {
  const body = Buffer.from(JSON.stringify({ id, scope: staffingSha256(scope) })).toString("base64url");
  return `${body}.${staffingCursorMac(body)}`;
}
export function readStaffingPageCursor(cursor: string | undefined, scope: object) {
  if (!cursor) return null;
  try {
    const [body, signature, extra] = cursor.split(".");
    if (!body || !signature || extra) throw new Error();
    const expected = Buffer.from(staffingCursorMac(body)), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const parsed = z.object({ id: staffingIdSchema, scope: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
      .parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (parsed.scope !== staffingSha256(scope)) throw new Error();
    return parsed.id;
  } catch { throw new HttpFailure(422, "invalid_input", "Invalid staffing cursor"); }
}
export const isStaffingManager = (actor: StaffingActor) => actor.principalId === DEMO_IDS.mcteer && actor.kind === "internal" && actor.role === "admin";

/** Metadata-only discovery; current source locks always precede competency/resource heads. */
export async function lockApprovedReadInputs(db: PoolClient, actor: StaffingActor, resourceIds: string[], includePending = false,
  historyIds: string[] = [], requestedSkillIds?: string[], resourceLock: "SHARE" | "UPDATE" = "SHARE",
  additionalSources: { manual: string[]; imported: string[] } = { manual: [], imported: [] }, additionalSkillIds: string[] = []) {
  const candidates = (await db.query(`SELECT c.id,c.current_accepted_revision_id,c.current_pending_revision_id,c.skill_id
    FROM workforce_competencies c
    WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.resource_id=ANY($3::uuid[])
      AND ($4::uuid[] IS NULL OR c.skill_id=ANY($4)) ORDER BY c.id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceIds, requestedSkillIds ?? null])).rows;
  const revisions = (await db.query(`SELECT r.id,r.manual_evidence_id,v.source_id FROM workforce_competency_revisions r
    LEFT JOIN workforce_source_versions v ON v.id=r.source_version_id WHERE r.id=ANY($1::uuid[])`,
    [[...historyIds, ...candidates.flatMap(c => [c.current_accepted_revision_id, ...(includePending ? [c.current_pending_revision_id] : [])]).filter(Boolean)]])).rows;
  for (const [table, key] of [["workforce_manual_evidence", "manual_evidence_id"], ["workforce_sources", "source_id"]] as const) {
    const extra = key === "manual_evidence_id" ? additionalSources.manual : additionalSources.imported;
    const ids = [...new Set([...revisions.map(r => r[key]).filter(Boolean), ...extra])].sort();
    if (ids.length) await db.query(`SELECT id FROM ${table} WHERE environment_id=$1 AND workspace_id=$2
      AND id=ANY($3::uuid[]) ORDER BY id FOR SHARE`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, ids]);
  }
  const skillIds = [...new Set([...candidates.map(c => c.skill_id), ...(requestedSkillIds ?? []), ...additionalSkillIds])].sort();
  if (skillIds.length) await db.query(`SELECT id FROM workforce_skills WHERE id=ANY($1::uuid[]) AND environment_id=$2
    AND workspace_id=$3 ORDER BY id FOR SHARE`, [skillIds, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
  const heads = (await db.query(`SELECT id,current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies
    WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=ANY($3::uuid[])
      AND ($4::uuid[] IS NULL OR skill_id=ANY($4)) ORDER BY id FOR SHARE`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceIds, requestedSkillIds ?? null])).rows;
  const discoveredById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  if (heads.length !== candidates.length || heads.some(head =>
    (discoveredById.get(head.id)?.current_accepted_revision_id !== head.current_accepted_revision_id ||
      includePending && discoveredById.get(head.id)?.current_pending_revision_id !== head.current_pending_revision_id))) {
    throw new HttpFailure(409, "source_changed", "Roster changed; reload");
  }
  const resources = await lockResourceHeads(db, actor, resourceIds, resourceLock);
  // A first competency has no row to lock during discovery. All candidate and
  // decision writers now take resource UPDATE after the source/skill/competency
  // prefix. Once this SHARE lock is held, recheck the discovered range without
  // acquiring new competency locks in reverse order. Refuse a committed phantom
  // before any source-eligible personnel payload is retrieved.
  const final = (await db.query(`SELECT id,current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies
    WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=ANY($3::uuid[])
      AND ($4::uuid[] IS NULL OR skill_id=ANY($4)) ORDER BY id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceIds, requestedSkillIds ?? null])).rows;
  if (final.length !== heads.length || final.some(head =>
    discoveredById.get(head.id)?.current_accepted_revision_id !== head.current_accepted_revision_id ||
    includePending && discoveredById.get(head.id)?.current_pending_revision_id !== head.current_pending_revision_id)) {
    throw new HttpFailure(409, "source_changed", "Roster changed; reload");
  }
  return resources;
}
export async function projectResources(db: PoolClient, actor: StaffingActor, resourceIds: string[], includePending = false, skillPage: { pageSize: number; cursor?: string } = { pageSize: 50 }) {
  if (!resourceIds.length) return [];
  const heads = await lockApprovedReadInputs(db, actor, resourceIds, includePending);
  const profiles = (await db.query(`SELECT r.id,p.display_name,p.timezone,p.region_code FROM workforce_resources r
    JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id WHERE r.id=ANY($1::uuid[])
    ORDER BY r.id FOR SHARE OF p`, [resourceIds])).rows;
  // Only accepted source-eligible summary fields are retrieved. No personnel prose, filenames, or finance join.
  const sourceCheckStarted = performance.now();
  const assessments = (await db.query(`SELECT c.resource_id,c.skill_id,v.id AS revision_id,v.level,
    v.assessment_date::text,v.next_review_date::text FROM workforce_competencies c
    JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    JOIN workforce_skills skill ON skill.id=c.skill_id AND skill.active
    LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id
    LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
    LEFT JOIN workforce_sources s ON s.id=original.source_id
    WHERE c.resource_id=ANY($1::uuid[]) AND (
      m.state='active' AND m.generation=v.source_generation OR
      s.state IN ('ready','reviewed') AND s.generation=v.source_generation AND s.current_version_id=v.source_version_id
      AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.id=v.extraction_id AND x.complete AND x.scan_clean))
    ORDER BY c.resource_id,c.skill_id`, [resourceIds])).rows;
  const accepted = (await db.query(`SELECT count(*)::int AS count FROM workforce_competencies
    WHERE resource_id=ANY($1::uuid[]) AND current_accepted_revision_id IS NOT NULL`, [resourceIds])).rows[0].count as number;
  if (accepted > assessments.length) recordStaffingTelemetry({ operation: "source_lifecycle", outcome: "excluded",
    durationMs: Math.min(86_400_000, Math.max(0, performance.now() - sourceCheckStarted)),
    count: accepted - assessments.length });
  return heads.map(head => {
    const profile = profiles.find(p => p.id === head.id); if (!profile) throw hiddenRecord();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone,
      year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "resource_skills", resourceId: head.id };
    const after = readStaffingPageCursor(skillPage.cursor, scope);
    const eligible = head.active ? assessments.filter(a => a.resource_id === head.id && (!after || a.skill_id > after)) : [];
    const page = eligible.slice(0, skillPage.pageSize);
    return staffingOperationalResourceSchema.parse({ resourceId: head.id, displayName: profile.display_name,
      kind: head.kind, state: head.active ? "active" : "inactive", timezone: profile.timezone,
      regionCode: profile.region_code, aggregateVersion: Number(head.aggregate_version),
      skillsNextCursor: eligible.length > skillPage.pageSize ? staffingPageCursor(page.at(-1)!.skill_id, scope) : null,
      skills: page.map(a => ({
        skillId: a.skill_id, revisionId: a.revision_id, level: a.level,
        freshness: competencyFreshness({ assessmentDate: a.assessment_date, nextReviewDate: a.next_review_date }, today).freshness })) });
  });
}
export async function listResources(actor: StaffingActor, raw: unknown = {}, client?: PoolClient) {
  const input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "resources" };
    const after = readStaffingPageCursor(input.cursor, scope);
    const ids = (await db.query(`SELECT id FROM workforce_resources WHERE environment_id=$1 AND workspace_id=$2
      AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`, [getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId, after, input.pageSize + 1])).rows.map(r => r.id as string);
    const visible = ids.slice(0, input.pageSize), items = await projectResources(db, actor, visible);
    return { items, nextCursor: ids.length > input.pageSize ? staffingPageCursor(visible.at(-1)!, scope) : null };
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}
export async function readResource(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const manager = isStaffingManager(actor), resource = (await projectResources(db, actor, [resourceId], manager))[0];
    if (!manager) return resource;
    const profile = (await db.query(`SELECT h.external_key,h.membership_id,h.partner_organization_id,h.current_revision_id,
      r.content_digest,p.rationale FROM workforce_resources h JOIN workforce_resource_revisions r ON r.id=h.current_revision_id
      JOIN workforce_resource_payloads p ON p.revision_id=r.id WHERE h.id=$1 FOR SHARE OF p`, [resourceId])).rows[0];
    const review = await managerCompetencyPage(db, actor, resourceId, { pageSize: 20 });
    return { ...resource, manager: { externalKey: profile.external_key, membershipId: profile.membership_id,
      partnerOrganizationId: profile.partner_organization_id, revisionId: profile.current_revision_id,
      contentDigest: profile.content_digest, rationale: profile.rationale, review } };
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}
export async function listSkills(actor: StaffingActor, raw: unknown = {}, client?: PoolClient) {
  const input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "skills" }, after = readStaffingPageCursor(input.cursor, scope);
    const heads = (await db.query(`SELECT id,skill_key,active,aggregate_version,current_revision_id FROM workforce_skills
      WHERE environment_id=$1 AND workspace_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4 FOR SHARE`,
      [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, after, input.pageSize + 1])).rows;
    const page = heads.slice(0, input.pageSize), profiles = (await db.query(`SELECT p.revision_id,p.name,p.definition,r.content_digest
      FROM workforce_skill_payloads p JOIN workforce_skill_revisions r ON r.id=p.revision_id
      WHERE p.revision_id=ANY($1::uuid[]) FOR SHARE OF p`, [page.map(h => h.current_revision_id)])).rows;
    return { items: page.map(head => { const profile = profiles.find(p => p.revision_id === head.current_revision_id);
      if (!profile) throw hiddenRecord();
      return { skillId: head.id, key: head.skill_key, name: profile.name, definition: profile.definition,
        state: head.active ? "active" : "retired", aggregateVersion: Number(head.aggregate_version),
        revisionId: head.current_revision_id, contentDigest: profile.content_digest }; }),
      nextCursor: heads.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}

/** Invoked only after current manager and the union of candidate sources/heads
 * are locked. Withdrawn payloads are excluded in SQL, with identity-only warnings. */
async function managerCompetencyPage(db: PoolClient, actor: StaffingActor, resourceId: string,
  input: { pageSize: number; cursor?: string }) {
  const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
    actor: actor.membershipId, projection: "manager_competencies", resourceId }, after = readStaffingPageCursor(input.cursor, scope);
  const heads = (await db.query(`SELECT id,current_pending_revision_id,current_accepted_revision_id,aggregate_version
    FROM workforce_competencies WHERE resource_id=$1 AND environment_id=$2 AND workspace_id=$3
    AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5`, [resourceId, getServerConfig().TURAS_ENVIRONMENT_ID,
    actor.workspaceId, after, input.pageSize + 1])).rows;
  const page = heads.slice(0, input.pageSize), revisionIds = page.flatMap(h =>
    [h.current_pending_revision_id, h.current_accepted_revision_id].filter(Boolean));
  const identities = (await db.query(`SELECT v.id,v.competency_id,c.skill_id,v.level,v.assessment_date::text,
    v.next_review_date::text,v.content_digest,v.source_generation,v.manual_evidence_id,v.source_version_id,
    v.extraction_id,v.mapping_revision_id,v.row_key,
    (resource.active AND skill.active AND (m.state='active' AND m.generation=v.source_generation OR
      s.state IN ('ready','reviewed') AND s.generation=v.source_generation AND s.current_version_id=v.source_version_id
      AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.id=v.extraction_id AND x.complete AND x.scan_clean))) AS eligible
    FROM workforce_competency_revisions v JOIN workforce_competencies c ON c.id=v.competency_id
    JOIN workforce_resources resource ON resource.id=c.resource_id JOIN workforce_skills skill ON skill.id=c.skill_id
    LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id
    LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
    LEFT JOIN workforce_sources s ON s.id=original.source_id WHERE v.id=ANY($1::uuid[]) ORDER BY v.id`, [revisionIds])).rows;
  const eligibleIds = identities.filter(r => r.eligible).map(r => r.id);
  const payloads = (await db.query(`SELECT p.revision_id,p.evidence,p.locators,original.filename
    FROM workforce_competency_payloads p JOIN workforce_competency_revisions v ON v.id=p.revision_id
    LEFT JOIN workforce_source_payloads original ON original.revision_id=v.source_version_id
    WHERE p.revision_id=ANY($1::uuid[]) FOR SHARE OF p`, [eligibleIds])).rows;
  return { items: identities.map(identity => {
    const head = page.find(h => h.id === identity.competency_id)!, payload = payloads.find(p => p.revision_id === identity.id);
    const base = { competencyId: identity.competency_id, resourceId, skillId: identity.skill_id,
      revisionId: identity.id, contentDigest: identity.content_digest, sourceGeneration: Number(identity.source_generation),
      aggregateVersion: Number(head.aggregate_version), state: head.current_pending_revision_id === identity.id ? "pending" : "accepted",
      manualEvidenceId: identity.manual_evidence_id, sourceVersionId: identity.source_version_id,
      extractionRunId: identity.extraction_id, mappingRevisionId: identity.mapping_revision_id, rowKey: identity.row_key };
    return payload ? { ...base, withheld: false, level: identity.level, assessmentDate: identity.assessment_date,
      nextReviewDate: identity.next_review_date, evidence: payload.evidence, locators: payload.locators, filename: payload.filename ?? null } :
      { ...base, withheld: true, warning: "source_withheld" };
  }), nextCursor: heads.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
}
export async function readManagerCompetencies(actor: StaffingActor, rawResourceId: unknown, raw: unknown = {}, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawResourceId), input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "manager");
    await lockApprovedReadInputs(db, actor, [resourceId], true);
    return managerCompetencyPage(db, actor, resourceId, input);
  };
  return client ? run(client) : withTransaction(run);
}

export async function readResourceSkills(actor: StaffingActor, rawId: unknown, raw: unknown = {}, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const resource = (await projectResources(db, actor, [resourceId], false, input))[0];
    return { items: resource.skills, nextCursor: resource.skillsNextCursor };
  };
  return client ? run(client) : withTransaction(run);
}

export async function readCompetencyHistory(actor: StaffingActor, rawId: unknown, raw: unknown = {}, client?: PoolClient) {
  const competencyId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational");
    const head = (await db.query(`SELECT resource_id,skill_id,current_pending_revision_id,current_accepted_revision_id
      FROM workforce_competencies WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`,
      [competencyId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!head) throw hiddenRecord();
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "competency_history", competencyId };
    const after = readStaffingPageCursor(input.cursor, scope);
    const revisions = (await db.query(`SELECT id,revision_number,content_digest,source_generation,manual_evidence_id,
      source_version_id,extraction_id,mapping_revision_id,row_key FROM workforce_competency_revisions
      WHERE competency_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
      [competencyId, after, input.pageSize + 1])).rows;
    const page = revisions.slice(0, input.pageSize);
    await lockApprovedReadInputs(db, actor, [head.resource_id], true, page.map(r => r.id));
    const current = (await db.query(`SELECT current_pending_revision_id,current_accepted_revision_id
      FROM workforce_competencies WHERE id=$1`, [competencyId])).rows[0];
    const manager = isStaffingManager(actor);
    // SQL excludes retired inputs before retrieving assessment values or private prose.
    const values = (await db.query(`SELECT v.id,v.level,v.assessment_date::text,v.next_review_date::text
      FROM workforce_competency_revisions v JOIN workforce_competencies c ON c.id=v.competency_id
      JOIN workforce_resources resource ON resource.id=c.resource_id AND resource.active
      JOIN workforce_skills skill ON skill.id=c.skill_id AND skill.active
      LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id
      LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
      LEFT JOIN workforce_sources s ON s.id=original.source_id
      WHERE v.id=ANY($1::uuid[]) AND ($2 OR v.id=$3::uuid) AND (
        m.state='active' AND m.generation=v.source_generation OR
        s.state IN ('ready','reviewed') AND s.generation=v.source_generation AND s.current_version_id=v.source_version_id
        AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.id=v.extraction_id AND x.complete AND x.scan_clean))`,
      [page.map(r => r.id), manager, current.current_accepted_revision_id])).rows;
    const payloads = manager ? (await db.query(`SELECT revision_id,evidence,locators
      FROM workforce_competency_payloads WHERE revision_id=ANY($1::uuid[]) FOR SHARE`, [values.map(v => v.id)])).rows : [];
    const decisions = (await db.query(`SELECT id,revision_id,action FROM workforce_review_decisions
      WHERE competency_id=$1 AND revision_id=ANY($2::uuid[]) ORDER BY id`, [competencyId, page.map(r => r.id)])).rows;
    return { items: page.map(r => {
      const value = values.find(v => v.id === r.id), payload = payloads.find(p => p.revision_id === r.id);
      return { competencyId, resourceId: head.resource_id, skillId: head.skill_id, revisionId: r.id,
        revision: Number(r.revision_number), contentDigest: r.content_digest,
        state: current.current_pending_revision_id === r.id ? "pending" : current.current_accepted_revision_id === r.id ? "accepted" : "historical",
        decisions: decisions.filter(d => d.revision_id === r.id).map(d => ({ decisionId: d.id, action: d.action })),
        withheld: !value, ...(value ? { level: value.level, assessmentDate: value.assessment_date,
          nextReviewDate: value.next_review_date } : { warning: "source_withheld" }),
        ...(manager ? { sourceGeneration: Number(r.source_generation), manualEvidenceId: r.manual_evidence_id,
          sourceVersionId: r.source_version_id, extractionRunId: r.extraction_id, mappingRevisionId: r.mapping_revision_id,
          rowKey: r.row_key, ...(payload ? { evidence: payload.evidence, locators: payload.locators } : {}) } : {}) };
    }), nextCursor: revisions.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return client ? run(client) : withTransaction(run);
}
