import { z } from "zod";
import { governedIdSchema,idempotencyKeySchema,positiveRevisionSchema } from "./retrieval";

export const conflictEndpointSchema = z.object({
  kind: z.enum(["accepted_profile","verified_research","published_shared"]),
  revisionId: governedIdSchema,
}).strict();
export const conflictFlagSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  scope: z.enum(["customer","shared"]),customerId: governedIdSchema.optional(),
  first: conflictEndpointSchema,second: conflictEndpointSchema,
  periodStart: z.iso.date(),periodEnd: z.iso.date(),
  rationale: z.string().trim().min(1).max(2_000),
}).strict().superRefine((value,ctx) => {
  if ((value.scope === "customer") !== Boolean(value.customerId) ||
      (value.scope === "shared" &&
        (value.first.kind !== "published_shared" || value.second.kind !== "published_shared")) ||
      (value.first.kind === value.second.kind &&
        value.first.revisionId === value.second.revisionId) ||
      value.periodStart > value.periodEnd) {
    ctx.addIssue({ code: "custom",message: "Invalid conflict scope or endpoints" });
  }
});
export const conflictDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  expectedVersion: positiveRevisionSchema,
  action: z.enum(["confirm","resolve"]),
  rationale: z.string().trim().min(1).max(2_000),
}).strict();
