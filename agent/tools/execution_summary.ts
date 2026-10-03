import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { executionReadSchemas } from "../../lib/execution/advice";
import { runExecutionRead } from "../../lib/server/execution/tools";
export const authoredTool = defineTool({
  description: 'Read the bound reviewed engagement status, milestones, blockers and explicit unknowns with exact citations.',
  inputSchema: executionReadSchemas.execution_summary, availableInSubagents: false,
  execute(input, ctx) { return runExecutionRead(ctx.session.auth.current, "execution_summary", input, ctx.callId); },
});
export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) { return (await responseFeature(ctx.session.auth.current))?.kind === "execution" ? authoredTool : null; },
} });
