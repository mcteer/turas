import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveCustomerAccount } from "@/lib/demo/repository";
import { DEMO_DATA } from "@/lib/demo/fixtures";
import { findPublicAccounts, PUBLIC_CUSTOMER_EVIDENCE } from "@/lib/customer-evidence/repository";

const accountReferenceSchema = z.object({
  id: z.string(), name: z.string(), sourceKind: z.enum(["reviewed_public_snapshot", "fictional_scenario"]),
  aliases: z.array(z.string()).optional(), objective: z.string().optional(), workspaceId: z.string().optional(), engagementIds: z.array(z.string()).optional(),
});

export default defineTool({
  description: "Resolve a customer name against the reviewed official public customer inventory and the separately labeled fictional portfolio. Exact aliases only; never discover a provider connection. Public IDs require get_customer_evidence, never a fictional engagement brief. Not-found means absent from this bounded inventory, not that the customer does not exist.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(160) }),
  outputSchema: z.discriminatedUnion("status", [
    z.object({ status: z.literal("resolved"), synthetic: z.boolean(), dataVersion: z.string(), account: accountReferenceSchema }),
    z.object({ status: z.literal("ambiguous"), candidates: z.array(accountReferenceSchema).min(2) }),
    z.object({ status: z.literal("not_found"), reason: z.string() }),
  ]),
  execute: ({ name }) => {
    const publicMatches = findPublicAccounts(name).map(({ id, name }) => ({ id, name, sourceKind: "reviewed_public_snapshot" as const }));
    const fictionalMatch = resolveCustomerAccount(name);
    const fictionalMatches = fictionalMatch.status === "resolved" ? [{ ...fictionalMatch.account, sourceKind: "fictional_scenario" as const, engagementIds: DEMO_DATA.engagements.filter((engagement) => engagement.accountId === fictionalMatch.account.id).map(({ id }) => id) }] : fictionalMatch.status === "ambiguous" ? fictionalMatch.candidates.map((account) => ({ ...account, sourceKind: "fictional_scenario" as const })) : [];
    const matches = [...publicMatches, ...fictionalMatches];
    if (matches.length > 1) return { status: "ambiguous" as const, candidates: matches };
    if (matches.length === 0) return { status: "not_found" as const, reason: "No exact match in the reviewed public inventory or fictional portfolio. Ask for the account/source; do not guess or initiate connector setup." };
    return { status: "resolved" as const, synthetic: publicMatches.length === 0, dataVersion: publicMatches.length ? PUBLIC_CUSTOMER_EVIDENCE.version : DEMO_DATA.version, account: matches[0] };
  },
});
