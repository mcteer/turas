import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import { reuseSchema } from "../research-cache/schema";
import {
  customerContextSchema,
  researchBriefSchema,
  sourceSchema,
} from "./schema";

export const reconProvenanceSchema = z.object({ accountId: z.string(), researchId: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: z.iso.datetime(), blockers: z.array(z.string()).max(100), conflicts: z.array(z.string()).max(5).optional(), unknowns: z.array(z.string()).max(8).optional() }).strict();

const payloadSchema = z
  .object({
    userId: z.string(),
    environmentId: z.string(),
    workspaceId: z.string(),
    issuedAt: z.iso.datetime(),
    reusedFrom: reuseSchema.optional(),
    context: customerContextSchema,
    brief: researchBriefSchema,
    sources: z.array(sourceSchema).max(20),
    blockers: z.array(z.string()).max(100),
    customerRecon: reconProvenanceSchema.optional(),
  })
  .strict();
export const researchReceiptSchema = z
  .object({
    payload: payloadSchema,
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ResearchReceipt = z.infer<typeof researchReceiptSchema>;
function secret() {
  const value = process.env.TURAS_MAINTENANCE_SECRET;
  if (!value)
    throw new Error("Research receipts require TURAS_MAINTENANCE_SECRET.");
  return value;
}
function signature(payload: z.infer<typeof payloadSchema>) {
  return createHmac("sha256", secret())
    .update(
      "turas-solution-research-v1\n" +
        JSON.stringify(payloadSchema.parse(payload)),
    )
    .digest("hex");
}
export function signResearch(
  payload: z.infer<typeof payloadSchema>,
): ResearchReceipt {
  const parsed = payloadSchema.parse(payload);
  return { payload: parsed, signature: signature(parsed) };
}
export function verifyResearch(
  receipt: ResearchReceipt,
  identity: AppIdentity,
  now = Date.now(),
) {
  const { payload, signature: provided } = researchReceiptSchema.parse(receipt);
  const age = now - Date.parse(payload.issuedAt);
  return (
    payload.userId === identity.userId &&
    payload.environmentId === identity.environmentId &&
    payload.workspaceId === identity.workspaceId &&
    age >= 0 &&
    age <= 60 * 60 * 1000 &&
    timingSafeEqual(
      Buffer.from(signature(payload), "hex"),
      Buffer.from(provided, "hex"),
    )
  );
}
