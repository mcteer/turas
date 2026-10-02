import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { defineDynamic, defineTool } from "eve/tools";
import { staffingMatchToolSchema } from "../../lib/contracts/staffing-tools";
import { executeStaffingRead } from "../../lib/server/staffing/tools";

export const authoredTool = defineTool({
  description: 'Read a bounded page of server-computed staffing matches across the complete authorized pool. Preserve every failed or unknown constraint and cite exact returned revisions; this does not assign anyone.',
  inputSchema: staffingMatchToolSchema,
  availableInSubagents: false,
  async execute(input, ctx) {
    return executeStaffingRead(ctx.session.auth.current, ctx.callId, "match_staffing_resources", input);
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return scope ? authoredTool : null;
  },
} });
