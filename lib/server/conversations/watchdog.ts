import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { query, withTransaction } from "../db/client";

const maintenancePath = "/internal/turas/maintenance";
const payloadSchema = z.object({
  action: z.enum(["reconcile", "cancel_due"]),
  attemptId: z.uuid(),
  environmentId: z.string().min(1),
}).strict();

export type MaintenancePayload = z.infer<typeof payloadSchema>;

export function signMaintenanceRequest(
  method: string, path: string, timestamp: string, nonce: string, body: string,
): string {
  const bodyDigest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET)
    .update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyDigest}`)
    .digest("hex");
}

export async function verifyMaintenanceRequest(request: Request): Promise<MaintenancePayload> {
  if (request.method !== "POST" || new URL(request.url).pathname !== maintenancePath ||
      request.headers.has("cookie")) {
    throw new HttpFailure(403, "maintenance_denied", "Action not allowed");
  }
  const timestamp = request.headers.get("x-turas-timestamp") ?? "";
  const nonce = request.headers.get("x-turas-nonce") ?? "";
  const signature = request.headers.get("x-turas-signature") ?? "";
  const instant = Number(timestamp);
  if (!/^\d{13}$/.test(timestamp) || !z.uuid().safeParse(nonce).success ||
      !/^[0-9a-f]{64}$/.test(signature) || !Number.isSafeInteger(instant) ||
      Math.abs(Date.now() - instant) > 30_000) {
    throw new HttpFailure(403, "maintenance_denied", "Action not allowed");
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > 4_096) throw new HttpFailure(413, "too_large", "Request too large");
  const expected = signMaintenanceRequest("POST", maintenancePath, timestamp, nonce, body);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw new HttpFailure(403, "maintenance_denied", "Action not allowed");
  }
  let decoded: unknown;
  try { decoded = JSON.parse(body); }
  catch { throw new HttpFailure(422, "invalid_input", "Invalid request"); }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.environmentId !== getServerConfig().TURAS_ENVIRONMENT_ID) {
    throw new HttpFailure(403, "maintenance_denied", "Action not allowed");
  }
  const digest = createHash("sha256").update(nonce).digest("hex");
  const consumed = await query(`INSERT INTO maintenance_nonces
    (environment_id, nonce_digest, consumed_at, expires_at)
    VALUES ($1,$2,now(),now() + interval '60 seconds')
    ON CONFLICT DO NOTHING RETURNING nonce_digest`,
  [parsed.data.environmentId, digest]);
  if (!consumed.rowCount) throw new HttpFailure(403, "maintenance_replay", "Action not allowed");
  return parsed.data;
}

export async function heartbeatWorker(workerId: string): Promise<void> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  await withTransaction(async (client) => {
    await client.query(`INSERT INTO maintenance_workers
      (environment_id, worker_id, last_seen_at) VALUES ($1,$2,now())
      ON CONFLICT (environment_id, worker_id) DO UPDATE SET last_seen_at = now()`,
    [environmentId, workerId]);
    await client.query("DELETE FROM maintenance_nonces WHERE environment_id = $1 AND expires_at < now()",
      [environmentId]);
  });
}

export type DueJob = { attemptId: string; failureCount: number; deadlineAt: Date };
export async function claimDueJobs(workerId: string, limit = 10): Promise<DueJob[]> {
  return withTransaction(async (client) => {
    const found = await client.query<{ attempt_id: string; failure_count: number; deadline_at: Date }>(`
      SELECT attempt_id, failure_count, deadline_at FROM watchdog_jobs
      WHERE deadline_at <= now() AND next_attempt_at <= now()
        AND (state = 'pending' OR state = 'cancel_requested'
          OR (state = 'leased' AND lease_expires_at <= now()))
      ORDER BY next_attempt_at, attempt_id
      FOR UPDATE SKIP LOCKED LIMIT $1
    `, [Math.max(1, Math.min(50, limit))]);
    for (const job of found.rows) {
      await client.query(`UPDATE watchdog_jobs SET state = 'leased', lease_owner = $2,
        lease_expires_at = now() + interval '15 seconds', updated_at = now()
        WHERE attempt_id = $1`, [job.attempt_id, workerId]);
    }
    return found.rows.map((job) => ({ attemptId: job.attempt_id,
      failureCount: job.failure_count, deadlineAt: job.deadline_at }));
  });
}

export async function finishDueJob(
  workerId: string, attemptId: string,
  result: "settled" | "cancel_requested" | "retry",
  errorCode?: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const row = await client.query<{ failure_count: number }>(`
      SELECT failure_count FROM watchdog_jobs WHERE attempt_id = $1
        AND state = 'leased' AND lease_owner = $2 FOR UPDATE`, [attemptId, workerId]);
    if (!row.rows[0]) return;
    if (result === "settled") {
      await client.query(`UPDATE watchdog_jobs SET state = 'settled',
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE attempt_id = $1`, [attemptId]);
      return;
    }
    if (result === "cancel_requested") {
      await client.query(`UPDATE watchdog_jobs SET state = 'cancel_requested',
        lease_owner = NULL, lease_expires_at = NULL,
        next_attempt_at = now() + interval '5 seconds', updated_at = now()
        WHERE attempt_id = $1`, [attemptId]);
      return;
    }
    const failures = row.rows[0].failure_count + 1;
    const delay = [5, 10, 20, 30, 30][Math.min(failures - 1, 4)];
    await client.query(`UPDATE watchdog_jobs SET state = $2,
      failure_count = $3, last_error_code = $4,
      lease_owner = NULL, lease_expires_at = NULL,
      next_attempt_at = now() + ($5::integer * interval '1 second'),
      updated_at = now() WHERE attempt_id = $1`,
    [attemptId, failures >= 5 ? "needs_attention" : "pending",
      failures, errorCode ?? "maintenance_failed", delay]);
  });
}
