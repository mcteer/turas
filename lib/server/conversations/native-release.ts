import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { conversationFeature } from "./feature";
import { prepareStaffingNativeRelease, assertStaffingNativeRelease, type StaffingNativeRelease } from "../staffing/native-release";
import { prepareExecutionNativeRelease, assertExecutionNativeRelease, type ExecutionNativeRelease } from "../execution/native-release";
export type GovernedNativeRelease = (StaffingNativeRelease & { kind: "staffing" }) | (ExecutionNativeRelease & { kind: "execution" });
type Expected = { actor?: CurrentSession; nativeSessionId?: string; responseAttemptId?: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
export async function prepareGovernedNativeRelease(conversationId: string, expected?: Expected): Promise<GovernedNativeRelease | null> {
  const feature = await withTransaction(db => conversationFeature(db, conversationId));
  if (feature.kind === "execution") { const release = await prepareExecutionNativeRelease(conversationId, expected); if (!release) throw hiddenRecord(); return { ...release, kind: "execution" }; }
  if (feature.kind === "staffing") { const release = await prepareStaffingNativeRelease(conversationId, expected); if (!release) throw hiddenRecord(); return { ...release, kind: "staffing" }; }
  return null;
}
export async function prepareGovernedReleaseForNative(nativeSessionId: string, expected?: Expected) {
  const conversationId = await withTransaction(async db => {
    const row = (await db.query("SELECT id,owner_principal_id,workspace_id FROM conversations WHERE eve_session_id=$1 AND environment_id=$2 AND binding_state='bound'", [nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row || expected?.actor && (row.owner_principal_id !== expected.actor.principalId || row.workspace_id !== expected.actor.workspaceId)) throw hiddenRecord();
    return row.id as string;
  });
  return prepareGovernedNativeRelease(conversationId, { ...expected, nativeSessionId });
}
export async function assertGovernedNativeRelease(db: PoolClient, prepared: GovernedNativeRelease, actor?: CurrentSession) {
  const feature = await conversationFeature(db, prepared.conversationId);
  if (feature.kind !== prepared.kind) throw hiddenRecord();
  return prepared.kind === "execution" ? assertExecutionNativeRelease(db, prepared, actor) : assertStaffingNativeRelease(db, prepared, actor);
}
