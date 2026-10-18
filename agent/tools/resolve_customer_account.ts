import { defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { resolveCustomerAccount } from "../../lib/server/conversations/customer-accounts";
import { customerAccountTool } from "../lib/customer-account-tool";

export const authoredTool = defineTool({
  description: "Resolve a customer name against your authorized customer inventory. Exact customer names and aliases take precedence; otherwise match an exact documented workload scope. Shared workload names return candidates, never a guess. Never discover a provider connection. Use the canonical ID with get_customer_evidence and get_customer_journey. Not-found means absent from this accessible bounded inventory, not that the customer does not exist.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(160) }).strict(),
  execute: ({ name }, ctx) => withTransaction(db => resolveCustomerAccount(db, ctx.session.auth.current, name)),
});
export default customerAccountTool(authoredTool);
