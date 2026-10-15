import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Connector discovery is unavailable to this specialist. Use search_public_research and read_public_research_source for public evidence; never request end-user setup or credentials.",
  inputSchema: z.object({ query: z.string().max(1000) }).strict(),
  outputSchema: z.object({ status: z.literal("unavailable"), reason: z.string() }),
  execute() {
    return {
      status: "unavailable" as const,
      reason:
        "Public research uses the application's configured service key. Use the two public research tools or report unavailable evidence. Do not initiate connector setup.",
    };
  },
});
