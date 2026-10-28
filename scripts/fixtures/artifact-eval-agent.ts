import { defineAgent } from "eve";
import { wrapLanguageModel } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {artifactEvalOutputMiddleware} from './artifact-eval-output-limit';

// Preserve the root model and reasoning, with the local evaluation's per-call cap.
export default defineAgent({
  model: wrapLanguageModel({ model: gateway("anthropic/claude-sonnet-5.5"),
    middleware: artifactEvalOutputMiddleware }),
  modelContextWindowTokens: 131_072,
  reasoning: "low",
});
