import { z } from "zod";
import { staffingExactCommandSchema, staffingIdSchema } from "./staffing";
export const staffingCreateMatchSchema = staffingExactCommandSchema;
export const staffingMatchPageSchema = z.object({ resultId: staffingIdSchema, pageSize: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional() }).strict();
