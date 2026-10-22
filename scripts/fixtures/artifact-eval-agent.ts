import { defineAgent } from "eve";
import { wrapLanguageModel } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {artifactEvalOutputMiddleware} from './artifact-eval-output-limit';

// Same selected model as the root agent, with the local evaluation's per-call cap.
export default defineAgent({
  model: wrapLanguageModel({ model: gateway("spacexai/grok-4.7"),
    middleware: artifactEvalOutputMiddleware }),
  modelContextWindowTokens: 131_072,
});
