import { defineTool } from "eve/tools";
import { z } from "zod";

// Generic provider discovery is not an account lookup. Replace this guard only
// when the application can resolve an authorized customer record source (D4).
export default defineTool({
  description:
    "Provider discovery is unavailable in customer-engagement chat. Do not use this tool to look up a customer, engagement, or past conversation. Use verified conversation context and authorized memory; if evidence is missing, ask for the latest engagement note.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(1000) }),
  outputSchema: z.object({
    status: z.literal("unavailable"),
    message: z.string(),
  }),
  execute() {
    return {
      status: "unavailable" as const,
      message:
        "No application-backed customer source resolver is configured. Provider names cannot establish where customer records live. Answer from verified conversation context or authorized memory; otherwise explain the missing engagement evidence and ask for the latest note. Do not offer connector setup or sign-in.",
    };
  },
});
