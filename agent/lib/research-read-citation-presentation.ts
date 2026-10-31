/** Presentation only: the caller must pass already-authorized eligible findings.
 * Workflow/observation IDs never become source citations; fit keeps retrieval IDs. */
export function researchReadCitationPresentation(mode: string,
  findings: readonly { sourceRevisionId: string }[]) {
  if (mode !== "recon" && mode !== "practices") return null;
  return { version: "research-read-source-citations-v1" as const,
    citations: findings.slice(0,3).map(({ sourceRevisionId }) => ({
      sourceRevisionId,marker: `[${sourceRevisionId}]`,
    })) };
}
