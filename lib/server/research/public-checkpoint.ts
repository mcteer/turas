export type PublicOperationStep = {
  state: "dispatched" | "complete" | "failed";
  inputDigest?: string;
  result?: unknown;
  code?: string;
};

/** Reserve before external I/O; an uncertain or failed dispatch is never replayed. */
export async function dispatchPublicOperation<T>(options: {
  steps: Record<string, PublicOperationStep>;
  key: string;
  inputDigest?: string;
  save: () => Promise<void>;
  guard: () => void;
  safeCode: (error: unknown) => string;
  work: () => Promise<T>;
}): Promise<T> {
  const prior = options.steps[options.key];
  if (prior?.inputDigest && prior.inputDigest !== options.inputDigest) {
    throw new Error("Checkpoint operation input changed; operator reconciliation required");
  }
  // v1 completed captures lack a digest. Reusing the known response is allowed;
  // it is not a new provider result and all source/dossier checks still apply.
  if (prior?.state === "complete") return prior.result as T;
  if (prior) throw new Error("Unconfirmed or failed operation requires operator reconciliation; no automatic paid replay");
  options.guard();
  options.steps[options.key] = { state: "dispatched", inputDigest: options.inputDigest };
  await options.save();
  try {
    const result = await options.work();
    options.steps[options.key] = { state: "complete", inputDigest: options.inputDigest, result };
    await options.save();
    return result;
  } catch (error) {
    options.steps[options.key] = { state: "failed", inputDigest: options.inputDigest, code: options.safeCode(error) };
    await options.save();
    throw error;
  }
}
