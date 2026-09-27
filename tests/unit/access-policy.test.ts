import { describe, expect, it } from "vitest";
import { canAccessCustomer, canAccessConversation } from "../../lib/server/access/policy";

const base = {
  principalActive: true,
  membershipActive: true,
  workspaceActive: true,
  partnerOrganizationActive: true,
  membershipWorkspaceId: "workspace-a",
  customerWorkspaceId: "workspace-a",
  grantActive: false,
};

describe("customer and chat access", () => {
  it("gives active internal members all present and future workspace customers", () => {
    expect(canAccessCustomer({ ...base, kind: "internal" })).toBe(true);
    expect(canAccessCustomer({ ...base, kind: "internal", customerWorkspaceId: "new-customer-workspace" })).toBe(false);
  });

  it("requires an active explicit partner assignment and organization", () => {
    expect(canAccessCustomer({ ...base, kind: "partner" })).toBe(false);
    expect(canAccessCustomer({ ...base, kind: "partner", grantActive: true })).toBe(true);
    expect(canAccessCustomer({ ...base, kind: "partner", grantActive: true, partnerOrganizationActive: false })).toBe(false);
  });

  it("fails closed for disabled principals, memberships and workspaces", () => {
    expect(canAccessCustomer({ ...base, kind: "internal", principalActive: false })).toBe(false);
    expect(canAccessCustomer({ ...base, kind: "internal", membershipActive: false })).toBe(false);
    expect(canAccessCustomer({ ...base, kind: "internal", workspaceActive: false })).toBe(false);
  });

  it("requires conversation ownership even for administrators and shared customers", () => {
    const access = { ...base, kind: "internal" as const };
    expect(canAccessConversation(access, "panel", "mcteer")).toBe(false);
    expect(canAccessConversation(access, "panel", "panel")).toBe(true);
  });
});
