import { describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ checked: 0, receipts: 0, queries: 0, invalidAttempt: false }));
vi.mock("../../lib/server/db/client", () => ({ withTransaction: async (run: (client: unknown) => Promise<unknown>) =>
  run({ query: async () => { gate.queries += 1; return { rowCount: gate.receipts, rows: [] }; } }) }));
vi.mock("../../lib/server/staffing/native-context", () => ({ staffingResponseScope: async () => null }));
vi.mock("../../lib/server/artifacts/context", () => ({ readCurrentArtifactDraft: async () => null }));
vi.mock("../../lib/server/profiles/attempt-context", () => ({
  readCurrentAttemptContext: async () => {
    gate.checked += 1;
    if (gate.invalidAttempt) throw new Error("Synthetic context expired");
    return { contractVersion: "customer-context-v1", contextVersion: "1",
      asOf: new Date().toISOString(), validUntil: new Date(Date.now() + 120_000).toISOString(),
      entries: [], complete: true, truncated: false };
  },
}));

import guardCustomerContext from "../../agent/hooks/guard-customer-context";

type StepHook = (event: { data: { turnId: string } }, context: {
  session: { auth: { current: { principalId: string; attributes: { turasAttemptId: string } } } },
}) => Promise<void>;
const step = (guardCustomerContext as unknown as { events: { "step.started": StepHook } })
  .events["step.started"];

describe("model-step context gate", () => {
  it("validates the current attempt and its exact turn injection on every step", async () => {
    const context = { session: { auth: { current: {
      principalId: crypto.randomUUID(), attributes: { turasAttemptId: crypto.randomUUID() },
    } } } };
    gate.checked = 0;
    gate.receipts = 0;
    gate.queries = 0;
    gate.invalidAttempt = true;
    await expect(step({ data: { turnId: "synthetic-turn-1" } }, context))
      .rejects.toThrow("Synthetic context expired");
    expect(gate.queries).toBe(0);
    gate.invalidAttempt = false;
    await expect(step({ data: { turnId: "synthetic-turn-1" } }, context))
      .rejects.toThrow("Customer context was not injected");
    expect(gate.checked).toBe(2);
    expect(gate.queries).toBe(1);
    gate.receipts = 1;
    await expect(step({ data: { turnId: "synthetic-turn-1" } }, context))
      .resolves.toBeUndefined();
    await expect(step({ data: { turnId: "synthetic-turn-2" } }, context))
      .resolves.toBeUndefined();
    expect(gate.checked).toBe(4);
  });
});
