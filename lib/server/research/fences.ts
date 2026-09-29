import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";

export async function assertResearchAttemptCurrent(client: PoolClient,
  attemptId: string): Promise<void> {
  const marker = await client.query<{ schema_version: number }>(`
    SELECT schema_version FROM turas_environment LIMIT 1`);
  if ((marker.rows[0]?.schema_version ?? 0) < 25) return;
  const result = await client.query<{ state: string; run_deadline: Date | null }>(`
    SELECT state,run_deadline FROM research_runs
    WHERE conversation_attempt_id=$1`,[attemptId]);
  const row = result.rows[0];
  if (!row) return;
  if (["cancelled","unconfirmed"].includes(row.state) ||
      (row.state === "running" && row.run_deadline &&
        row.run_deadline.getTime() <= Date.now())) {
    throw new HttpFailure(409,"research_context_changed",
      "Research was cancelled or its outcome changed");
  }
}

export async function assertResearchConversationCurrent(client: PoolClient,
  conversationId: string): Promise<void> {
  const attempt = await client.query<{ id: string }>(`
    SELECT id FROM response_attempts WHERE conversation_id=$1
      AND response_state IN ('pending','running','stopping')
      ORDER BY created_at DESC LIMIT 1`,[conversationId]);
  if (attempt.rows[0]) await assertResearchAttemptCurrent(client,attempt.rows[0].id);
}
