import { z } from "zod";
import snapshot from "./snapshot.json" with { type: "json" };

const dateSchema = z.iso.date();
const sourceUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "vercel.com";
}, "Customer evidence must link to an official Vercel source");

export const maturitySignals = ["Operational trust", "Platform reuse", "Delivery collaboration", "Measurement and learning", "Product adoption"] as const;
export const maturitySignalSchema = z.enum(maturitySignals);
export const publicAccountSchema = z.object({
  id: z.string().regex(/^public-[a-z0-9-]+$/),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  directoryListed: z.boolean(),
  formalMaturity: z.literal("unknown"),
  internalEngagement: z.literal("not_available"),
  evidence: z.array(z.object({
    url: sourceUrlSchema,
    title: z.string().min(1),
    publishedAt: dateSchema,
    scope: z.string().min(1),
    signal: maturitySignalSchema,
    products: z.array(z.string().min(1)),
    summary: z.string().min(1),
    cautions: z.array(z.string().min(1)),
  })),
});

export const PUBLIC_CUSTOMER_EVIDENCE = z.object({
  version: z.string(),
  reviewedAt: dateSchema,
  directoryUrl: sourceUrlSchema,
  archiveUrls: z.array(sourceUrlSchema),
  coverage: z.object({ storyCount: z.number().int(), directoryCustomers: z.number().int(), excludedDirectoryEntries: z.array(z.string()), definition: z.string() }),
  accounts: z.array(publicAccountSchema),
}).parse(snapshot);

export type PublicAccount = z.infer<typeof publicAccountSchema>;
export const evidenceLimitations = "Dated public case studies and directory listings, not live CRM data. Signals describe only the cited workload. Formal maturity, current customer status, internal engagement, fees, staffing, risks and decisions are not established. Directory-only entries have no documented maturity signals. Absence from this bounded inventory does not mean an organization is not a Vercel customer.";

export function findPublicAccounts(name: string) {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  return PUBLIC_CUSTOMER_EVIDENCE.accounts.filter((account) => [account.name, ...account.aliases].some((alias) => alias.toLocaleLowerCase("en-US") === normalized));
}

export function getPublicAccount(accountId: string) {
  return PUBLIC_CUSTOMER_EVIDENCE.accounts.find((account) => account.id === accountId);
}

export function searchPublicAccounts(query = "", signal?: string) {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  return PUBLIC_CUSTOMER_EVIDENCE.accounts.filter((account) => {
    const matchesQuery = [account.name, ...account.aliases, ...account.evidence.flatMap((item) => [item.scope, ...item.products])].some((value) => value.toLocaleLowerCase("en-US").includes(normalized));
    return matchesQuery && (!signal || account.evidence.some((item) => item.signal === signal));
  });
}
