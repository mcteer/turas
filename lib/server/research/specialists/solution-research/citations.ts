import { z } from "zod";
import type { CustomerResearchContext } from "./schema";

export const customerResearchCitationSchema = z.object({
  citationId: z.string(),
  evidenceId: z.string(),
  title: z.string(),
  observedAt: z.string().nullable(),
  href: z.string().nullable(),
});

function publicReference(source: string) {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? source : null;
  } catch {
    return null;
  }
}

export function customerResearchCitations(context: CustomerResearchContext) {
  return context.evidence.map((evidence, index) => ({
    citationId: `C${index + 1}`,
    evidenceId: evidence.id,
    title: evidence.title,
    observedAt: evidence.observedAt,
    href: evidence.basis === "approved_customer_record"
      ? `/customers/${encodeURIComponent(context.accountId)}`
      : ["reviewed_public_snapshot","checked_public_research"].includes(evidence.basis) ? publicReference(evidence.source) : null,
  }));
}
