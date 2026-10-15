import { defineState } from "eve/context";
import { z } from "zod";
import type { AppIdentity } from "../../../lib/server/research/specialists/identity";
import { researchReferenceSchema } from "../../../lib/server/research/specialists/solution-research/artifacts";
import { researchRequestProgress } from "../../../lib/server/research/specialists/research-cache/requests";
import type { RequestScope } from "../../../lib/server/research/specialists/research-cache/schema";

export const sessionResearchReferenceSchema = researchReferenceSchema.partial({ researchId: true });
type Reference = z.infer<typeof researchReferenceSchema>;
type Binding = { accountId: string; kind: RequestScope["kind"]; key: string | null; reference: Reference | null };
export const researchHandoffs = defineState("turas.research-handoffs.v1", (): Binding[] => []);

export function bindResearchHandoff(scope: RequestScope, admission: { key: string | null; reference: Reference | null }) {
  researchHandoffs.update(bindings => [...bindings.filter(binding => binding.accountId !== scope.accountId || binding.kind !== scope.kind),
    { accountId: scope.accountId, kind: scope.kind, key: admission.key, reference: admission.reference }].slice(-12));
}

export async function resolveResearchHandoff(input: z.infer<typeof sessionResearchReferenceSchema>, kind: RequestScope["kind"],
  identity: AppIdentity, signal: AbortSignal, progress = researchRequestProgress): Promise<Reference | null> {
  signal.throwIfAborted();
  // Explicit references retain their exact meaning; never repair a guessed ID or
  // select another account/task. Artifact readers still verify authorization.
  if (input.researchId) return researchReferenceSchema.parse(input);
  const binding = researchHandoffs.get().find(binding => binding.accountId === input.accountId && binding.kind === kind);
  if (!binding) return null;
  if (!binding.key) return binding.reference;
  const completed = await progress(identity, binding.key, signal);
  return completed.status === "available" && completed.reference?.accountId === input.accountId ? completed.reference : null;
}
