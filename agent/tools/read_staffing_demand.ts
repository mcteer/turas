import { responseFeature } from "../../lib/server/conversations/feature";
import { defineDynamic, defineTool } from "eve/tools";
import { staffingEmptyToolSchema } from "../../lib/contracts/staffing-tools";
import { executeStaffingRead } from "../../lib/server/staffing/tools";

export const authoredTool = defineTool({
  description: 'Read the exact current qualified staffing demand and accepted baseline bound to this private explanation. No caller-selected scope or private personnel evidence.',
  inputSchema: staffingEmptyToolSchema,
  availableInSubagents: false,
  async execute(input, ctx) {
    return executeStaffingRead(ctx.session.auth.current, ctx.callId, "read_staffing_demand", input);
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind === "staffing" ? authoredTool : null;
  },
} });
