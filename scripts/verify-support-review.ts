import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { verifySupportActualReview } from "./support-review-contract";
import { featureSourceDigest } from "./execution-source-digest";
import { supportDigest } from "../lib/server/support/commands";
import { supportAdvicePrompt, validateSupportAdviceResult } from "../lib/support/advice";
import { supportEvaluationCases } from "../tests/fixtures/support/evaluation";

export const supportArtifactDigest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const captureSchema = z.object({ version: z.literal("support-live-capture-v1"), caseId: z.string(), attemptId: z.string().uuid(),
  sourceDigest: z.string(), rootAgentDigest: z.string(), promptDigest: z.string(), cohortDigest: z.string(), model: z.string(),
  actualConfiguredProvider: z.literal(true), input: z.unknown(), sourceMap: z.array(z.object({ id: z.string().uuid() }).passthrough()),
  output: z.unknown().nullable(), terminalState: z.string(), released: z.boolean(), initialDispatches: z.literal(1),
  automaticPaidRetries: z.literal(0), paidSteps: z.number().int().min(0).max(6), inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().min(0).max(24576), costUsd: z.number().finite().nonnegative(), latencyMs: z.number().finite().nonnegative().max(120000),
  providerMetadataComplete: z.literal(true), domainUnchanged: z.literal(true), staleSuggestionSaveDenied: z.boolean(),
}).strict();

export function verifySupportCapture(raw: unknown, review: ReturnType<typeof verifySupportActualReview>, index: number) {
  const capture = captureSchema.parse(raw), item = review.cases[index];
  if (!item || capture.caseId !== item.id || capture.attemptId !== item.attemptId) throw new Error("Capture identity mismatch");
  for (const key of ["sourceDigest", "rootAgentDigest", "promptDigest", "cohortDigest", "model"] as const)
    if (capture[key] !== review[key]) throw new Error("Capture version identity mismatch");
  for (const key of ["terminalState", "released", "initialDispatches", "automaticPaidRetries", "paidSteps", "inputTokens",
    "outputTokens", "costUsd", "latencyMs", "providerMetadataComplete", "domainUnchanged", "staleSuggestionSaveDenied"] as const)
    if (capture[key] !== item[key]) throw new Error("Capture measurement mismatch");
  if (supportDigest(capture.input) !== item.inputDigest || supportDigest(capture.sourceMap) !== item.sourceMapDigest ||
    (capture.output === null ? null : supportDigest(capture.output)) !== item.outputDigest) throw new Error("Capture content digest mismatch");
  if (capture.released) validateSupportAdviceResult(capture.output, capture.sourceMap.map(source => source.id));
  else if (capture.output !== null) throw new Error("Withheld capture retained released output");
  return capture;
}

async function readPrivateArtifact(path: string, root: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4000000 || (info.mode & 0o077) !== 0)
    throw new Error("Review requires bounded private regular artifacts");
  const actual = await realpath(path), within = relative(root, actual);
  if (!within || within.startsWith("..") || isAbsolute(within)) throw new Error("Review artifact escaped its private root");
  return readFile(actual);
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--review") throw new Error("Support review requires --review <private-review.json>");
  const root = await realpath(resolve("local-artifacts/010")), path = resolve(process.argv[3]);
  const review = verifySupportActualReview(JSON.parse((await readPrivateArtifact(path, root)).toString("utf8")));
  const agent = await readFile("agent/agent.ts", "utf8");
  const model = agent.match(/const selectedModel = "([^"]+)";/)?.[1];
  if (!model || review.model !== model || review.rootAgentDigest !== supportArtifactDigest(agent) ||
    review.sourceDigest !== await featureSourceDigest("010") || review.promptDigest !== supportArtifactDigest(supportAdvicePrompt) ||
    review.cohortDigest !== supportDigest(supportEvaluationCases)) throw new Error("Review is not bound to current source/model/prompt/cohort");
  for (const [index, item] of review.cases.entries()) {
    if (isAbsolute(item.capturePath)) throw new Error("Capture paths must be relative to the review");
    const bytes = await readPrivateArtifact(resolve(dirname(path), item.capturePath), root);
    if (supportArtifactDigest(bytes) !== item.captureDigest) throw new Error("Capture file hash mismatch");
    verifySupportCapture(JSON.parse(bytes.toString("utf8")), review, index);
  }
  console.log(JSON.stringify({ gate: "support-actual-output-review", cases: 8, sourceDigest: review.sourceDigest,
    actualConfiguredProvider: true, hostedProof: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(() => { console.error("Support live review verification failed; inspect private artifacts"); process.exitCode = 1; });
