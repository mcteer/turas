import { defineTool } from "eve/tools";
import { z } from "zod";
import { evidenceLimitations, maturitySignalSchema, PUBLIC_CUSTOMER_EVIDENCE, searchPublicAccounts } from "@/lib/customer-evidence/repository";

export default defineTool({
  description: "Search the bounded public Vercel customer inventory by name, workload or product, optionally filtering documented capability signals. Paginated summaries; use get_customer_evidence for citations and scope before making claims. Public read only, no formal maturity grades or CRM coverage implied.",
  inputSchema: z.object({ query: z.string().trim().max(160).default(""), signal: maturitySignalSchema.optional(), offset: z.number().int().min(0).max(1000).default(0), limit: z.number().int().min(1).max(20).default(20) }),
  outputSchema: z.object({ dataVersion: z.string(), reviewedAt: z.string(), coverage: z.string(), limitations: z.string(), total: z.number(), nextOffset: z.number().nullable(), accounts: z.array(z.object({ id: z.string(), name: z.string(), storyCount: z.number(), directoryListed: z.boolean(), formalMaturity: z.literal("unknown") })) }),
  execute: ({ query, signal, offset, limit }) => {
    const matches = searchPublicAccounts(query, signal);
    return { dataVersion: PUBLIC_CUSTOMER_EVIDENCE.version, reviewedAt: PUBLIC_CUSTOMER_EVIDENCE.reviewedAt, coverage: PUBLIC_CUSTOMER_EVIDENCE.coverage.definition, limitations: evidenceLimitations, total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null, accounts: matches.slice(offset, offset + limit).map((account) => ({ id: account.id, name: account.name, storyCount: account.evidence.length, directoryListed: account.directoryListed, formalMaturity: account.formalMaturity })) };
  },
});
