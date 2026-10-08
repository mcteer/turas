import { hiddenRecord } from "../../contracts/http";
import { validateSupportAdviceResult } from "../../support/advice";
import { supportId } from "../../contracts/support";
import type { SupportActor } from "./policy";
import { lockSupportActor } from "./policy";
import { supportTransaction } from "./service";
import { boundSupportToolActor } from "./tool-actor";
import { getServerConfig } from "../config";
import { supportDigest } from "./commands";

export async function readSupportAdviceStatus(actor: SupportActor, attemptId: string) {
  if (!supportId.safeParse(attemptId).success) throw hiddenRecord();
  return supportTransaction(async db => {
    const row = (await db.query(`SELECT a.*,b.customer_id,b.audience,b.workload_id,c.context_login_session_id,c.owner_principal_id,c.eve_session_id,c.creation_operation_id,
      r.dispatch_state,r.response_state,r.native_turn_id AS response_turn,r.output_tokens,j.state AS watchdog_state
      FROM support_advice_attempts a JOIN support_advice_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
      LEFT JOIN response_attempts r ON r.id=a.response_attempt_id LEFT JOIN watchdog_jobs j ON j.attempt_id=r.id
      WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.owner_membership_id=$4`,
    [attemptId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId])).rows[0];
    if (!row || row.owner_principal_id !== actor.principalId || row.context_login_session_id !== actor.sessionId) throw hiddenRecord();
    await lockSupportActor(db, actor, row.customer_id, "read", row.audience);
    let output = null;
    if (row.state === "completed" && row.response_attempt_id) {
      try {
        const bound = await boundSupportToolActor(db, { principalId: actor.principalId,
          attributes: { turasAttemptId: row.response_attempt_id } }, undefined, true);
        const retained = (await db.query("SELECT payload,content_digest FROM support_advice_payloads WHERE attempt_id=$1 AND kind='output'", [attemptId])).rows[0];
        if (retained && retained.content_digest === row.output_digest && supportDigest(retained.payload) === row.output_digest)
          output = validateSupportAdviceResult(retained.payload, bound.refs.map(ref => ref.id));
      } catch (error) {
        if (!(error && typeof error === "object" && "status" in error)) throw error;
      }
    }
    return { attemptId, conversationId: row.conversation_id as string, state: row.state as string,
      operationId: row.creation_operation_id as string, nativeSessionId: row.eve_session_id as string | null,
      nativeRequestId: row.native_request_id as string, responseAttemptId: row.response_attempt_id as string | null,
      dispatchState: row.dispatch_state as string | null, responseState: row.response_state as string | null,
      nativeTurnId: row.response_turn as string | null, deadlineAt: row.deadline_at?.toISOString() ?? null,
      failureCode: row.failure_code as string | null, outputTokens: row.output_tokens as number | null,
      watchdogState: row.watchdog_state as string | null, outputReadable: output !== null,
      outputDigest: output ? row.output_digest as string : null, output };
  });
}
