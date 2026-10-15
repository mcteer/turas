import { researchIdentity } from "../../../lib/server/research/specialists/identity";
import {
  researchCallAllowed,
  withinResearchBudget,
} from "../../../lib/server/research/specialists/solution-research/evidence";
import { ResearchProviderError } from "../../../lib/server/research/specialists/solution-research/provider";
import { researchState } from "./research-state";

export async function admitPublicResearch(
  auth: Parameters<typeof researchIdentity>[0],
  callId: string,
  kind: "search" | "scrape",
  input: Record<string, unknown>,
  signal: AbortSignal,
) {
  if (signal.aborted) return "Research cancelled.";
  if (!await researchIdentity(auth)) return "Load authorized customer context first.";
  const state = researchState.get();
  if (!state.context) return "Load authorized customer context first.";
  const toolName =
    kind === "search" ? "context__web-search" : "context__web-scrape-markdown";
  if (!researchCallAllowed(toolName, input))
    return "Only public company/product queries or public HTTPS URLs without query strings are supported.";
  if (!withinResearchBudget(state.calls, callId, kind, state.startedAt, Date.now(), state.mode))
    return "Research call budget exhausted. Finalize the partial brief and identify gaps.";
  researchState.update((current) => ({
    ...current,
    calls: { ...current.calls, [callId]: kind },
  }));
  return null;
}

export function publicResearchFailure(
  error: unknown,
  callId: string,
  signal: AbortSignal,
) {
  const reason = signal.aborted
    ? "cancelled"
    : error instanceof ResearchProviderError
      ? error.reason
      : "unavailable";
  console.warn(
    JSON.stringify({
      event: "solution_research.source_failed",
      callId,
      reason,
      httpStatus:
        error instanceof ResearchProviderError ? error.httpStatus : undefined,
    }),
  );
  return reason === "not_configured" || reason === "unauthorized"
    ? "Public research is unavailable. The Turas owner must check CONTEXT_API_KEY for this environment. Do not request a secret or end-user OAuth."
    : reason === "cancelled"
      ? "Research cancelled."
      : "Public research is unavailable or returned incomplete/unverifiable evidence. Finalize the partial brief and identify the gap.";
}
