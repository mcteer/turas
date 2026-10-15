import {normalChatTool} from "../lib/normal-chat-tool";
import { sourceFreshness, contextFreshness } from "../../lib/server/research/specialists/solution-research/freshness-report";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadResearchArtifact } from "../../lib/server/research/specialists/solution-research/artifacts";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { researchContextDigest,loadResearchContext } from "../../lib/server/research/specialists/solution-research/context";
import {
  researchReceiptSchema,
  verifyResearch,
} from "../../lib/server/research/specialists/solution-research/receipt";
import {
  decisionOutputSchema,
} from "../../lib/server/research/specialists/solution-research/decision";
import { evaluateDecisionWorkflow, decisionModel, decisionFailureDiagnostic } from "../../lib/server/research/specialists/solution-research/decision-workflow";
import { calculateProcessImpact } from "../../lib/server/research/specialists/solution-research/process-impact";
import { customerResearchCitations } from "../../lib/server/research/specialists/solution-research/citations";
import { resolveResearchHandoff, sessionResearchReferenceSchema } from "../lib/legacy-research/research-handoff";
const authoredTool=defineTool({
  description:
    "For solution research prepared in this chat, supply accountId only and omit researchId: the server loads the exact bound result. An explicit {accountId,researchId} remains supported for a prior authorized artifact. Evaluate it through the primary model's typed decision assessment. Loads exact signed evidence from Postgres; never reconstruct its payload. Rechecks caller/customer evidence, evaluates eight atomic prerequisites, and combines them using fixed evidence and uncertainty gates. Returns the actual model used, advisory route, retrieved sources and unresolved evidence blockers. Not research, financial calculation or approval. Legacy signed receipts remain accepted. No writes.",
  inputSchema: z.union([sessionResearchReferenceSchema, researchReceiptSchema]),
  outputSchema: decisionOutputSchema,
  async execute(input, ctx) {
    const empty = {
      model: decisionModel,
      rubricVersion: 2 as const,
      recommendedAction: null,
      modelChoice: null,
      adoptionDifficulty: null,
      customerFitProbability: null,
      blockers: [],
    };
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity)
      return {
        ...empty,
        status: "denied" as const,
        reason: "An authenticated Turas user is required.",
      };
    let phase = "artifact";
    try {
      const reference = "accountId" in input ? await resolveResearchHandoff(input, "solution", identity, ctx.abortSignal) : null;
      const receipt = "accountId" in input
        ? reference ? await loadResearchArtifact(reference, identity, ctx.abortSignal) : null
        : input;
      if (!receipt || !verifyResearch(receipt, identity))
        return {
          ...empty,
          status: "denied" as const,
          reason:
            "Research artifact is missing, altered, expired or outside this caller/customer/environment. Report the failed handoff; do not automatically repeat research.",
        };
      phase = "customer_context";
      const current = await loadResearchContext(
        identity,
        receipt.payload.context.accountId,
        ctx.abortSignal,
      );
      if (researchContextDigest(current) !== researchContextDigest(receipt.payload.context) || current.publicEvidenceVersion !== receipt.payload.context.publicEvidenceVersion)
        return {
          ...empty,
          status: "stale" as const,
          reason:
            "Customer evidence or access changed. Research again before evaluating.",
        };
      phase = "decision_model";
      const evaluation = await evaluateDecisionWorkflow(receipt, ctx.abortSignal);
      console.info(JSON.stringify({ event: "solution_research.evaluated", sessionId: ctx.session.id,
        model: evaluation.model, rubricVersion: 2, ...evaluation.telemetry }));
      phase = "response";
      const blockers = receipt.payload.blockers;
      return {
        ...empty,
        status: "evaluated" as const,
        recommendedAction: evaluation.action,
        judgments: evaluation.judgments,
        reviewRequired: evaluation.reviewRequired,
        uncertain: evaluation.uncertain,
        telemetry: evaluation.telemetry,
        customerEvidenceCitations: customerResearchCitations(receipt.payload.context),
        processImpactEstimates: blockers.some(b=>b.includes("process-impact")||b.includes("process benchmarks"))
          ? [] : (receipt.payload.brief.processImpact??[]).map(calculateProcessImpact),
        blockers,
        research: {
          context: receipt.payload.context,
          brief: receipt.payload.brief,
          sources: receipt.payload.sources,
          customerRecon: receipt.payload.customerRecon,
          freshness: [...sourceFreshness(receipt.payload.sources), ...contextFreshness(receipt.payload.context)],
        },
        reason:
          "The application composed this advisory route from eight atomic judgments. Selected-option probability below 0.8 routes to review; this exploratory threshold is not validated calibration. No independent confidence or joint success probability is established. Deterministic blockers, quotation checks and freshness checks are application checks, not provider findings. For customer citations use the supplied citationId/title and exact href from customerEvidenceCitations. A null href means plain-text attribution only. Journey links open the account's authorized journal, not a fabricated record anchor. Never invent domains, URLs or record IDs. Public research links must copy research.sources URLs exactly. Explain evidence, alternatives, commercial/adoption implications and remaining uncertainty. Human approval is always required for actions.",
      };
    } catch (error) {
      const diagnostic = decisionFailureDiagnostic(error);
      console.warn(
        JSON.stringify({
          event: "solution_research.evaluation_unavailable",
          phase, ...diagnostic,
          model: decisionModel,
          sessionId: ctx.session.id,
        }),
      );
      return {
        ...empty,
        status: "unavailable" as const,
        reason: ctx.abortSignal.aborted
          ? "Evaluation cancelled."
          : `Decision evaluation or customer-context recheck is unavailable. Check AI Gateway and database configuration; no recommendation was evaluated. Diagnostic: ${phase}/${diagnostic.category}${diagnostic.statusCode ? `/${diagnostic.statusCode}` : ""}. Do not silently substitute another evaluator or restart research.`,
      };
    }
  },
});

export default normalChatTool(authoredTool);
