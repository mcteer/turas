import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { defineDynamic, defineTool } from "eve/tools";
import { staffingCapacityToolSchema } from "../../lib/contracts/staffing-tools";
import { executeStaffingRead } from "../../lib/server/staffing/tools";

export const authoredTool = defineTool({
  description: 'Read dated capacity totals for resources already returned by this explanation’s matching tool, within its bound demand period. Unknown coverage remains unknown; no absence reasons or other customer identities are returned.',
  inputSchema: staffingCapacityToolSchema,
  availableInSubagents: false,
  async execute(input, ctx) {
    return executeStaffingRead(ctx.session.auth.current, ctx.callId, "read_staffing_capacity", input);
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return scope ? authoredTool : null;
  },
} });
