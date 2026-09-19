import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveCustomerAccounts } from "../../lib/application/queries/resolve-customer-accounts";

const customerAccountMatchSchema = z.object({
  accountId: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  lifecycleState: z.enum(["active", "inactive", "unknown"]),
  matchType: z.enum(["exact", "normalized", "alias", "partial"]),
  source: z.object({
    system: z.string().min(1),
    recordId: z.string().min(1),
    observedAt: z.string().datetime().nullable(),
  }),
});

const outputSchema = z.object({
  query: z.string().min(1),
  resolution: z.enum(["resolved", "ambiguous", "not_found"]),
  nextStep: z.enum([
    "use_account_id",
    "ask_user_to_choose_customer",
    "report_customer_not_found",
  ]),
  matches: z.array(customerAccountMatchSchema).max(5),
});

export default defineTool({
  description:
    "Resolve a Vercel customer account from a customer name or approved alias. Use first for customer-delivery, maturity, engagement, health, status, risk, outcome, capacity, or Vercel-product questions that name an organization. This tool only resolves authorized Vercel customer accounts; never use it to discover providers, connectors, MCP servers, integrations, or external workspaces.",
  inputSchema: z.object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .describe("The customer name or approved customer alias to resolve."),
  }),
  outputSchema,
  async execute({ query }, ctx) {
    const result = await resolveCustomerAccounts({
      query,
      requester: ctx.session.auth,
      limit: 5,
      abortSignal: ctx.abortSignal,
    });

    return outputSchema.parse(result);
  },
});