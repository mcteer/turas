import { z } from "zod";
import { staffingIdSchema, staffingDigestSchema, staffingDateSchema, staffingVersionSchema,
  staffingCommandEnvelopeSchema, staffingExactCommandSchema } from "./staffing";
export const staffingAllocationInputSchema = z.object({ resourceId: staffingIdSchema, demandId: staffingIdSchema,
  demandRevisionId: staffingIdSchema, demandDigest: staffingDigestSchema, expectedDemandVersion: staffingVersionSchema,
  days: z.array(z.object({ date: staffingDateSchema, minutes: z.number().int().min(1).max(960) }).strict()).min(1).max(91),
}).strict().superRefine((allocation, ctx) => {
  const dates = allocation.days.map(day => day.date).sort();
  if (new Set(dates).size !== dates.length || Date.parse(dates.at(-1)!) - Date.parse(dates[0]) > 90 * 86_400_000 ||
    allocation.days.reduce((sum, day) => sum + day.minutes, 0) > 87_360) ctx.addIssue({ code: "custom", message: "Invalid allocation date interval" });
});
export const staffingProposeAllocationSchema = z.object({ ...staffingCommandEnvelopeSchema.shape, allocation: staffingAllocationInputSchema }).strict();
export const staffingReviseAllocationSchema = z.object({ ...staffingExactCommandSchema.shape, allocation: staffingAllocationInputSchema }).strict();
export const staffingReserveAllocationSchema = staffingExactCommandSchema;
export const staffingCancelProposalSchema = staffingExactCommandSchema;
export const staffingAllocationActionSchema = z.enum(["confirm", "amend", "release", "cancel"]);
export const staffingAllocationPreviewSchema = z.object({ ...staffingExactCommandSchema.shape, action: staffingAllocationActionSchema }).strict();
export const staffingAllocationDecisionSchema = z.object({ ...staffingExactCommandSchema.shape,
  action: staffingAllocationActionSchema, reviewPreviewId: staffingIdSchema }).strict();
export type StaffingAllocationInput = z.infer<typeof staffingAllocationInputSchema>;
export const staffingAllocationListSchema = z.object({ customerId: staffingIdSchema,
  demandId: staffingIdSchema.optional(), resourceId: staffingIdSchema.optional(),
  pageSize: z.number().int().min(1).max(50).default(20), cursor: z.string().min(1).max(2048).optional() }).strict();
