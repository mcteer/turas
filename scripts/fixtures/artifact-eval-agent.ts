import { defineAgent } from "eve";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import { gateway } from "@ai-sdk/gateway";

// Same selected model as the root agent, with the local evaluation's per-call cap.
export default defineAgent({
  model: wrapLanguageModel({ model: gateway("spacexai/grok-4.7"),
    middleware: defaultSettingsMiddleware({ settings: { maxOutputTokens: 1_000 } }) }),
  modelContextWindowTokens: 131_072,
});
