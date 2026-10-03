import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { executionReadSchemas } from "../../lib/execution/advice";
import { runExecutionRead } from "../../lib/server/execution/tools";
export const authoredTool = defineTool({
  description: 'Read a bounded page of accepted eligible execution records within the bound engagement. No drafts or raw time.',
  inputSchema: executionReadSchemas.execution_records, availableInSubagents: false,
  execute(input, ctx) { return runExecutionRead(ctx.session.auth.current, "execution_records", input, ctx.callId); },
});
export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) { return (await responseFeature(ctx.session.auth.current))?.kind === "execution" ? authoredTool : null; },
} });
