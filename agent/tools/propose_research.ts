import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { responseFeature } from "../../lib/server/conversations/feature";
import { createHash } from "node:crypto";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { createResearchPreview } from "../../lib/server/research/requests";
import { HttpFailure } from "../../lib/contracts/http";

const inputSchema = z.discriminatedUnion("mode",[
  z.object({ mode: z.literal("recon"),publicName: z.string().trim().min(1).max(200),
    publicDomain: z.string().trim().min(1).max(200) }).strict(),
  z.object({ mode: z.literal("practices"),product: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(200),topic: z.string().trim().min(1).max(200) }).strict(),
  z.object({ mode: z.literal("fit"),evidenceReceiptIds: z.array(z.uuid()).min(1).max(10) }).strict(),
]);

export const authoredTool = defineTool({
  description: "Prepare an inert public research preview for the bound customer and owned conversation. Does not send anything to a provider. Recon public identity must be confirmed by the user in the UI before a preview can be created. The user alone starts admitted research.",
  inputSchema,
  async execute(input,ctx) {
    const bound = await withTransaction(async (client) => {
      const current = await boundToolActor(client,ctx.session.auth.current);
      if (current.planning) throw new HttpFailure(403,"planning_tool_denied",
        "Start research separately from this planning turn");
      const attempt = await client.query<{ conversation_id: string }>(`
        SELECT conversation_id FROM response_attempts WHERE id=$1`,[current.attemptId]);
      if (!attempt.rows[0]) throw new HttpFailure(409,"context_changed","Conversation unavailable");
      return { ...current,conversationId: attempt.rows[0].conversation_id };
    });
    if (input.mode === "recon") {
      return { mode: "recon",publicName: input.publicName,
        publicDomain: input.publicDomain,previewCreated: false,
        nextAction: "Ask the user to confirm the public identity in the research preview UI" };
    }
    const idempotencyKey = createHash("sha256")
      .update(`propose-research-v1:${ctx.callId}`).digest("hex");
    const preview = await withTransaction((client) => createResearchPreview(client,bound.actor,{
      idempotencyKey,customerId: bound.customerId,conversationId: bound.conversationId,
      submittedUrls: [],...input,
    }));
    return { ...preview,previewCreated: true,
      nextAction: "Show the exact preview and wait for the user to start it" };
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind !== "staffing" && feature?.kind !== "execution" && feature?.kind !== "support" && feature?.kind !== "expansion" && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
