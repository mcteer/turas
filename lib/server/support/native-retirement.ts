import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";

function signature(session: string, attempt: string, at: number) {
  return createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET)
    .update(`support-retirement-v1\n${session}\n${attempt}\n${at}`).digest("hex");
}

export function signSupportRetirement(session: string, attempt: string) {
  const at = Date.now();
  return { "x-turas-support-retire-at": String(at), "x-turas-support-retire-attempt": attempt,
    "x-turas-support-retire-signature": signature(session, attempt, at) };
}

export async function authorizeSupportRetirement(request: Request, session: string): Promise<string | null> {
  const attempt = request.headers.get("x-turas-support-retire-attempt");
  const at = Number(request.headers.get("x-turas-support-retire-at"));
  const signed = request.headers.get("x-turas-support-retire-signature");
  if (!attempt || !/^[a-f0-9-]{36}$/.test(attempt) || !Number.isSafeInteger(at) || Math.abs(Date.now() - at) > 30000 ||
    !signed || !/^[a-f0-9]{64}$/.test(signed)) return null;
  if (!timingSafeEqual(Buffer.from(signed, "hex"), Buffer.from(signature(session, attempt, at), "hex"))) return null;
  return withTransaction(async db => (await db.query(`SELECT c.owner_principal_id
    FROM support_native_retirement_receipts n JOIN support_advice_retirements r ON r.attempt_id=n.attempt_id
    JOIN support_advice_attempts a ON a.id=r.attempt_id JOIN conversations c ON c.id=a.conversation_id
    WHERE a.id=$1 AND a.environment_id=$2 AND c.eve_session_id=$3 AND n.state='pending'`,
  [attempt, getServerConfig().TURAS_ENVIRONMENT_ID, session])).rows[0]?.owner_principal_id ?? null);
}

/** Reset only the retired native identity; never retry a paid generation. */
export async function processSupportNativeRetirement(): Promise<boolean> {
  const origin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(origin)) return false;
  const job = await withTransaction(async db => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    if (Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [env])).rows[0]?.schema_version ?? 0) < 43) return null;
    await db.query(`INSERT INTO support_native_retirement_receipts(attempt_id)
      SELECT r.attempt_id FROM support_advice_retirements r JOIN support_advice_attempts a ON a.id=r.attempt_id
      WHERE a.environment_id=$1 ON CONFLICT DO NOTHING`, [env]);
    const row = (await db.query(`SELECT n.attempt_id,c.eve_session_id FROM support_native_retirement_receipts n
      JOIN support_advice_attempts a ON a.id=n.attempt_id JOIN conversations c ON c.id=a.conversation_id
      WHERE a.environment_id=$1 AND n.state='pending' AND n.next_attempt_at<=now()
      ORDER BY n.next_attempt_at,n.attempt_id FOR UPDATE OF n SKIP LOCKED LIMIT 1`, [env])).rows[0];
    if (row) await db.query(`UPDATE support_native_retirement_receipts
      SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE attempt_id=$1`, [row.attempt_id]);
    return row;
  });
  if (!job) return false;
  try {
    const response = await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.eve_session_id)}/reset`, {
      method: "POST", headers: { "content-type": "application/json", ...signSupportRetirement(job.eve_session_id, job.attempt_id) },
      body: JSON.stringify({ reason: "Support advice retired" }), signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    if (response.ok || response.status === 409 && body.includes("no_active_session"))
      await withTransaction(async db => { await db.query(`UPDATE support_native_retirement_receipts
        SET state='done',completed_at=now() WHERE attempt_id=$1`, [job.attempt_id]); });
  } catch { /* A pending receipt permits a bounded reset retry, not redispatch. */ }
  return true;
}
