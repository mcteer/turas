import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingCreateSkillSchema, staffingReviseSkillSchema, staffingIdSchema,
  type StaffingSkillInput } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import type { StaffingActor } from "./policy";

async function appendSkill(db: PoolClient, actor: StaffingActor, skillId: string, number: number,
  skill: StaffingSkillInput, rationale: string) {
  const revisionId = randomUUID(), contentDigest = staffingSha256(skill);
  await db.query(`INSERT INTO workforce_skill_revisions(id,environment_id,workspace_id,skill_id,
    revision_number,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, skillId, number, contentDigest, actor.membershipId]);
  await db.query(`INSERT INTO workforce_skill_payloads(revision_id,name,definition,rationale) VALUES($1,$2,$3,$4)`,
    [revisionId, skill.name, skill.definition, rationale]);
  await db.query("UPDATE workforce_skills SET current_revision_id=$2,aggregate_version=$3,active=$4 WHERE id=$1",
    [skillId, revisionId, number, skill.state === "active"]);
  return { skillId, revisionId, contentDigest, aggregateVersion: number, state: skill.state };
}
export async function createSkill(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingCreateSkillSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "skill_create" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      if ((await db.query("SELECT id FROM workforce_skills WHERE workspace_id=$1 AND skill_key=$2",
        [actor.workspaceId, input.skill.key])).rowCount) throw new HttpFailure(409, "version_conflict", "Skill key already registered");
      const id = randomUUID();
      await db.query(`INSERT INTO workforce_skills(id,environment_id,workspace_id,skill_key,created_by_membership_id)
        VALUES($1,$2,$3,$4,$5)`, [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.skill.key, actor.membershipId]);
      return appendSkill(db, actor, id, 1, input.skill, input.rationale);
    }, client);
}
export async function reviseSkill(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const skillId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingReviseSkillSchema, raw);
  return runStaffingCommand(actor, { ...input, skillId, action: "skill_revise" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const head = (await db.query(`SELECT id,skill_key,current_revision_id,aggregate_version FROM workforce_skills
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
        [skillId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
      if (!head) throw hiddenRecord();
      const revision = (await db.query("SELECT content_digest FROM workforce_skill_revisions WHERE id=$1", [head.current_revision_id])).rows[0];
      if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion ||
          revision?.content_digest !== input.contentDigest) throw new HttpFailure(409, "version_conflict", "Skill changed; reload");
      if (head.skill_key !== input.skill.key) throw new HttpFailure(422, "invalid_input", "Skill identity cannot be reassigned");
      return appendSkill(db, actor, skillId, input.expectedAggregateVersion + 1, input.skill, input.rationale);
    }, client);
}
