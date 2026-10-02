import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { defineDynamic, defineTool } from "eve/tools";
import { staffingEmptyToolSchema } from "../../lib/contracts/staffing-tools";
import { executeStaffingRead } from "../../lib/server/staffing/tools";

export const authoredTool = defineTool({
  description: 'Read the exact same-baseline scenario bound to an authorized finance explanation. Use its deterministic amounts, formula, missing-input reasons and policy status; this is planning only.',
  inputSchema: staffingEmptyToolSchema,
  availableInSubagents: false,
  async execute(input, ctx) {
    return executeStaffingRead(ctx.session.auth.current, ctx.callId, "read_staffing_scenario", input);
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return scope?.mode === "finance" && scope.scenarioId !== null ? authoredTool : null;
  },
} });
