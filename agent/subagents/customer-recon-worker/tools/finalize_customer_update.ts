import { finalizeResearchContext } from "../../../../lib/server/research/specialists/solution-research/context";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../../../lib/server/research/specialists/identity";
import { bindCustomerUpdate, customerUpdateRevisionReasons, customerUpdateSubmissionSchema } from "../../../../lib/server/research/specialists/solution-research/customer-update";
import { signCustomerUpdate } from "../../../../lib/server/research/specialists/solution-research/customer-update-receipt";
import { researchReferenceSchema, storeCustomerUpdateArtifact } from "../../../../lib/server/research/specialists/solution-research/artifacts";
import { researchState } from "../../../lib/legacy-research/research-state";
import { finishResearchRequest } from "../../../../lib/server/research/specialists/research-cache/requests";
import { cacheEnabled } from "../../../../lib/server/research/specialists/research-cache/database";
import { learnPublicEvidence } from "../../../../lib/server/research/specialists/research-cache/public-learning";
const researchTool = defineTool({
  description: "Finalize customer-update mode only. Bind each public finding to a retrieved passage and its source metadata. Store a caller-bound signed update for Turi to load with get_customer_research_update. No proposal, financial evaluation or approved internal-record write. Exact verified public passages are automatically retained in the account-wide public learning library; private questions and generated claims are excluded. Report release-history, current-documentation, availability/pricing operations/limits, employee testimony and practitioner experience coverage with retrieved source IDs and recorded discovery searchIds. Preserve contrary testimony and process outcomes, attribution, and unresolved stage conflicts. Every sourceId in checked coverage must have a retained finding; omit extraneous read-only references before submitting. Missing or unsupported coverage makes the assessment partial. A needs_revision response stores nothing and permits one correction using retrieved evidence; all other responses end this task.",
  inputSchema: customerUpdateSubmissionSchema,
  outputSchema: z.object({ kind: z.literal("customer-update"), status: z.enum(["ready", "incomplete", "unavailable", "needs_revision"]), reference: researchReferenceSchema.nullable(), reason: z.string() }),
  async execute(submission, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
    const state = researchState.get();
    const unavailable = { kind: "customer-update" as const, status: "unavailable" as const, reference: null };
    if (!identity || !state.context || state.mode !== "customer-update" || state.context.accountId !== submission.accountId || ctx.abortSignal.aborted)
      return { ...unavailable, reason: "Load authorized customer-update context for this account before finalizing." };
    const bound = bindCustomerUpdate(submission, state.sources, state.discoverySearches);
    const revisionReasons = customerUpdateRevisionReasons(submission, bound);
    if (revisionReasons.length && (!state.customerUpdateRevisionCallId || state.customerUpdateRevisionCallId === ctx.callId)) {
      researchState.update(current => ({ ...current, customerUpdateRevisionCallId: ctx.callId }));
      return { kind: "customer-update" as const, status: "needs_revision" as const, reference: null,
        reason: `Nothing was stored or finalized. Correct this submission once using already retrieved evidence, then call finalize_customer_update again. Do not restart research or invent support. ${revisionReasons.join(" ")} If evidence is genuinely missing, preserve the gap; the next submission will be stored with any remaining blockers.` };
    }
    try {
      let learningWarning = "";
      if (cacheEnabled()) {
        try { await learnPublicEvidence(identity, bound.update, state.sources, ctx.abortSignal); }
        catch {
          console.warn(JSON.stringify({ event: "public_learning.write_failed", callId: ctx.callId }));
          learningWarning = " The research artifact was stored, but account-wide public learning could not be updated; report that persistence gap.";
        }
      }
      const receipt = signCustomerUpdate({ userId: identity.userId, workspaceId: identity.workspaceId, environmentId: identity.environmentId,
        issuedAt: new Date().toISOString(), context: await finalizeResearchContext(identity,state.context,ctx.abortSignal), discoverySearches: state.discoverySearches ?? [], ...bound });
      const reference = await storeCustomerUpdateArtifact(receipt, identity, ctx.abortSignal);
      await finishResearchRequest(identity, state.requestTicket, receipt, ctx.abortSignal);
      researchState.update(current => ({ ...current, finalized: true }));
      return { kind: "customer-update" as const, status: bound.blockers.length || submission.conflicts.length || submission.unknowns.length ? "incomplete" as const : "ready" as const,
        reference, reason: "Turi should call get_customer_research_update with accountId only, omitting researchId, for this admitted task. Its exact completed result is bound to the parent chat; do not transcribe the reference identifier. Explain its source-coverage gaps before claiming a current-state assessment. It contains dated public findings and separate authorized internal context; retrieval does not prove interpretation or current private operational state." + learningWarning };
    } catch {
      console.warn(JSON.stringify({ event: "customer_update.artifact_unavailable", callId: ctx.callId }));
      return { ...unavailable, reason: "Customer update storage or signing is unavailable. Do not claim that research was stored." };
    }
  },
});
export default defineDynamic(() => researchState.get().finalized ? null : researchTool );
