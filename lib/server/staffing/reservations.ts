import { randomUUID } from "node:crypto";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { requireStaffingEnvironment } from "./repository";
import { recordStaffingTelemetry } from "./telemetry";

/** Scoped maintenance authority expires at most twenty tentative reservations.
 * Expiry needs no personnel/source payload and never changes confirmed ledgers.
 * Its service audit is distinct from an accountable human decision. */
export async function expireStaffingReservations() {
  const started = Date.now();
  try {
    const count = await withTransaction(async db => {
      await requireStaffingEnvironment(db, false);
      const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
      const expired = (await db.query(`SELECT id,workspace_id,current_revision_id,aggregate_version,reservation_expires_at
        FROM staffing_allocations WHERE environment_id=$1 AND state='tentative' AND confirmed_revision_id IS NULL
          AND reservation_expires_at<=clock_timestamp() ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`, [environmentId])).rows;
      for (const head of expired) {
        const revision = (await db.query(`SELECT content_digest FROM staffing_allocation_revisions WHERE id=$1 AND allocation_id=$2`,
          [head.current_revision_id, head.id])).rows[0];
        await db.query(`UPDATE staffing_allocations SET state='expired',aggregate_version=aggregate_version+1,
          reservation_expires_at=NULL,updated_at=now() WHERE id=$1`, [head.id]);
        await db.query(`INSERT INTO staffing_reservation_expirations(id,environment_id,workspace_id,allocation_id,
          revision_id,aggregate_version,content_digest,reservation_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [randomUUID(), environmentId, head.workspace_id, head.id, head.current_revision_id,
            Number(head.aggregate_version) + 1, revision.content_digest, head.reservation_expires_at]);
      }
      return expired.length;
    });
    recordStaffingTelemetry({ operation: "allocation", outcome: "committed", count, durationMs: Math.min(86_400_000, Date.now() - started) });
    return count;
  } catch (error) {
    recordStaffingTelemetry({ operation: "allocation", outcome: "failed", durationMs: Math.min(86_400_000, Date.now() - started) });
    throw error;
  }
}
