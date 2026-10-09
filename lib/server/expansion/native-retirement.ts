import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";

function signature(session: string, attempt: string, at: number) {
  return createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET)
    .update(`expansion-retirement-v1\n${session}\n${attempt}\n${at}`).digest("hex");
}

export function signExpansionRetirement(session: string, attempt: string) {
  const at = Date.now();
  return { "x-turas-expansion-retire-at": String(at), "x-turas-expansion-retire-attempt": attempt,
    "x-turas-expansion-retire-signature": signature(session, attempt, at) };
}

export async function authorizeExpansionRetirement(request: Request, session: string): Promise<string | null> {
  const attempt = request.headers.get("x-turas-expansion-retire-attempt");
  const at = Number(request.headers.get("x-turas-expansion-retire-at"));
  const signed = request.headers.get("x-turas-expansion-retire-signature");
  if (!attempt || !/^[a-f0-9-]{36}$/.test(attempt) || !Number.isSafeInteger(at) || Math.abs(Date.now() - at) > 30000 ||
    !signed || !/^[a-f0-9]{64}$/.test(signed)) return null;
  if (!timingSafeEqual(Buffer.from(signed, "hex"), Buffer.from(signature(session, attempt, at), "hex"))) return null;
  return withTransaction(async db => (await db.query(`SELECT c.owner_principal_id
    FROM expansion_native_retirement_receipts n JOIN expansion_advice_retirements r ON r.attempt_id=n.attempt_id
    JOIN expansion_advice_attempts a ON a.id=r.attempt_id JOIN conversations c ON c.id=a.conversation_id
    WHERE a.id=$1 AND a.environment_id=$2 AND c.eve_session_id=$3 AND n.state='pending'`,
  [attempt, getServerConfig().TURAS_ENVIRONMENT_ID, session])).rows[0]?.owner_principal_id ?? null);
}

/** Reset only the retired native identity; never retry a paid generation. */
export async function processExpansionNativeRetirement(): Promise<boolean> {
  const origin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(origin)) return false;
  const job = await withTransaction(async db => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    if (Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [env])).rows[0]?.schema_version ?? 0) < 47) return null;
    await db.query(`INSERT INTO expansion_native_retirement_receipts(attempt_id)
      SELECT r.attempt_id FROM expansion_advice_retirements r JOIN expansion_advice_attempts a ON a.id=r.attempt_id
      WHERE a.environment_id=$1 ON CONFLICT DO NOTHING`, [env]);
    const row = (await db.query(`SELECT n.attempt_id,c.eve_session_id FROM expansion_native_retirement_receipts n
      JOIN expansion_advice_attempts a ON a.id=n.attempt_id JOIN conversations c ON c.id=a.conversation_id
      WHERE a.environment_id=$1 AND n.state='pending' AND n.next_attempt_at<=now()
      ORDER BY n.next_attempt_at,n.attempt_id FOR UPDATE OF n SKIP LOCKED LIMIT 1`, [env])).rows[0];
    if(row&&!row.eve_session_id){await db.query("UPDATE expansion_native_retirement_receipts SET state='done',completed_at=now() WHERE attempt_id=$1",[row.attempt_id]);return {attempt_id:row.attempt_id,eve_session_id:null};}
    if (row) await db.query(`UPDATE expansion_native_retirement_receipts
      SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE attempt_id=$1`, [row.attempt_id]);
    return row;
  });
  if (!job) return false;
  if(!job.eve_session_id)return true;
  try {
    const response = await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.eve_session_id)}/reset`, {
      method: "POST", headers: { "content-type": "application/json", ...signExpansionRetirement(job.eve_session_id, job.attempt_id) },
      body: JSON.stringify({ reason: "Expansion advice retired" }), signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    if (response.ok || response.status === 409 && body.includes("no_active_session"))
      await withTransaction(async db => { await db.query(`UPDATE expansion_native_retirement_receipts
        SET state='done',completed_at=now() WHERE attempt_id=$1`, [job.attempt_id]); });
  } catch { /* A pending receipt permits a bounded reset retry, not redispatch. */ }
  return true;
}
