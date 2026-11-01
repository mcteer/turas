import { specialistModel } from "../../lib/authorize-specialist";
import { defineAgent } from "eve";
export default defineAgent({
  description: "Establish the current known state and full context of a customer: authorized internal history, current customer/Vercel sources, employee talks, practitioner experience, processes and outcomes, with freshness and conflicts. Use for latest/current/context/status questions, not proposed solution design. The parent must first reserve research with prepare_customer_research. Include accountId and question; get_research_context loads the reservation from authenticated runtime lineage, so no ticket copying is needed. Call with message only; do not set outputSchema. The authored return contract is {kind,status,reference,reason}, never a full report. Supply canonical accountId and question. Returns a signed customer-recon reference for Turi and implementation-research.",
  model: specialistModel("customer-update"),
  reasoning: "high",
  defaultTools: false,
  // The workflow caller must be able to read the completed typed result.
  // Use the existing world retention; zero deletes it before the handoff.
  tool: false,
  limits: {
    sessionUsage: ({total}) => total.inputTokens >= 400000 || total.outputTokens >= 32000 || (total.costUsd ?? 0) >= 3,
    sessionTimeoutMs: 600000,
  },
});
