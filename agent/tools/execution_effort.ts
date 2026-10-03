import { defineDynamic, defineTool } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";
import { executionReadSchemas } from "../../lib/execution/advice";
import { runExecutionRead } from "../../lib/server/execution/tools";
export const authoredTool = defineTool({
  description: 'Read deterministic lifetime and period effort, reviewed remaining effort, forecast and budget variance in whole minutes. No resource utilization or private time.',
  inputSchema: executionReadSchemas.execution_effort, availableInSubagents: false,
  execute(input, ctx) { return runExecutionRead(ctx.session.auth.current, "execution_effort", input, ctx.callId); },
});
export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) { return (await responseFeature(ctx.session.auth.current))?.kind === "execution" ? authoredTool : null; },
} });
