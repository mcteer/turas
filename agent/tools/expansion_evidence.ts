import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { expansionEvidenceToolSchema } from "../../lib/expansion/advice";
import { runExpansionRead } from "../../lib/server/expansion/tools";
export const authoredTool = defineTool({ description: "Read exact retained eligible passages for source keys already selected in the prepared expansion scope. Never retrieve new sources.",
  inputSchema: expansionEvidenceToolSchema, availableInSubagents: false,
  execute(input, ctx) { return runExpansionRead(ctx.session.auth.current, "expansion_evidence", input, ctx.callId); } });
export default defineDynamic({ events: { async "turn.started"(_event, ctx) {
  return (await responseFeature(ctx.session.auth.current))?.kind === "expansion" ? authoredTool : null;
} } });
