import { specialistModel } from "../../lib/authorize-specialist";
import { defineAgent } from "eve";
export default defineAgent({
  description: "Research and retain technical best practices for using Vercel products. Search official Vercel documentation plus credible engineering blogs, webinars, conference presentations and practitioner reports; rate source freshness, preserve conflicts and store reusable evidence for implementation-research. Do not research a specific customer's current state or design an engagement.",
  model: specialistModel("best-practices"),
  reasoning: "high",
  defaultTools: false,
  // The workflow caller must be able to read the completed typed result.
  // Use the existing world retention; zero deletes it before the handoff.
  tool: false,
  limits: { maxInputTokensPerSession: 400000, maxOutputTokensPerSession: 28000, maxTokenCostUsdPerSession: 2, sessionTimeoutMs: 600000 },
});
