import {withOperationalProviderIo} from '../../../operations/admission';
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import { evidenceDatabase } from "./database";
import { cachePolicy } from "./schema";

const rowSchema = z.object({ value: z.unknown(), failed: z.boolean(), checked_at: z.coerce.date(), expires_at: z.coerce.date() });
export class EvidenceBackoffError extends Error {
  constructor() { super("This source recently failed. Preserve the gap and retry after its backoff, rather than restarting research."); }
}
async function cachedFetchWithinFence<T>(
  identity: Pick<AppIdentity, "environmentId" | "workspaceId">, key: string, schema: z.ZodType<T>,
  fetchValue: () => Promise<T>, signal: AbortSignal,
  options: { notBefore?: Date; ttl?: (value: T) => number } = {},
) {
  const sql = await evidenceDatabase();
  const scope = [identity.environmentId, identity.workspaceId, key];
  const lease = randomUUID();
  const deadline = Date.now() + 75000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const rows = await sql.query(`SELECT value,failed,checked_at,expires_at FROM turas_evidence_fetches
      WHERE environment_id=$1 AND workspace_id=$2 AND key=$3 AND expires_at>now()
      AND (failed OR $4::timestamptz IS NULL OR checked_at >= $4)`, [...scope, options.notBefore?.toISOString() ?? null]);
    if (rows[0]) {
      const row = rowSchema.parse(rows[0]);
      if (row.failed) throw new EvidenceBackoffError();
      const parsed = schema.safeParse(row.value);
      if (parsed.success) {
        console.info(JSON.stringify({ event: "research_cache.fetch", key, outcome: "hit" }));
        return { value: parsed.data, hit: true, checkedAt: row.checked_at.toISOString(), refreshAfter: row.expires_at.toISOString() };
      }
      await sql.query(`UPDATE turas_evidence_fetches SET expires_at=now()
        WHERE environment_id=$1 AND workspace_id=$2 AND key=$3 AND checked_at=$4`, [...scope, row.checked_at.toISOString()]);
    }
    const claimed = await sql.query(`INSERT INTO turas_evidence_fetches(environment_id,workspace_id,key,lease_id,lease_until)
      VALUES($1,$2,$3,$4,now()+interval '90 seconds')
      ON CONFLICT(environment_id,workspace_id,key) DO UPDATE SET lease_id=$4,lease_until=now()+interval '90 seconds'
      WHERE (turas_evidence_fetches.lease_until IS NULL OR turas_evidence_fetches.lease_until<=now())
        AND (turas_evidence_fetches.expires_at<=now() OR ($5::timestamptz IS NOT NULL AND turas_evidence_fetches.checked_at<$5))
      RETURNING key`, [...scope, lease, options.notBefore?.toISOString() ?? null]);
    if (!claimed.length) { await delay(1000, undefined, { signal }); continue; }
    try {
      const value = schema.parse(await fetchValue());
      signal.throwIfAborted();
      const checkedAt = new Date().toISOString();
      const refreshAfter = new Date(Date.now() + (options.ttl?.(value) ?? cachePolicy.recheckMs)).toISOString();
      const written = await sql.query(`UPDATE turas_evidence_fetches SET value=$5::jsonb,checked_at=$6,expires_at=$7,
        failed=false,lease_id=NULL,lease_until=NULL WHERE environment_id=$1 AND workspace_id=$2 AND key=$3 AND lease_id=$4
        AND lease_until>now() RETURNING key`, [...scope, lease, JSON.stringify(value), checkedAt, refreshAfter]);
      if (!written.length) throw new Error("Evidence fetch lease expired before publication.");
      console.info(JSON.stringify({ event: "research_cache.fetch", key, outcome: "miss" }));
      return { value, hit: false, checkedAt, refreshAfter };
    } catch (error) {
      await sql.query(`UPDATE turas_evidence_fetches SET lease_id=NULL,lease_until=NULL,
        failed=$5,value=NULL,checked_at=now(),expires_at=$6
        WHERE environment_id=$1 AND workspace_id=$2 AND key=$3 AND lease_id=$4`,
        [...scope, lease, !signal.aborted, new Date(Date.now() + (signal.aborted ? 0 : cachePolicy.failureMs)).toISOString()]);
      throw error;
    }
  }
  throw new Error("Another request is retrieving this source. Retry shortly; do not duplicate the fetch.");
}

export async function cachedFetch<T>(
  identity: Pick<AppIdentity, "environmentId" | "workspaceId">, key: string, schema: z.ZodType<T>,
  fetchValue: () => Promise<T>, signal: AbortSignal,
  options: { notBefore?: Date; ttl?: (value: T) => number } = {},
) {
 return withOperationalProviderIo(()=>cachedFetchWithinFence(identity,key,schema,fetchValue,signal,options),signal);
}
