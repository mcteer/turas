import { supportAdviceResultSchema } from "../lib/support/advice";
import { supportDigest } from "../lib/server/support/commands";

/** Private evaluation evidence only; never grants eligibility to model output. */
export function supportProviderFinishReason(finishReason: unknown) {
  const reason = typeof finishReason === "string" ? finishReason :
    finishReason && typeof finishReason === "object" && "unified" in finishReason ? finishReason.unified : null;
  return typeof reason === "string" && ["stop", "length", "tool-calls", "content-filter", "error", "other", "unknown"].includes(reason)
    ? reason : "unknown";
}

export function captureSupportProviderOutput(text: string, finishReason: unknown) {
  if (Buffer.byteLength(text, "utf8") > 131072) throw new Error("Support provider output capture exceeds bound");
  const reason = supportProviderFinishReason(finishReason);
  if (reason !== "stop") return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const parsed = supportAdviceResultSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.actionSuggestions.length) return null;
  return { text, output: parsed.data, digest: supportDigest(parsed.data) };
}
