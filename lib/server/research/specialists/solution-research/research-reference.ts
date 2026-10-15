import { z } from "zod";
import { accountIdSchema } from "../account-id";
export const researchReferenceSchema=z.object({accountId:accountIdSchema,
  researchId:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type ResearchReference=z.infer<typeof researchReferenceSchema>;
