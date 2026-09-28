import { describe, expect, it } from "vitest";
import { z } from "zod";
import customerContext from "../../agent/tools/customer_context";
import proposeCustomerContext from "../../agent/tools/propose_customer_context";
import guardCustomerContext from "../../agent/hooks/guard-customer-context";

const readSchema = customerContext.inputSchema as z.ZodType;
const proposeSchema = proposeCustomerContext.inputSchema as z.ZodType;

describe("bounded agent profile tools", () => {
  it("does not accept caller-selected customer, actor, origin or review state", () => {
    expect(readSchema.safeParse({ customerId: crypto.randomUUID() }).success)
      .toBe(false);
    const payload = { kind: "claim", text: "Synthetic assistant proposal", sourceType: "manual" };
    for (const override of [
      { customerId: crypto.randomUUID() }, { workspaceId: crypto.randomUUID() },
      { actorMembershipId: crypto.randomUUID() }, { origin: "independent_research" },
      { reviewState: "accepted" }, { requestedAudience: "delivery" },
    ]) {
      expect(proposeSchema.safeParse({ payload, ...override }).success)
        .toBe(false);
    }
    expect(proposeSchema.safeParse({ payload }).success).toBe(true);
  });

  it("requires an exact correction target version and rejects client scores", () => {
    const payload = { kind: "claim", text: "Synthetic correction", sourceType: "manual" };
    expect(proposeSchema.safeParse({ payload,
      recordId: crypto.randomUUID() }).success).toBe(false);
    expect(proposeSchema.safeParse({ payload,
      qualityInput: { Q: 100 } }).success).toBe(false);
  });

  it("refuses a model step before a customer attempt is bound", async () => {
    const hook = guardCustomerContext as unknown as { events: {
      "step.started": (event: { data: { turnId: string } }, context: {
        session: { auth: { current: null } } }) => Promise<void> } };
    await expect(hook.events["step.started"]({ data: { turnId: crypto.randomUUID() } },
      { session: { auth: { current: null } } }))
      .rejects.toThrow("Customer context was not bound to this turn");
  });
});
