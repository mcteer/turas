/** Cleanup is deliberately outside the paid-run deadline. Setup and subsequent
 * work must use the remaining original allowance, never create a fresh one. */
export function ownedEvalTimeout(deadlineAt: number | undefined, maximumMs: number, now = Date.now()): number {
  if (!Number.isSafeInteger(maximumMs) || maximumMs < 1 ||
      deadlineAt !== undefined && !Number.isSafeInteger(deadlineAt)) throw new Error("Invalid owned evaluation deadline");
  const remaining = deadlineAt === undefined ? maximumMs : deadlineAt - now;
  if (remaining <= 0) throw new Error("Original owned evaluation deadline reached");
  return Math.min(maximumMs, remaining);
}
