import { defineTool } from "eve/tools";
import { z } from "zod";
import { getEngagementBrief } from "@/lib/demo/repository";
import { engagementMetrics } from "@/lib/demo/metrics";
export default defineTool({
  description: "Calculate a non-persistent synthetic what-if for a canonical engagement. The result is an assumption, not an approved change.",
  inputSchema: z.object({ engagementId: z.string().startsWith("eng-"), remainingHours: z.number().min(0).max(1000).optional(), fee: z.number().positive().max(1_000_000).optional() }),
  execute: ({ engagementId, remainingHours, fee }) => {
    const brief = getEngagementBrief(engagementId);
    if (!brief) return { status: "not_found" as const };
    return { status: "known" as const, synthetic: true, hypothetical: true, metrics: engagementMetrics(brief, { remainingHours, fee }), baseline: brief.metrics };
  },
});
