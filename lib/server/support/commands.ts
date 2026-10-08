import { createHash, createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { SupportCommand } from "./schema";
import type { SupportActor } from "./policy";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockWorkspaceActor } from "../profiles/policy";
import { lockSupportActor, requireSupportCapability } from "./policy";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Unsupported support digest input");
  return encoded;
}

export function supportDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** Keep every prior key until its environment is retired. First key is current. */
export function supportKeyHashes(identity: readonly string[], keys: readonly string[]): string[] {
  if (!keys.length || keys.some(key => Buffer.byteLength(key, "utf8") < 32))
    throw new HttpFailure(503, "support_key_unavailable", "Support receipt configuration unavailable");
  return [...new Set(keys.map(key => createHmac("sha256", key).update(canonical(identity)).digest("hex")))];
}

function receiptKeys(): string[] {
  const configured = process.env.TURAS_010_RECEIPT_HASH_KEYS;
  if (!configured) return [getServerConfig().TURAS_MAINTENANCE_SECRET];
  let keys: unknown;
  try { keys = JSON.parse(configured); } catch { keys = null; }
  if (!Array.isArray(keys) || keys.length > 32 || keys.some(key => typeof key !== "string"))
    throw new HttpFailure(503, "support_key_unavailable", "Support receipt configuration unavailable");
  return keys as string[];
}

export function supportReceiptKeyHashes(environmentId: string, workspaceId: string, membershipId: string, requestKey: string) {
  return supportKeyHashes([environmentId, workspaceId, membershipId, requestKey], receiptKeys());
}

export type SupportReceipt = {
  id: string; operation: SupportCommand["operation"]; scopeId: string; recordId: string;
  revisionId: string; decisionId: string | null; outcome: "proposed" | "accepted" | "rejected" | "withdrawn";
};

/** Caller first holds live authority locks. Cleanup must use this same mutex. */
export async function lockSupportCommandKey(db: PoolClient, actor: SupportActor, requestKey: string): Promise<string[]> {
  const hashes = await acquireSupportCommandMutex(db, actor, requestKey);
  if ((await db.query("SELECT 1 FROM support_expired_command_keys WHERE key_hash=ANY($1::text[])", [hashes])).rowCount)
    throw new HttpFailure(409, "expired_receipt", "This request key has expired; reconcile before starting new work");
  return hashes;
}

async function acquireSupportCommandMutex(db: PoolClient, actor: SupportActor, requestKey: string): Promise<string[]> {
  const identity = [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey];
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`support-command:${supportDigest(identity)}`]);
  return supportKeyHashes(identity, receiptKeys());
}

/** Take the mutex in a separate statement so the following lookup observes any
 * cleanup that committed while acquisition waited. Expiry and receipt metadata
 * can then share a single fresh snapshot without permitting an expired retry. */
export async function lockAndReadSupportReceipt(db: PoolClient, actor: SupportActor, customerId: string,
  requestKey: string, digest: string): Promise<SupportReceipt | null> {
  const hashes = await acquireSupportCommandMutex(db, actor, requestKey);
  const row = (await db.query(`SELECT EXISTS(SELECT 1 FROM support_expired_command_keys
      WHERE key_hash=ANY($5::text[])) AS expired,r.* FROM (SELECT 1) singleton
    LEFT JOIN LATERAL (SELECT r.id,r.operation,r.scope_id,r.record_id,r.revision_id,r.decision_id,r.outcome,r.request_digest,
      s.customer_id FROM support_command_receipts r JOIN support_scopes s ON s.id=r.scope_id
      WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.actor_membership_id=$3 AND r.request_key=$4) r ON true`,
  [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey, hashes])).rows[0];
  if (row.expired) throw new HttpFailure(409, "expired_receipt", "This request key has expired; reconcile before starting new work");
  return checkedSupportReceipt(row.id ? row : undefined, customerId, digest);
}

export async function supportReceiptForCommand(db: Pick<PoolClient, "query">, actor: SupportActor, customerId: string,
  requestKey: string, digest?: string): Promise<SupportReceipt | null> {
  const row = (await db.query(`SELECT r.id,r.operation,r.scope_id,r.record_id,r.revision_id,r.decision_id,r.outcome,r.request_digest,
      s.customer_id FROM support_command_receipts r JOIN support_scopes s ON s.id=r.scope_id
      WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.actor_membership_id=$3 AND r.request_key=$4`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey])).rows[0];
  return checkedSupportReceipt(row, customerId, digest);
}

type SupportReceiptRow = { id: string; operation: SupportReceipt["operation"]; scope_id: string; record_id: string;
  revision_id: string; decision_id: string | null; outcome: SupportReceipt["outcome"]; customer_id: string; request_digest: string };
function checkedSupportReceipt(row: SupportReceiptRow | undefined, customerId: string, digest?: string): SupportReceipt | null {
  if (!row) return null;
  if (row.customer_id !== customerId) throw hiddenRecord();
  if (digest !== undefined && row.request_digest !== digest)
    throw new HttpFailure(409, "request_key_conflict", "Request key was used for different content");
  return { id: row.id, operation: row.operation, scopeId: row.scope_id, recordId: row.record_id,
    revisionId: row.revision_id, decisionId: row.decision_id, outcome: row.outcome };
}

export async function enforceSupportRate(db: Pick<PoolClient, "query">, actor: SupportActor, kind: "read" | "write"): Promise<void> {
  const config = getServerConfig(), now = Date.now();
  const start = new Date(Math.floor(now / 60_000) * 60_000), expiry = new Date(start.getTime() + 60_000);
  const hash = createHmac("sha256", config.TURAS_MAINTENANCE_SECRET)
    .update(`support-v1:${actor.workspaceId}:${actor.membershipId}:${kind}`).digest("hex");
  const result = await db.query<{ count: number }>(`INSERT INTO rate_windows
    (environment_id,key_hash,category,window_start,count,expires_at) VALUES($1,$2,$3,$4,1,$5)
    ON CONFLICT(environment_id,key_hash,category,window_start)
    DO UPDATE SET count=rate_windows.count+1 WHERE rate_windows.count<$6 RETURNING count`,
  [config.TURAS_ENVIRONMENT_ID, hash, `support_${kind}`, start, expiry, kind === "read" ? 60 : 30]);
  if (!result.rows.length)
    throw new HttpFailure(429, "rate_limited", "Support request limit reached",
      Math.max(1, Math.ceil((expiry.getTime() - now) / 1000)));
}

export async function readSupportReceipt(actor: SupportActor, requestKey: string) {
  return withTransaction(async db => {
    await lockWorkspaceActor(db, actor, undefined, true);
    requireSupportCapability(actor, "propose");
    const row = (await db.query(`SELECT s.customer_id,r.audience FROM support_command_receipts c
      JOIN support_scopes s ON s.id=c.scope_id JOIN support_records r ON r.id=c.record_id
      WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.actor_membership_id=$3 AND c.request_key=$4`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey])).rows[0];
    if (!row) {
      await lockSupportCommandKey(db, actor, requestKey);
      throw hiddenRecord();
    }
    await lockSupportActor(db, actor, row.customer_id, "read", row.audience);
    await lockSupportCommandKey(db, actor, requestKey);
    await enforceSupportRate(db, actor, "read");
    const receipt = await supportReceiptForCommand(db, actor, row.customer_id, requestKey);
    if (!receipt) throw hiddenRecord();
    return { ...receipt, requestKey, state: "committed" as const };
  });
}
