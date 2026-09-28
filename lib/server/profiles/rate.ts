import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { ProfileActor } from "./policy";

export async function enforceProfileRate(client: PoolClient, actor: ProfileActor,
  customerId: string, kind: "read" | "write"): Promise<void> {
  const config = getServerConfig();
  const limit = kind === "read" ? 120 : 30;
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const expiry = new Date(start.getTime() + 60_000);
  const key = createHmac("sha256", config.TURAS_MAINTENANCE_SECRET)
    .update(`profile-v1:${actor.workspaceId}:${actor.membershipId}:${customerId}:${kind}`)
    .digest("hex");
  const result = await client.query<{ count: number }>(`INSERT INTO rate_windows
    (environment_id,key_hash,category,window_start,count,expires_at)
    VALUES ($1,$2,$3,$4,1,$5)
    ON CONFLICT (environment_id,key_hash,category,window_start)
    DO UPDATE SET count=rate_windows.count+1 RETURNING count`,
  [config.TURAS_ENVIRONMENT_ID, key, `profile_${kind}`, start, expiry]);
  if ((result.rows[0]?.count ?? 0) > limit) {
    throw new HttpFailure(429, "rate_limited", "Profile request limit reached",
      Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 1_000)));
  }
}
