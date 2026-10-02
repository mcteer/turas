import { z } from "zod";
import { staffingDateSchema, staffingIdSchema } from "./staffing";
/** Delivery allowlist: no source, skill, calendar category, rationale or money. */
export const staffingAssignmentSchema = z.object({ assignmentId: staffingIdSchema,
  displayName: z.string().min(1).max(160).nullable(), deliveryRole: z.string().min(1).max(100).nullable(),
  days: z.array(z.object({ date: staffingDateSchema, minutes: z.number().int().min(1).max(960) }).strict()).max(91),
  reviewRequired: z.boolean() }).strict();
export const staffingAssignmentPageSchema = z.object({ items: z.array(staffingAssignmentSchema).max(50),
  nextCursor: z.string().min(1).max(2048).nullable() }).strict();
