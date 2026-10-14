import { z } from "zod";

export const discoveryPurposeSchema = z.enum([
  "official", "employee_testimony", "practitioner_experience", "contradiction_check",
]);
export const discoverySearchSchema = z.object({
  provider: z.enum(["context", "gateway_exa"]).optional(),
  fallbackFrom: z.literal("context").optional(),
  fallbackReason: z.enum(["empty", "unavailable"]).optional(),
  checkedAt: z.iso.datetime().optional(),
  cached: z.boolean().optional(),
  searchId: z.string().min(1).max(200),
  purpose: discoveryPurposeSchema,
  status: z.enum(["found", "empty", "unavailable"]),
  urls: z.array(z.url()).max(10),
}).strict();
export type DiscoverySearch = z.infer<typeof discoverySearchSchema>;

export function requiresOpenDiscovery(purpose: z.infer<typeof discoveryPurposeSchema>) {
  return purpose === "employee_testimony" || purpose === "practitioner_experience";
}

export function discoveryQueryAllowed(query: string, purpose: z.infer<typeof discoveryPurposeSchema>) {
  return !requiresOpenDiscovery(purpose) || !/\bsite\s*:/i.test(query);
}

export function discoveryProvider(prior: DiscoverySearch[], purpose: z.infer<typeof discoveryPurposeSchema>, callId: string, mode?: string) {
  const replay = prior.find(search => search.searchId === callId);
  const independentUsed = prior.some(search => search.purpose === purpose && search.provider === "gateway_exa");
  return replay?.provider ?? (mode === "customer-update" && requiresOpenDiscovery(purpose) && !independentUsed ? "gateway_exa" : "context");
}
