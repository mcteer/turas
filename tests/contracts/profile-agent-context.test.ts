import { describe, expect, it } from "vitest";
import { z } from "zod";
import { authoredTool as customerContext } from "../../agent/tools/customer_context";
import { authoredTool as proposeCustomerContext } from "../../agent/tools/propose_customer_context";
import guardCustomerContext from "../../agent/hooks/guard-customer-context";
import { authoredTool as artifactContext } from "../../agent/tools/artifact_context";
import { authoredTool as proposeArtifactClaim } from "../../agent/tools/propose_artifact_claim";

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

  it("accepts only a bounded selected source number for artifact reads and proposals", () => {
    const artifactSchema = artifactContext.inputSchema as z.ZodType;
    const payload = { kind: "claim",text: "Synthetic selected-source claim",sourceType: "manual" };
    expect(artifactSchema.safeParse({ sourceNumber: 1 }).success).toBe(true);
    expect(artifactSchema.safeParse({ sourceNumber: 6 }).success).toBe(false);
    expect(artifactSchema.safeParse({ sourceNumber: 1,path: "/private/file" }).success).toBe(false);
    expect(proposeSchema.safeParse({ payload,artifactSourceNumber: 2 }).success).toBe(true);
    expect(proposeSchema.safeParse({ payload,artifactSourceNumber: 6 }).success).toBe(false);
    const selectedClaim = proposeArtifactClaim.inputSchema as z.ZodType;
    expect(selectedClaim.safeParse({ sourceNumber: 1,text: "Synthetic Pending claim" }).success)
      .toBe(true);
    expect(selectedClaim.safeParse({ sourceNumber: 1,text: "Synthetic Pending claim",
      coverage: { omitted: 0 } }).success).toBe(false);
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
