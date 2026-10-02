import { z } from "zod";
import { staffingIdSchema, staffingDigestSchema, staffingVersionSchema, staffingRequestKeySchema, STAFFING_LIMITS } from "./staffing";
export const staffingAdvisoryStartSchema = z.object({ requestKey: staffingRequestKeySchema,
  customerId: staffingIdSchema, demandId: staffingIdSchema, revisionId: staffingIdSchema,
  contentDigest: staffingDigestSchema, expectedAggregateVersion: staffingVersionSchema,
  mode: z.enum(["operational", "finance"]), scenarioId: staffingIdSchema.nullable(),
  instructions: z.string().transform(value => value.replace(/\r\n?/g, "\n").normalize("NFC").trim())
    .pipe(z.string().min(1).max(STAFFING_LIMITS.advisoryInstructions))
    .refine(value => new TextEncoder().encode(value).byteLength <= 16_384,
      "Instructions exceed the native message byte limit"),
}).strict().refine(input => input.mode === "finance" || input.scenarioId === null, "Operational advice cannot bind a finance scenario");
