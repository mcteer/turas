import {specialistSessionLimits} from '../../../lib/server/research/specialists/discussion-policy';
import { specialistModel } from "../../lib/authorize-specialist";
import { defineAgent } from "eve";
export default defineAgent({
  description: "Research a proposed customer solution and delivery approach against customer recon, stack, processes, constraints, adoption/customer success, alternatives, economics and measurable impact. The parent must first reserve research with prepare_customer_research. Include accountId and question; get_research_context loads the reservation from authenticated runtime lineage, so no ticket copying is needed. Call with message only; do not set outputSchema. The authored return contract is {kind,status,reference,reason}, never a full report. Supply canonical accountId, question and proposal. The parent binds reconReference at solution admission; the context tool imports it from that reservation. Does not perform general customer-state recon. Returns a signed solution evidence reference for Turi decision assessment.",
  model: specialistModel("solution"),
  reasoning: "high",
  defaultTools: false,
  // The workflow caller must be able to read the completed typed result.
  // Use the existing world retention; zero deletes it before the handoff.
  tool: false,
  limits: specialistSessionLimits("solution"),
});
