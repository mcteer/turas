import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveCustomerAccount } from "@/lib/demo/repository";
export default defineTool({
  description: "Resolve a customer name only against the labeled synthetic interview-demo account records. Never use it to discover a provider connection.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(160) }),
  execute: ({ name }) => ({ synthetic: true, dataVersion: "2026-09-19.1", ...resolveCustomerAccount(name) }),
});
