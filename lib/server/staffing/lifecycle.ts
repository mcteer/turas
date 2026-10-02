import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { workforceImportCancelSchema } from "../../contracts/staffing-imports";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand } from "./commands";
import { lockImportIntent } from "./imports";
import type { StaffingActor } from "./policy";

export async function retireImport(actor: StaffingActor, rawId: unknown, raw: unknown,
  action: "cancel" | "withdraw", client?: PoolClient) {
  const importId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(workforceImportCancelSchema, raw);
  return runStaffingCommand(actor, { ...input, importId, action: `import_${action}` },
    { capability: "manager", table: "workforce_command_receipts", allowDisabled: true }, async db => {
      const intent = await lockImportIntent(db, actor, importId, "UPDATE");
      if (Number(intent.generation) !== input.sourceGeneration) throw new HttpFailure(409, "source_changed", "Import changed");
      if (["cancelled", "withdrawn", "deleting", "deleted"].includes(intent.source_state)) {
        throw new HttpFailure(409, "source_changed", "Import already retired");
      }
      if (action === "cancel" && ["ready", "reviewed"].includes(intent.source_state)) {
        throw new HttpFailure(409, "source_changed", "Withdraw reviewed evidence instead");
      }
      const state = action === "cancel" ? "cancelled" : "withdrawn";
      await db.query("UPDATE workforce_sources SET generation=generation+1,state=$2,retired_at=now() WHERE id=$1", [intent.source_id, state]);
      await db.query("UPDATE workforce_import_intents SET state='cancelled' WHERE id=$1", [importId]);
      await db.query(`UPDATE workforce_import_jobs SET state='cancelled',lease_token=NULL,lease_expires_at=NULL,
        error_code=$2,updated_at=now() WHERE source_version_id=$1 AND state IN ('queued','running')`,
        [intent.current_version_id, action === "withdraw" ? "source_changed" : "cancelled"]);
      await db.query(`INSERT INTO workforce_cleanup_jobs(id,environment_id,workspace_id,source_id,generation,not_before)
        VALUES($1,$2,$3,$4,$5,now()+CASE WHEN $6 THEN interval '0 seconds' ELSE interval '30 days' END)`,
        [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, intent.source_id,
          input.sourceGeneration, action === "withdraw"]);
      return { importId, sourceId: intent.source_id, generation: input.sourceGeneration + 1, state };
    }, client);
}
export async function withdrawManualEvidence(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const evidenceId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(workforceImportCancelSchema, raw);
  return runStaffingCommand(actor, { ...input, evidenceId, action: "manual_withdraw" },
    { capability: "manager", table: "workforce_command_receipts", allowDisabled: true }, async db => {
      const source = (await db.query(`SELECT generation,state FROM workforce_manual_evidence
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
        [evidenceId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
      if (!source) throw hiddenRecord();
      if (Number(source.generation) !== input.sourceGeneration || source.state !== "active") throw new HttpFailure(409, "source_changed", "Evidence changed");
      await db.query("UPDATE workforce_manual_evidence SET generation=generation+1,state='withdrawn',retired_at=now() WHERE id=$1", [evidenceId]);
      await db.query(`INSERT INTO workforce_cleanup_jobs(id,environment_id,workspace_id,manual_evidence_id,generation,not_before)
        VALUES($1,$2,$3,$4,$5,now())`, [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID,
        actor.workspaceId, evidenceId, input.sourceGeneration]);
      return { entityId: evidenceId, generation: input.sourceGeneration + 1, state: "withdrawn" };
    }, client);
}
