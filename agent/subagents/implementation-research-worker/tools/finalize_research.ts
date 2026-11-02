import { finalizeResearchContext } from "../../../../lib/server/research/specialists/solution-research/context";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../../../lib/server/research/specialists/identity";
import {
  researchSubmissionSchema,
  researchGaps,
} from "../../../../lib/server/research/specialists/solution-research/schema";
import {
  signResearch,
} from "../../../../lib/server/research/specialists/solution-research/receipt";
import { researchReferenceSchema, storeResearchArtifact } from "../../../../lib/server/research/specialists/solution-research/artifacts";
import { researchState } from "../../../lib/legacy-research/research-state";
import { processImpactSchema } from "../../../../lib/server/research/specialists/solution-research/process-impact";
import { retainResearchSources } from "../../../../lib/server/research/specialists/solution-research/source-integrity";
import { bindResearchSubmission, solutionCitationIssues } from "../../../../lib/server/research/specialists/solution-research/submission";
import { finishResearchRequest } from "../../../../lib/server/research/specialists/research-cache/requests";
import { learnPublicSources } from "../../../../lib/server/research/specialists/research-cache/public-learning";
import { researchFinalizationFailure, type ResearchFinalizationPhase } from "../../../../lib/server/research/specialists/solution-research/finalization-failure";
const researchTool = defineTool({
  description:
    "Validate a complete research brief against retrieved sources and authorized customer evidence, then store a caller-bound signed artifact in Postgres. Records gaps; never approves a solution or writes customer memory. Return its short reference to Turi for decision assessment; never copy the signed payload.",
  inputSchema: researchSubmissionSchema.extend({ processImpact: z.array(processImpactSchema).min(1).max(3) }),
  outputSchema: z.object({
    status: z.enum(["ready", "incomplete", "unavailable", "needs_revision"]),
    reference: researchReferenceSchema.nullable(),
    reason: z.string(),
  }),
  async execute(submission, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
    const { context, sources, customerRecon } = researchState.get();
    if (
      !identity ||
      researchState.get().mode === "customer-update" ||
      !context ||
      !customerRecon ||
      context.accountId !== submission.accountId ||
      ctx.abortSignal.aborted
    )
      return {
        status: "unavailable" as const,
        reference: null,
        reason: "Load authorized context for this account before finalizing.",
      };
    const bound = bindResearchSubmission(submission, sources);
    const brief = bound.brief;
    const blockers = [...(customerRecon?.blockers ?? []).map(gap => `Customer recon: ${gap}`), ...bound.blockers, ...researchGaps(brief, context, sources)];
    const citationIssues = solutionCitationIssues(blockers);
    const previousRevision = researchState.get().solutionRevisionCallId;
    if (citationIssues.length && (!previousRevision || previousRevision === ctx.callId)) {
      researchState.update(state => ({ ...state, solutionRevisionCallId: ctx.callId }));
      return { status: "needs_revision" as const, reference: null,
        reason: `Nothing was stored or finalized. Correct this brief once using already retrieved evidence, then call finalize_research again. ${citationIssues.join(" ")} Every sourceId cited in findings, alternatives or process inputs needs a sourceSupport entry with an exact retrieved passageId. Use research_evidence to recover valid IDs. Add relevant support or remove the unsupported claim/reference and preserve the gap. Do not add web research, invent evidence or remove legitimate uncertainty. A second submission retains any remaining blockers.` };
    }
    let phase: ResearchFinalizationPhase="retain_sources";
    try {
      const citedSources = retainResearchSources(brief, sources);
      await learnPublicSources(identity, brief.accountId, sources, brief.sourceSupport.map(support => ({
        sourceId: support.sourceId,
        passageId: support.passageId,
        quote: support.quote,
        sourceType: support.sourceType,
      })), ctx.abortSignal);
      phase="bind_context";
      const receipt = signResearch({
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        environmentId: identity.environmentId,
        issuedAt: new Date().toISOString(),
        context: await finalizeResearchContext(identity,context,ctx.abortSignal),
        brief,
        sources: citedSources,
        blockers,
        customerRecon,
      });
      phase="store_artifact";
      const reference = await storeResearchArtifact(receipt, identity, ctx.abortSignal);
      phase="finish_reservation";
      await finishResearchRequest(identity, researchState.get().requestTicket, receipt, ctx.abortSignal);
      researchState.update((state) => ({ ...state, finalized: true }));
      return {
        status: blockers.length ? ("incomplete" as const) : ("ready" as const),
        reference,
        reason:
          "Turi should call evaluate_solution_research with accountId only, omitting researchId, for this admitted task. The server resolves its exact completed result. The stored artifact validates provenance and structure, not the truth of interpretation. Decision assessment and human decision rights remain separate.",
      };
    } catch (error) {
      const failure = researchFinalizationFailure(error, phase);
      console.warn(JSON.stringify({ event: "solution_research.artifact_unavailable", callId: ctx.callId,phase,category:failure.category }));
      return {
        status: "unavailable" as const,
        reference: null,
        reason: failure.reason,
      };
    }
  },
});

export default defineDynamic(() => researchState.get().finalized ? null : researchTool);
