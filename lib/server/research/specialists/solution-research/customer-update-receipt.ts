import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import { researchReceiptSchema } from "./receipt";
import { customerUpdateSchema } from "./customer-update";
import { sourceSchema } from "./schema";
import { discoverySearchSchema } from "./discovery";
const payloadSchema = researchReceiptSchema.shape.payload.omit({ brief: true, customerRecon: true }).extend({
  update: customerUpdateSchema,
  sources: z.array(sourceSchema).max(12),
  discoverySearches: z.array(discoverySearchSchema).max(8).optional(),
}).strict();
export const customerUpdateReceiptSchema = z.object({ payload: payloadSchema, signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type CustomerUpdateReceipt = z.infer<typeof customerUpdateReceiptSchema>;
function signature(payload: z.infer<typeof payloadSchema>) {
  const secret = process.env.TURAS_MAINTENANCE_SECRET;
  if (!secret) throw new Error("Research receipts require TURAS_MAINTENANCE_SECRET.");
  return createHmac("sha256", secret).update("turas-customer-update-v1\n" + JSON.stringify(payloadSchema.parse(payload))).digest("hex");
}
export function signCustomerUpdate(payload: z.infer<typeof payloadSchema>): CustomerUpdateReceipt {
  const parsed = payloadSchema.parse(payload);
  return { payload: parsed, signature: signature(parsed) };
}
export function verifyCustomerUpdate(receipt: CustomerUpdateReceipt, identity: AppIdentity, now = Date.now()) {
  const { payload, signature: provided } = customerUpdateReceiptSchema.parse(receipt);
  const age = now - Date.parse(payload.issuedAt);
  return payload.userId === identity.userId && payload.environmentId === identity.environmentId &&
    payload.workspaceId === identity.workspaceId && age >= 0 && age <= 3600000 &&
    payload.update.accountId === payload.context.accountId &&
    timingSafeEqual(Buffer.from(signature(payload), "hex"), Buffer.from(provided, "hex"));
}
