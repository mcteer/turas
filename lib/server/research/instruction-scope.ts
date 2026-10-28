import { z } from "zod";
import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import type { FeaturePrincipal } from "../conversations/feature";

/** Instruction selection only; research tools independently enforce authority. */
export async function hasBoundResearchAttempt(principal: FeaturePrincipal): Promise<boolean> {
  return withTransaction((db) => hasBoundResearchAttemptInTransaction(db, principal));
}

export async function hasBoundResearchAttemptInTransaction(db: PoolClient,
  principal: FeaturePrincipal): Promise<boolean> {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (!z.uuid().safeParse(attemptId).success ||
      !z.uuid().safeParse(principal?.principalId).success) return false;
  return Boolean((await db.query(`
    SELECT 1 FROM research_runs run
    JOIN research_requests request ON request.id=run.request_id
    JOIN response_attempts attempt ON attempt.id=run.conversation_attempt_id
    JOIN conversations conversation ON conversation.id=attempt.conversation_id
    WHERE attempt.id=$1 AND conversation.owner_principal_id=$2
      AND conversation.environment_id=$3 AND run.environment_id=$3
      AND request.conversation_id=conversation.id
      AND run.state IN ('queued','running','completed','partial')
    LIMIT 1`, [attemptId, principal!.principalId,
    getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount);
}
