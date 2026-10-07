import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { supportEvidenceToolSchema } from "../../lib/support/advice";
import { runSupportRead } from "../../lib/server/support/tools";
export const authoredTool = defineTool({ description: "Read exact retained eligible passages for source keys already selected in the prepared support scope. Never retrieve new sources.",
  inputSchema: supportEvidenceToolSchema, availableInSubagents: false,
  execute(input, ctx) { return runSupportRead(ctx.session.auth.current, "support_evidence", input, ctx.callId); } });
export default defineDynamic({ events: { async "turn.started"(_event, ctx) {
  return (await responseFeature(ctx.session.auth.current))?.kind === "support" ? authoredTool : null;
} } });
