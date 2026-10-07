import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { responseFeature } from "../../lib/server/conversations/feature";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { readResearchRun } from "../../lib/server/research/requests";
import { readResearchFindings } from "../../lib/server/research/read";
import { hiddenRecord } from "../../lib/contracts/http";

export const authoredTool = defineTool({
  description: "Read the current state and retained checked findings of a research run owned by the bound actor. A cancelled or partial run stays labelled as such. Only completed, currently eligible attributed findings are returned.",
  inputSchema: z.object({ runId: z.uuid() }).strict(),
  async execute({ runId },ctx) {
    return withTransaction(async (client) => {
      const bound = await boundToolActor(client,ctx.session.auth.current);
      const scoped = await client.query<{ customer_id: string }>(`
        SELECT customer_id FROM research_runs WHERE id=$1`,[runId]);
      if (scoped.rows[0]?.customer_id !== bound.customerId) throw hiddenRecord();
      const receipt = await readResearchRun(client,bound.actor,runId,
        bound.planning?.audience);
      const findings = await readResearchFindings(client,bound.actor,runId,
        bound.planning?.audience);
      return { receipt,findings: findings.slice(0,3),
        omittedFindingCount: Math.max(0,findings.length-3),
        caveat: receipt.state === "cancelled" ?
          "Cancelled run; these are only completed retained findings" :
          receipt.state === "partial" ?
            "Partial run; these are only completed retained findings" : null };
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind !== "staffing" && feature?.kind !== "execution" && feature?.kind !== "support" && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
