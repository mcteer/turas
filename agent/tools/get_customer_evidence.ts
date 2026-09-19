import { defineTool } from "eve/tools";
import { z } from "zod";
import { evidenceLimitations, getPublicAccount, publicAccountSchema, PUBLIC_CUSTOMER_EVIDENCE } from "@/lib/customer-evidence/repository";

export default defineTool({
  description: "Read a real organization's dated public Vercel evidence by canonical public account ID. Returns sources, workload scopes, documented capability signals and gaps. Does not provide internal engagement history or a formal maturity grade. Public information; no external writes or connector access.",
  inputSchema: z.object({ accountId: z.string().regex(/^public-[a-z0-9-]+$/).max(160) }),
  outputSchema: z.object({ status: z.enum(["found", "not_found"]), synthetic: z.literal(false), sourceKind: z.literal("reviewed_public_snapshot"), dataVersion: z.string(), reviewedAt: z.string(), directoryUrl: z.string(), limitations: z.string(), account: publicAccountSchema.nullable() }),
  execute: ({ accountId }) => {
    const account = getPublicAccount(accountId);
    return { status: account ? "found" : "not_found", synthetic: false, sourceKind: "reviewed_public_snapshot", dataVersion: PUBLIC_CUSTOMER_EVIDENCE.version, reviewedAt: PUBLIC_CUSTOMER_EVIDENCE.reviewedAt, directoryUrl: PUBLIC_CUSTOMER_EVIDENCE.directoryUrl, limitations: evidenceLimitations, account: account ?? null };
  },
});
