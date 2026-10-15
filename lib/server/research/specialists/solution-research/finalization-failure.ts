import { z } from "zod";
import { HttpFailure } from "../../../../contracts/http";

export type ResearchFinalizationPhase = "retain_sources" | "bind_context" | "store_artifact" | "finish_reservation";

// Never log exception prose, source quotations, SQL detail or provider payloads.
const policyCodes = new Set([
  "forbidden", "not_found", "identity_conflict", "invalid_source", "source_unverified",
  "submitted_origin", "research_source_retired", "research_observation_outdated",
  "request_key_conflict", "no_checked_evidence", "research_unavailable", "unavailable",
]);
const databaseCodes = new Set(["23502", "23503", "23505", "23514", "40001", "40P01", "42501", "57014"]);

export function researchFinalizationFailure(error: unknown, phase: ResearchFinalizationPhase) {
  let category = "unclassified";
  if (error instanceof HttpFailure && policyCodes.has(error.code)) category = error.code;
  else if (error instanceof z.ZodError) category = "invalid_structure";
  else if (error instanceof Error && "code" in error && typeof error.code === "string" && databaseCodes.has(error.code)) category = `database_${error.code}`;
  else if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) category = "interrupted";

  const reasons: Record<ResearchFinalizationPhase, string> = {
    retain_sources: "Research could not retain its cited sources. Existing access, source-integrity and retention checks still apply.",
    bind_context: "Research could not verify and sign its current customer context. No completed solution result is available.",
    store_artifact: "Research could not store its signed artifact. No completed solution result is available.",
    finish_reservation: "Research could not publish its completed result. Do not retry the investigation automatically.",
  };
  return { category, reason: reasons[phase] };
}
