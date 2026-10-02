import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { recordKindSchema } from "../../lib/contracts/profile-payloads";
import { HttpFailure } from "../../lib/contracts/http";

const inputSchema = z.object({
  kind: recordKindSchema.optional(), workloadId: z.uuid().optional(),
  query: z.string().max(200).optional(), page: z.number().int().min(1).max(10).default(1),
  limit: z.number().int().min(1).max(20).default(20),
}).strict();

export const authoredTool = defineTool({
  description: "Read currently authorized, cited accepted customer facts and attributed research for this bound customer. Results may be partial or expire. No pending claims are returned.",
  inputSchema,
  async execute(input, ctx) {
    return withTransaction(async (client) => {
      const bound = await boundToolActor(client, ctx.session.auth.current);
      if (bound.planning && input.workloadId &&
          input.workloadId!==bound.planning.workloadId) {
        throw new HttpFailure(409,"context_changed","Planning workload changed");
      }
      const result = await readEligibleContext(bound.actor, bound.customerId,
        bound.planning ? {...input,audience:bound.planning.audience,
          workloadId:bound.planning.workloadId ?? undefined,
          customerWideOnly:bound.planning.workloadId===null}:input, client) as {
        contextVersion: string; [key: string]: unknown };
      if (result.contextVersion !== bound.generation) {
        throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
      }
      return result;
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return !scope && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
