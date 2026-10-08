import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { supportSummaryToolSchema } from "../../lib/support/advice";
import { runSupportRead } from "../../lib/server/support/tools";
export const authoredTool = defineTool({ description: "Read only the bound accepted readiness, maturity and selected engagement summary with explicit unknowns.",
  inputSchema: supportSummaryToolSchema, availableInSubagents: false,
  execute(input, ctx) { return runSupportRead(ctx.session.auth.current, "support_summary", input, ctx.callId); } });
export default defineDynamic({ events: { async "turn.started"(_event, ctx) {
  return (await responseFeature(ctx.session.auth.current))?.kind === "support" ? authoredTool : null;
} } });
