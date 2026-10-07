import { describe, expect, it } from "vitest";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { isSupportReviewer, requireSupportAudience, requireSupportCapability, type SupportActor } from "../../lib/server/support/policy";

const actor = (principalId: string, kind: "internal" | "partner" = "internal", role: "admin" | "member" = "admin"): SupportActor => ({
  principalId, kind, role, membershipId: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002",
  loginName: "synthetic", displayName: "Synthetic", sessionId: "00000000-0000-4000-8000-000000000003", token: "synthetic",
  expiresAt: new Date("2027-01-01"),
});
describe("support capability boundaries", () => {
  it("restricts review to canonical active-policy identity, not role wording", () => {
    expect(isSupportReviewer(actor(DEMO_IDS.mcteer))).toBe(true);
    expect(isSupportReviewer(actor(DEMO_IDS.panel))).toBe(false);
    expect(isSupportReviewer(actor(DEMO_IDS.mcteer, "internal", "member"))).toBe(false);
    expect(() => requireSupportCapability(actor(DEMO_IDS.panel), "review")).toThrow();
  });
  it("allows internal proposals and advice without granting review", () => {
    expect(() => requireSupportCapability(actor(DEMO_IDS.panel), "propose")).not.toThrow();
    expect(() => requireSupportCapability(actor(DEMO_IDS.panel), "advice")).not.toThrow();
  });
  it("denies partner writes and internal representation", () => {
    const partner = actor(DEMO_IDS.partner, "partner", "member");
    for (const capability of ["propose", "review", "advice"] as const)
      expect(() => requireSupportCapability(partner, capability)).toThrow();
    expect(() => requireSupportAudience(partner, "internal")).toThrow();
    expect(() => requireSupportAudience(partner, "delivery")).not.toThrow();
  });
});
