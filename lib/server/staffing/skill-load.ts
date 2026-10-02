import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { staffingSkillMarkdown } from "../../staffing/skill-text";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { boundStaffingToolActor } from "./tool-actor";
import { prepareStaffingNativeFence } from "./native-context";
import { resolveStaffingAdvisoryFence } from "./fences";
import { parseStaffing, staffingSha256 } from "./commands";
import { staffingContextCharge } from "./model-budget";

type Principal = Parameters<typeof boundStaffingToolActor>[1];
/** Only this authored procedure can enter a staffing turn. Exact native call
 * replay is reauthorized without charging its text twice; a new load consumes
 * its actual UTF-8 bytes from the same context budget as domain results. */
export async function loadStaffingSkill(principal: Principal, rawKey: string) {
  const requestKey = parseStaffing(z.string().min(1).max(200), rawKey), prepared = await prepareStaffingNativeFence(principal);
  return withTransaction(async db => {
    const bound = await boundStaffingToolActor(db, principal, async (client, attemptId, context) => {
      if (attemptId !== prepared.attemptId) throw new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");
      await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap: prepared.preparedOverlap });
    });
    const bytes = Buffer.byteLength(staffingSkillMarkdown, "utf8"), digest = staffingSha256(staffingSkillMarkdown);
    const prior = (await db.query(`SELECT content_digest,context_bytes FROM staffing_skill_load_receipts
      WHERE attempt_id=$1 AND request_key=$2`, [bound.attemptId, requestKey])).rows[0];
    if (prior && (prior.content_digest !== digest || Number(prior.context_bytes) !== bytes)) {
      throw new HttpFailure(409, "staffing_skill_changed", "Staffing procedure changed; start a new explanation");
    }
    const budget = staffingContextCharge(bound.counters, { bytes: prior ? 0 : bytes, read: false, dependencyCount: bound.counters.dependencyCount });
    const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (bound.deadlineAt.getTime() <= now.getTime() || bound.actor.expiresAt.getTime() <= now.getTime()) {
      throw new HttpFailure(409, "staffing_advisory_expired", "Staffing explanation deadline reached");
    }
    if (!prior) {
      await db.query(`INSERT INTO staffing_skill_load_receipts(id,environment_id,workspace_id,attempt_id,request_key,content_digest,context_bytes)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, bound.actor.workspaceId,
        bound.attemptId, requestKey, digest, bytes]);
      await db.query("UPDATE staffing_advisory_attempts SET context_bytes=$2,updated_at=clock_timestamp() WHERE id=$1", [bound.attemptId, budget.contextBytes]);
    }
    const release = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (bound.deadlineAt.getTime() <= release.getTime() || bound.actor.expiresAt.getTime() <= release.getTime()) {
      throw new HttpFailure(409, "staffing_advisory_expired", "Staffing explanation deadline reached");
    }
    return staffingSkillMarkdown;
  });
}
