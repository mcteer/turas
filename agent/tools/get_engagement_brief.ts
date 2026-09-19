import { defineTool } from "eve/tools";
import { z } from "zod";
import { getEngagementBrief } from "@/lib/demo/repository";
export default defineTool({
  description: "Retrieve a synthetic engagement brief by canonical engagement ID, including evidence, owners, and deterministic commercial metrics.",
  inputSchema: z.object({ engagementId: z.string().startsWith("eng-") }),
  execute: ({ engagementId }) => ({ synthetic: true, brief: getEngagementBrief(engagementId) }),
});
