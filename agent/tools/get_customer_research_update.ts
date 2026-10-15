import {normalChatTool} from "../lib/normal-chat-tool";
import { evidenceFreshnessSchema } from "../../lib/server/research/specialists/solution-research/freshness";
import { sourceFreshness, contextFreshness } from "../../lib/server/research/specialists/solution-research/freshness-report";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { loadCustomerUpdateArtifact } from "../../lib/server/research/specialists/solution-research/artifacts";
import { customerUpdateSchema } from "../../lib/server/research/specialists/solution-research/customer-update";
import { customerContextSchema } from "../../lib/server/research/specialists/solution-research/schema";
import { customerResearchCitationSchema, customerResearchCitations } from "../../lib/server/research/specialists/solution-research/citations";
import { loadResearchContext,researchContextDigest } from "../../lib/server/research/specialists/solution-research/context";
import { discoverySearchSchema } from "../../lib/server/research/specialists/solution-research/discovery";
import { reuseSchema } from "../../lib/server/research/specialists/research-cache/schema";
import { resolveResearchHandoff, sessionResearchReferenceSchema } from "../lib/legacy-research/research-handoff";
const authoredTool=defineTool({
  description: "Load completed customer recon. For research prepared in this chat, supply accountId only and omit researchId: the server resolves the exact bound result. Explicit researchId is only for a prior authorized artifact. Verify caller, account, environment, signature, expiry and current access. Returns exact retrieved passages with public findings, source dates, coverage gaps and separate internal context. No model call, approval or customer-memory write. Not for solution proposals.",
  inputSchema: sessionResearchReferenceSchema,
  outputSchema: z.object({ status: z.enum(["available", "denied", "stale", "unavailable"]), reason: z.string(),
    freshness: z.array(evidenceFreshnessSchema).max(60), checkedAt: z.iso.datetime().nullable(), update: customerUpdateSchema.nullable(), context: customerContextSchema.nullable(),
    customerEvidenceCitations: z.array(customerResearchCitationSchema), blockers: z.array(z.string()), discoverySearches: z.array(discoverySearchSchema).max(8), reusedFrom: reuseSchema.optional() }),
  async execute(input, ctx) {
    const empty = { freshness: [], checkedAt: null, update: null, context: null, customerEvidenceCitations: [], blockers: [], discoverySearches: [] };
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity) return { ...empty, status: "denied" as const, reason: "An authenticated Turas user is required." };
    try {
      const reference = await resolveResearchHandoff(input, "customer-update", identity, ctx.abortSignal);
      if (!reference) return { ...empty, status: "denied" as const, reason: "No completed recon is bound to this account in this chat. Complete its admitted task first; do not invent a reference or restart research." };
      const receipt = await loadCustomerUpdateArtifact(reference, identity, ctx.abortSignal);
      if (!receipt) return { ...empty, status: "denied" as const, reason: "Update missing, altered, expired or outside this caller/account/environment. Do not automatically restart research." };
      const current = await loadResearchContext(identity, reference.accountId, ctx.abortSignal);
      if (researchContextDigest(current) !== researchContextDigest(receipt.payload.context) || current.publicEvidenceVersion !== receipt.payload.context.publicEvidenceVersion)
        return { ...empty, status: "stale" as const, reason: "Customer evidence or access changed since research. Do not reuse its internal context." };
      return { status: "available" as const, freshness: [...sourceFreshness(receipt.payload.sources), ...contextFreshness(current)], checkedAt: receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt, update: receipt.payload.update, context: current,
        ...(receipt.payload.reusedFrom ? { reusedFrom: receipt.payload.reusedFrom } : {}),
        discoverySearches: receipt.payload.discoverySearches ?? [],
        customerEvidenceCitations: customerResearchCitations(current), blockers: [...receipt.payload.blockers, ...(["employee_testimony", "practitioner_experience"] as const).filter(area => !receipt.payload.update.coverage?.[area]).map(area => `Coverage gap for ${area}: not assessed in this artifact.`), ...(!receipt.payload.update.coverage ? ["Legacy update has no source-coverage assessment; treat it as partial."] : receipt.payload.update.coverage.release_history.status === "checked" && !receipt.payload.update.coverage.release_history.currentIndexSourceId ? ["Release-history coverage lacks current index evidence; treat it as partial."] : [])],
        reason: "Respect attributionWarning on every finding: community testimony with unverified authorship cannot establish the target customer’s own infrastructure or process, even if hosted on its community domain. Describe it only as an unverified product-user report. Release chronology is server-retained evidence, including dates the research summary may have omitted. When releaseChronology is present, compare every dated entry before describing recent changes. Its dates mean documented_by and firstAvailability is not_established. If an earlier entry already describes the same controls, report that earlier documentation and identify the later mention as a recap; never upgrade finding prose such as put/added/new into a launch date. For a broad current-state reply use these six short labeled bullets, each with citations or an explicit gap: (1) newest relevant documented changes, (2) current availability/pricing and revised plans, (3) current operating controls/limits, (4) named employee testimony and documentation conflicts, (5) named practitioner process experience with its limitations/incentives, (6) internal engagement status and remaining unknowns. Describe capabilities as documented by a date unless their first launch is explicitly supported; do not turn a recap into an added/launched claim. A broader event-week date does not establish a specific conference date. Do not omit practitioner findings or the newest changes to make room for historical launch chronology. A contradictory stage remains unresolved in the conclusion. Available means the artifact loaded, not that research is complete. Missing/unavailable coverage requires a partial-assessment label and specific unchecked areas; never claim an exhaustive internet search. Public findings are bounded to the pages actually retrieved. Surface material disagreements between employee testimony, current documentation and practitioner experience with both sources. Search receipts prove discovery attempts, not source claims. Do not collapse contradictory beta/GA statements into a single maturity label or mistake reported experience for audited ROI. Check every detail in each claim against its exact quote. A null publishedAt means not established, not proof that the page has no publication date. Any more specific date requires explicit evidence in the returned title or quote. Dates of retrieval, publication and snapshot review are distinct. Customer-authored claims are attributed claims, not independent verification. Missing internal records do not invalidate supported public updates or establish that no engagement occurred. This read does not modify records. Public passages may have been retained account-wide during recon; no approved internal account record was created." };
    } catch {
      console.warn(JSON.stringify({ event: "customer_update.load_unavailable", callId: ctx.callId }));
      return { ...empty, status: "unavailable" as const, reason: "The customer update could not be loaded. Report the failed handoff without inventing findings." };
    }
  },
});

export default normalChatTool(authoredTool);
