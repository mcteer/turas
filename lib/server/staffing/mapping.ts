import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { workforceMappingSchema } from "../../contracts/staffing-imports";
import type { WorkforceExtraction } from "../../contracts/artifacts";
import { resolveWorkforceRows, type LocatedWorkforceCell } from "../../staffing/import-mapping";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import { lockImportIntent } from "./imports";
import { lockSkills } from "./competencies";
import { lockResourceHeads } from "./resources";
import type { StaffingActor } from "./policy";

export async function createImportMapping(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const importId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(workforceMappingSchema, raw);
  return runStaffingCommand(actor, { ...input, importId, action: "import_map" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const intent = await lockImportIntent(db, actor, importId, "UPDATE");
      if (Number(intent.generation) !== input.sourceGeneration || intent.current_version_id !== input.sourceVersionId ||
        !["ready", "partial", "reviewed"].includes(intent.source_state)) throw new HttpFailure(409, "source_changed", "Import changed");
      const extraction = (await db.query(`SELECT x.content_digest,x.complete,p.manifest FROM workforce_extractions x
        JOIN workforce_extraction_payloads p ON p.revision_id=x.id WHERE x.id=$1 AND x.source_version_id=$2
        AND x.environment_id=$3 AND x.workspace_id=$4 AND x.scan_clean FOR SHARE OF p`,
        [input.extractionRunId, input.sourceVersionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
      if (!extraction) throw hiddenRecord();
      if (extraction.content_digest !== input.extractionDigest) throw new HttpFailure(409, "source_changed", "Extraction changed");
      const located = (await db.query(`SELECT c.id,p.cell FROM workforce_extracted_cells c
        JOIN workforce_extracted_cell_payloads p ON p.revision_id=c.id WHERE c.extraction_id=$1
        ORDER BY c.sheet_index,c.row_number,c.column_number FOR SHARE OF p`, [input.extractionRunId])).rows as LocatedWorkforceCell[];
      let rows;
      try { rows = resolveWorkforceRows(input, extraction.manifest as WorkforceExtraction, located); }
      catch { throw new HttpFailure(422, "invalid_input", "Invalid table range or header"); }
      const number = Number((await db.query("SELECT coalesce(max(revision_number),0)+1 AS number FROM workforce_mapping_revisions WHERE source_version_id=$1", [input.sourceVersionId])).rows[0].number);
      const mappingId = randomUUID(), { requestKey: _key, ...mappingBody } = input, digest = staffingSha256(mappingBody);
      await db.query(`INSERT INTO workforce_mapping_revisions(id,environment_id,workspace_id,source_version_id,
        extraction_id,revision_number,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [mappingId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.sourceVersionId,
          input.extractionRunId, number, digest, actor.membershipId]);
      await db.query("INSERT INTO workforce_mapping_payloads(revision_id,mapping) VALUES($1,$2)", [mappingId, JSON.stringify(mappingBody)]);
      const warnings = [...new Set(rows.flatMap(r => r.errors))];
      if (!extraction.complete && !warnings.includes("incomplete_coverage")) warnings.push("incomplete_coverage");
      if (warnings.length) return { importId, revisionId: mappingId, contentDigest: digest, state: "needs_correction", warnings };
      const candidates = rows.map(r => ({ row: r, candidate: r.candidate! }));
      const resources = [...new Set(candidates.map(c => c.candidate.resourceId))].sort();
      if (resources.length > 500) throw new HttpFailure(422, "invalid_input", "Too many mapped resources");
      // Scoped identity discovery precedes FK insertion; no profile/prose is retrieved.
      const visible = await db.query(`SELECT id FROM workforce_resources WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[])`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resources]);
      if (visible.rowCount !== resources.length) throw hiddenRecord();
      await lockSkills(db, actor, candidates.map(c => c.candidate.skillId));
      const identities = candidates.map(c => ({ id: randomUUID(), resource_id: c.candidate.resourceId, skill_id: c.candidate.skillId }));
      await db.query(`INSERT INTO workforce_competencies(id,environment_id,workspace_id,resource_id,skill_id)
        SELECT x.id,$1,$2,x.resource_id,x.skill_id FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,resource_id uuid,skill_id uuid)
        ORDER BY x.resource_id,x.skill_id ON CONFLICT(resource_id,skill_id) DO NOTHING`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, JSON.stringify(identities)]);
      const heads = (await db.query(`SELECT c.id,c.resource_id,c.skill_id,c.aggregate_version,c.current_pending_revision_id,
        c.current_accepted_revision_id,r.source_version_id FROM workforce_competencies c
        LEFT JOIN workforce_competency_revisions r ON r.id=c.current_pending_revision_id
        WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.resource_id=ANY($3::uuid[])
        AND c.skill_id=ANY($4::uuid[]) ORDER BY c.id FOR UPDATE OF c`, [getServerConfig().TURAS_ENVIRONMENT_ID,
        actor.workspaceId, resources, candidates.map(c => c.candidate.skillId)])).rows;
      const lockedResources = await lockResourceHeads(db, actor, resources, "UPDATE");
      if (lockedResources.some(r => !r.active)) throw new HttpFailure(409, "source_changed", "Mapped resource is inactive");
      // One local-date lookup per resource avoids N candidate lookups.
      const dateByResource = new Map<string, string>();
      for (const resourceId of resources) {
        const timezone = (await db.query(`SELECT p.timezone FROM workforce_resources r
          JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id WHERE r.id=$1`, [resourceId])).rows[0]?.timezone;
        if (!timezone) throw hiddenRecord();
        dateByResource.set(resourceId, new Intl.DateTimeFormat("en-CA", { timeZone: timezone,
          year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
      }
      const revisions = candidates.map(({ row, candidate }) => {
        const head = heads.find(h => h.resource_id === candidate.resourceId && h.skill_id === candidate.skillId)!;
        if (head.current_pending_revision_id && head.source_version_id !== input.sourceVersionId) {
          throw new HttpFailure(409, "version_conflict", "Another assessment is pending");
        }
        if (candidate.assessmentDate > dateByResource.get(candidate.resourceId)!) throw new HttpFailure(422, "invalid_input", "Assessment cannot be future-dated");
        const version = Number(head.aggregate_version) + (head.current_pending_revision_id || head.current_accepted_revision_id ? 1 : 0);
        const lineage = { sourceVersionId: input.sourceVersionId, manualEvidenceId: null, generation: input.sourceGeneration,
          extractionId: input.extractionRunId, mappingRevisionId: mappingId, rowKey: row.rowKey, locators: candidate.locators };
        const { correctedFields: _corrected, ...assessment } = candidate;
        return { id: randomUUID(), competency_id: head.id, revision_number: version, level: candidate.level,
          assessment_date: candidate.assessmentDate, next_review_date: candidate.nextReviewDate,
          row_key: row.rowKey, content_digest: staffingSha256({ ...assessment, ...lineage }),
          evidence: candidate.evidence, locators: candidate.locators };
      });
      for (let offset = 0; offset < revisions.length; offset += 500) {
        const batch = JSON.stringify(revisions.slice(offset, offset + 500));
        await db.query(`INSERT INTO workforce_competency_revisions(id,environment_id,workspace_id,competency_id,
          revision_number,level,assessment_date,next_review_date,source_version_id,source_generation,extraction_id,
          mapping_revision_id,row_key,content_digest,actor_membership_id)
          SELECT x.id,$1,$2,x.competency_id,x.revision_number,x.level,x.assessment_date,x.next_review_date,$3,$4,$5,$6,
            x.row_key,x.content_digest,$7 FROM jsonb_to_recordset($8::jsonb)
          AS x(id uuid,competency_id uuid,revision_number bigint,level integer,assessment_date date,next_review_date date,row_key text,content_digest text)`,
          [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.sourceVersionId, input.sourceGeneration,
            input.extractionRunId, mappingId, actor.membershipId, batch]);
        await db.query(`INSERT INTO workforce_competency_payloads(revision_id,evidence,locators)
          SELECT x.id,x.evidence,x.locators FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,evidence text,locators jsonb)`, [batch]);
        await db.query(`UPDATE workforce_competencies c SET current_pending_revision_id=x.id,aggregate_version=x.revision_number
          FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,competency_id uuid,revision_number bigint) WHERE c.id=x.competency_id`, [batch]);
      }
      return { importId, revisionId: mappingId, contentDigest: digest, state: "mapped" };
    }, client);
}
