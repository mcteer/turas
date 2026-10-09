import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { expansionHypothesesToolSchema } from "../../lib/expansion/advice";
import { runExpansionRead } from "../../lib/server/expansion/tools";
export const authoredTool = defineTool({ description: "Read only explicitly selected expansion hypotheses; preserve dispositions and withhold ineligible content.",
  inputSchema: expansionHypothesesToolSchema, availableInSubagents: false,
  execute(input, ctx) { return runExpansionRead(ctx.session.auth.current, "expansion_hypotheses", input, ctx.callId); } });
export default defineDynamic({ events: { async "turn.started"(_event, ctx) {
  return (await responseFeature(ctx.session.auth.current))?.kind === "expansion" ? authoredTool : null;
} } });
