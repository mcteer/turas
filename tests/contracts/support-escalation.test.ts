import { describe, expect, it, vi } from "vitest";
import { supportEscalationSchema, supportExternalReference } from "../../lib/contracts/support";
import { validateSupportEscalationAcceptance } from "../../lib/server/support/escalation";
import type { SupportAction } from "../../lib/contracts/support";

describe("honest escalation and manual references", () => {
  const unknown = { trigger: "Operating gap", observedImpact: "Investigation delayed", accountableRole: "Operating owner",
    routeKnown: false, unknownRouteReason: "Confirm the established incident route", evidenceChecklist: "Provide observations",
    nextCheckpointDate: "2026-10-06" };
  it("requires exactly one known route or unknown reason and bounds each field", () => {
    expect(supportEscalationSchema.safeParse(unknown).success).toBe(true);
    expect(supportEscalationSchema.safeParse({ ...unknown, route: "Invented route" }).success).toBe(false);
    expect(supportEscalationSchema.safeParse({ ...unknown, trigger: "x".repeat(2001) }).success).toBe(false);
    expect(supportEscalationSchema.safeParse({ ...unknown, routeKnown: true, unknownRouteReason: undefined, route: "Operating desk" }).success).toBe(true);
  });
  it("refuses unsafe reference URLs without ever fetching or unfurling", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      for (const url of ["http://example.test/ticket", "https://user:password@example.test/ticket", "https://example.test/ticket?q=x", "https://example.test/ticket#secret", "https://example.test/?", "https://example.test/#"])
        expect(supportExternalReference.safeParse(url).success).toBe(false);
      expect(supportExternalReference.safeParse("https://example.test/ticket/123").success).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("does not accept an unsupported known route or user-entered handoff link as a fact", () => {
    expect(() => validateSupportEscalationAcceptance({ escalation: { ...unknown, routeKnown: true, route: "Claimed entitlement" } } as SupportAction, [])).toThrow();
    expect(() => validateSupportEscalationAcceptance({ handoff: { supportingSourceKeys: [] } } as unknown as SupportAction, [])).toThrow();
  });
});
