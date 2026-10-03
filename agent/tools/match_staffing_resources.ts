import { responseFeature } from "../../lib/server/conversations/feature";
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
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind === "staffing" ? authoredTool : null;
  },
} });
