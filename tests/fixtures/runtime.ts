export function assertDeterministicTestMode(environment: Record<string, string | undefined> = process.env): void {
  if (environment.TURAS_ALLOW_LIVE_MODEL_TESTS === "1") {
    throw new Error("Deterministic tests cannot enable paid model calls");
  }
}

export function deterministicReply(input: string): string {
  assertDeterministicTestMode();
  return `Synthetic test response to: ${input}`;
}
