import {specialistSessionLimits} from '../../../lib/server/research/specialists/discussion-policy';
import { specialistModel } from "../../lib/authorize-specialist";
import { defineAgent } from "eve";
export default defineAgent({
  description: "Research and retain technical best practices for using Vercel products. Search official Vercel documentation plus credible engineering blogs, webinars, conference presentations and practitioner reports; rate source freshness, preserve conflicts and store reusable evidence for implementation-research. Do not research a specific customer's current state or design an engagement.",
  model: specialistModel("best-practices"),
  reasoning: "high",
  defaultTools: false,
  // The supervisor validates a completed turn and its current stored receipt.
  // Retain live turns; ended private sessions follow the trace-derived deletion policy.
  tool: false,
  limits: specialistSessionLimits("best-practices"),
});
