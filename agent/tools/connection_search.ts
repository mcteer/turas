import { defineTool } from "eve/tools";
import { z } from "zod";

// Generic provider discovery is not an account lookup. Replace this guard only
// only when a governed operational source and explicit setup flow are approved.
export default defineTool({
  description:
    "Provider discovery is unavailable in customer-engagement chat. Do not use this tool to look up a customer, engagement, or past conversation. Use resolve_customer_account and the appropriate evidence tool; if internal evidence is missing, ask for the latest engagement note.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(1000) }),
  outputSchema: z.object({
    status: z.literal("unavailable"),
    message: z.string(),
  }),
  execute() {
    return {
      status: "unavailable" as const,
      message:
        "Provider names cannot establish where customer records live. resolve_customer_account distinguishes the reviewed public inventory from fictional scenarios; neither is an internal CRM. Use the appropriate evidence tool, or explain the missing engagement evidence and ask for the latest note. Do not offer connector setup or sign-in.",
    };
  },
});
