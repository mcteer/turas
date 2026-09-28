import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";

const prefix = "artifact-native-retirement-v1";
function signature(sessionId: string,versionId: string,generation: number,timestamp: number): string {
  return createHmac("sha256",getServerConfig().TURAS_MAINTENANCE_SECRET)
    .update(`${prefix}\n${sessionId}\n${versionId}\n${generation}\n${timestamp}`).digest("hex");
}

export function signNativeRetirement(sessionId: string,versionId: string,generation: number) {
  const timestamp = Date.now();
  return { "x-turas-retire-version-id": versionId,
    "x-turas-retire-generation": String(generation),
    "x-turas-retire-timestamp": String(timestamp),
    "x-turas-retire-signature": signature(sessionId,versionId,generation,timestamp) };
}

/** Authenticate only a tombstoned, recorded dependency for the exact native session. */
export async function authorizeNativeRetirement(request: Request,sessionId: string): Promise<string | null> {
  const versionId = request.headers.get("x-turas-retire-version-id");
  const generation = Number(request.headers.get("x-turas-retire-generation"));
  const timestamp = Number(request.headers.get("x-turas-retire-timestamp"));
  const signed = request.headers.get("x-turas-retire-signature");
  if (!versionId || !/^[0-9a-f-]{36}$/.test(versionId) ||
      !Number.isSafeInteger(generation) || generation < 1 ||
      !Number.isSafeInteger(timestamp) || Math.abs(Date.now()-timestamp) > 30_000 ||
      !signed || !/^[0-9a-f]{64}$/.test(signed)) return null;
  const expected = Buffer.from(signature(sessionId,versionId,generation,timestamp),"hex");
  if (!timingSafeEqual(expected,Buffer.from(signed,"hex"))) return null;
  return withTransaction(async (client) => {
    const found = await client.query<{ owner_principal_id: string }>(`
      SELECT c.owner_principal_id FROM artifact_native_retirement_receipts n
      JOIN conversations c ON c.id=n.conversation_id AND c.eve_session_id=$1
      JOIN artifact_versions v ON v.id=n.version_id
      JOIN conversation_artifact_dependencies d ON d.conversation_id=c.id
        AND d.version_id=v.id
      WHERE n.version_id=$2 AND n.lifecycle_generation=$3 AND n.state IN ('queued','retry')
        AND n.environment_id=$4 AND n.workspace_id=c.workspace_id
        AND v.state IN ('deleting','deleted') AND v.lifecycle_generation>=n.lifecycle_generation
      LIMIT 1`, [sessionId,versionId,generation,getServerConfig().TURAS_ENVIRONMENT_ID]);
    return found.rows[0]?.owner_principal_id ?? null;
  });
}

export async function queueNativeRetirement(client: import("pg").PoolClient,
  versionId: string,generation: number): Promise<void> {
  const dependencies = await client.query<{ conversation_id: string; environment_id: string;
    workspace_id: string }>(`SELECT d.conversation_id,d.environment_id,d.workspace_id
    FROM conversation_artifact_dependencies d JOIN conversations c ON c.id=d.conversation_id
    WHERE d.version_id=$1 AND c.eve_session_id IS NOT NULL`,[versionId]);
  for (const dependency of dependencies.rows) {
    await client.query(`INSERT INTO artifact_native_retirement_receipts
      (id,version_id,conversation_id,environment_id,workspace_id,lifecycle_generation)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (version_id,conversation_id,lifecycle_generation) DO NOTHING`,
    [randomUUID(),versionId,dependency.conversation_id,dependency.environment_id,
      dependency.workspace_id,generation]);
  }
}

/** Provider retirement is best-effort and has its own receipt, separate from app deletion. */
export async function processNativeRetirement(): Promise<boolean> {
  const job = await withTransaction(async (client) => {
    const found = await client.query<{ id: string; version_id: string;
      lifecycle_generation: string; eve_session_id: string }>(`
      SELECT n.id,n.version_id,n.lifecycle_generation,c.eve_session_id
      FROM artifact_native_retirement_receipts n JOIN conversations c ON c.id=n.conversation_id
      WHERE n.environment_id=$1 AND n.state IN ('queued','retry') AND n.next_attempt_at<=now()
        AND c.eve_session_id IS NOT NULL
      ORDER BY n.created_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    const row = found.rows[0];
    if (!row) return null;
    await client.query(`UPDATE artifact_native_retirement_receipts SET state='retry',
      attempt_count=attempt_count+1,next_attempt_at=now()+interval '30 seconds',updated_at=now()
      WHERE id=$1`, [row.id]);
    return row;
  });
  if (!job) return false;
  const origin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(origin)) {
    await withTransaction((client) => client.query(`UPDATE artifact_native_retirement_receipts
      SET state='retry',safe_error_code='native_origin_unavailable',updated_at=now()
      WHERE id=$1`, [job.id]).then(() => undefined));
    return true;
  }
  try {
    const response = await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.eve_session_id)}/reset`, {
      method: "POST",headers: { "content-type": "application/json",
        ...signNativeRetirement(job.eve_session_id,job.version_id,Number(job.lifecycle_generation)) },
      body: JSON.stringify({ reason: "Artifact source retired" }),signal: AbortSignal.timeout(5_000),
    });
    const body = await response.text();
    if (!response.ok && !(response.status === 409 && body.includes("no_active_session"))) {
      throw new Error("native_retirement_unconfirmed");
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE artifact_native_retirement_receipts SET state='done',
        completed_at=now(),safe_error_code=NULL,updated_at=now() WHERE id=$1`, [job.id]);
    });
  } catch {
    await withTransaction(async (client) => {
      await client.query(`UPDATE artifact_native_retirement_receipts SET state='retry',
        next_attempt_at=now()+least(300,power(2,least(attempt_count,8))::integer) * interval '1 second',
        safe_error_code='native_retirement_unconfirmed',updated_at=now() WHERE id=$1`, [job.id]);
    });
  }
  return true;
}
