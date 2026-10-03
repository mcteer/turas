import type { PoolClient } from "pg";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { ExecutionActor } from "./policy";

export async function executionCustomer(db: PoolClient, actor: ExecutionActor, engagementId: string): Promise<string> {
  const row = (await db.query<{ customer_id: string }>(`SELECT customer_id FROM engagements
    WHERE id=$1 AND workspace_id=$2 AND environment_id=$3 AND (audience='delivery' OR $4='internal')`, [engagementId, actor.workspaceId,
    process.env.TURAS_ENVIRONMENT_ID, actor.kind])).rows[0];
  if (!row) throw hiddenRecord();
  return row.customer_id;
}
export async function chargeExecutionRate(db: PoolClient, actor: ExecutionActor,
  bucket: "read" | "write" | "review" | "advice"): Promise<void> {
  const limit = { read: 120, write: 60, review: 20, advice: 5 }[bucket];
  const unit = bucket === "advice" ? "hour" : "minute";
  const row = (await db.query<{ count: number; retry: number }>(`INSERT INTO execution_rate_windows
    (environment_id,workspace_id,membership_id,bucket,window_start,count)
    VALUES($1,$2,$3,$4,date_trunc('${unit}',clock_timestamp()),1)
    ON CONFLICT(environment_id,workspace_id,membership_id,bucket,window_start)
    DO UPDATE SET count=execution_rate_windows.count+1 WHERE execution_rate_windows.count<$5
    RETURNING count,EXTRACT(EPOCH FROM(window_start+interval '1 ${unit}'-clock_timestamp()))::int AS retry`,
    [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, bucket, limit])).rows[0];
  if (!row) throw new HttpFailure(429, "rate_limited", "Execution intake limit reached", bucket === "advice" ? 3600 : 60);
}
