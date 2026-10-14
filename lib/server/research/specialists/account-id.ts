import { z } from "zod";
// The current canonical customer inventory uses UUIDs.
export const accountIdSchema = z.uuid();
