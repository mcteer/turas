import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { calculateServicesPlan, DEFAULT_SERVICES_PLAN, servicesPlanSchema, servicesPlanOutputSchema } from "../../lib/server/staffing/services-plan";

const authoredTool=defineTool({
  description: "Calculate a hypothetical annual FDE/PS operating plan from explicit proposed assumptions, full payroll, overhead, break-even utilization, pricing floor and protected-capacity feasibility. Read-only; omitted overrides use explicit proposed defaults. Does not annualize the engagement portfolio or include platform ARR.",
  inputSchema: z.object({ overrides: servicesPlanSchema.partial().optional() }),
  outputSchema: z.object({ assumptions: servicesPlanSchema, forecast: servicesPlanOutputSchema }),
  execute: ({ overrides }) => {
    const assumptions = servicesPlanSchema.parse({ ...DEFAULT_SERVICES_PLAN, ...overrides });
    return { assumptions, forecast: calculateServicesPlan(assumptions) };
  },
});

export default normalChatTool(authoredTool);
