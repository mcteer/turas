import { defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { readCustomerAccountEvidence } from "../../lib/server/conversations/customer-accounts";
import { customerAccountTool } from "../lib/customer-account-tool";

export const authoredTool = defineTool({
  description: "Read current authorized customer evidence by the canonical ID from resolve_customer_account. Returns accepted internal facts and automatically accepted independently checked research, exact source URLs, documented products and original source dates. Read later pages when truncated. Cite the actual workload and publication date; do not infer current private deployment, commercial terms or a maturity grade. No customer-picker selection or human review of independent research is required.",
  inputSchema: z.object({ accountId: z.uuid(), page: z.number().int().min(1).max(10).default(1) }).strict(),
  execute: ({ accountId, page }, ctx) => withTransaction(db =>
    readCustomerAccountEvidence(db, ctx.session.auth.current, accountId, { page })),
});
export default customerAccountTool(authoredTool);
