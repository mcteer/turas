import { z } from "zod";
import type { AppIdentity } from "../identity";
import { database, ensureDatabase } from "../database";
import { accountIdSchema } from "../account-id";
import { researchReceiptSchema, verifyResearch, type ResearchReceipt } from "./receipt";

import { customerUpdateReceiptSchema, verifyCustomerUpdate, type CustomerUpdateReceipt } from "./customer-update-receipt";

export const researchReferenceSchema = z.object({
  accountId: accountIdSchema,
  researchId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ResearchReference = z.infer<typeof researchReferenceSchema>;
const scope = (identity: AppIdentity) => [
  identity.environmentId, identity.workspaceId, identity.userId,
];

export async function storeResearchArtifact(
  receipt: ResearchReceipt,
  identity: AppIdentity,
  signal: AbortSignal,
): Promise<ResearchReference> {
  const checked = researchReceiptSchema.parse(receipt);
  if (!verifyResearch(checked, identity)) throw new Error("Invalid research artifact.");
  return storeArtifact(checked, identity, signal);
}

export async function storeCustomerUpdateArtifact(receipt: CustomerUpdateReceipt, identity: AppIdentity, signal: AbortSignal) {
  const checked = customerUpdateReceiptSchema.parse(receipt);
  if (!verifyCustomerUpdate(checked, identity)) throw new Error("Invalid customer update artifact.");
  return storeArtifact(checked, identity, signal);
}

async function storeArtifact(checked: ResearchReceipt | CustomerUpdateReceipt, identity: AppIdentity, signal: AbortSignal): Promise<ResearchReference> {
  signal.throwIfAborted();
  const sql = database();
  if (!sql) throw new Error("Research artifacts require Postgres.");
  await ensureDatabase();
  signal.throwIfAborted();
  // The signature is a stable content identifier. Replays cannot replace evidence.
  await sql.query(
    `INSERT INTO turas_research_artifacts
     (id,environment_id,workspace_id,owner_user_id,account_id,receipt,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (id) DO NOTHING`,
    [checked.signature, ...scope(identity), checked.payload.context.accountId,
      JSON.stringify(checked), new Date(Date.parse(checked.payload.issuedAt) + 3600000).toISOString()],
  );
  await purgeExpiredResearchArtifacts(identity);
  signal.throwIfAborted();
  return { accountId: checked.payload.context.accountId, researchId: checked.signature };
}

export async function loadResearchArtifact(
  reference: ResearchReference,
  identity: AppIdentity,
  signal: AbortSignal,
): Promise<ResearchReceipt | null> {
  const receipt = researchReceiptSchema.safeParse(await loadArtifact(reference, identity, signal));
  return receipt.success && verifyResearch(receipt.data, identity) ? receipt.data : null;
}

export async function loadCustomerUpdateArtifact(reference: ResearchReference, identity: AppIdentity, signal: AbortSignal) {
  const receipt = customerUpdateReceiptSchema.safeParse(await loadArtifact(reference, identity, signal));
  return receipt.success && verifyCustomerUpdate(receipt.data, identity) ? receipt.data : null;
}

async function loadArtifact(reference: ResearchReference, identity: AppIdentity, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const checked = researchReferenceSchema.parse(reference);
  const sql = database();
  if (!sql) throw new Error("Research artifacts require Postgres.");
  await ensureDatabase();
  signal.throwIfAborted();
  const rows = await sql.query(
    `SELECT receipt FROM turas_research_artifacts WHERE id=$1 AND environment_id=$2
     AND workspace_id=$3 AND owner_user_id=$4 AND account_id=$5 AND expires_at>now()`,
    [checked.researchId, ...scope(identity), checked.accountId],
  );
  signal.throwIfAborted();
  if (!rows[0]) return null;
  const { receipt } = z.object({ receipt: z.object({ signature: z.string(), payload: z.object({ context: z.object({ accountId: z.string() }) }) }).passthrough() }).parse(rows[0]);
  if (receipt.signature !== checked.researchId || receipt.payload.context.accountId !== checked.accountId) return null;
  return rows[0].receipt;
}

export async function purgeExpiredResearchArtifacts(identity: AppIdentity) {
  const sql = database();
  if (!sql) throw new Error("Research artifacts require Postgres.");
  await sql.query(
    `DELETE FROM turas_research_artifacts WHERE id IN
     (SELECT id FROM turas_research_artifacts WHERE environment_id=$1 AND workspace_id=$2
      AND owner_user_id=$3 AND expires_at<=now() ORDER BY expires_at LIMIT 100)`,
    scope(identity),
  );
}
