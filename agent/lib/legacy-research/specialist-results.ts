import { z } from "zod";
import { researchReferenceSchema } from "../../../lib/server/research/specialists/solution-research/research-reference";
export const specialistResults={
  'customer-recon':z.object({kind:z.literal('customer-update'),status:z.enum(['ready','incomplete','unavailable']),reference:researchReferenceSchema.nullable(),reason:z.string().max(2000)}),
  'vercel-best-practices':z.object({kind:z.literal('best-practices'),status:z.enum(['ready','incomplete','unavailable']),reference:z.string().nullable(),reason:z.string().max(2000)}),
  'implementation-research':z.object({kind:z.literal('solution').optional(),status:z.enum(['ready','incomplete','unavailable']),reference:researchReferenceSchema.nullable(),reason:z.string().max(2000)}),
};
