import { describe, expect, it } from "vitest";
import { projectRevision, type ProjectionRow } from "../../lib/server/profiles/projection";

const accepted: ProjectionRow = {
  id: "revision-1", recordId: "record-1", workloadId: null, kind: "claim",
  reviewState: "accepted", audience: "delivery", dataCategory: "delivery_context",
  authorMembershipId: "someone-else", payload: { kind: "claim", text: "Synthetic delivery fact" },
  qualityInput: {}, sourceReferences: ["private-source"], candidateSequence: 9,
  decisionRationale: "internal note", partnerSafeReason: null,
};

describe("profile projection", () => {
  it("gives assigned partners accepted delivery facts regardless of contributor", () => {
    expect(projectRevision(accepted, "partner", "partner-member")).toMatchObject({
      id: accepted.id, payload: accepted.payload, reviewState: "accepted",
    });
  });
  it("excludes operations and other contributors' unaccepted revisions before output", () => {
    expect(projectRevision({ ...accepted, dataCategory: "internal_operations" }, "partner", "partner-member")).toBeNull();
    expect(projectRevision({ ...accepted, audience: "internal" }, "partner", "partner-member")).toBeNull();
    expect(projectRevision({ ...accepted, reviewState: "pending" }, "partner", "partner-member")).toBeNull();
    expect(projectRevision({ ...accepted, reviewState: "rejected" }, "partner", "partner-member")).toBeNull();
  });
  it("shows own pending/rejected safe reasons without private lineage or counters", () => {
    const own = projectRevision({ ...accepted, reviewState: "rejected", authorMembershipId: "partner-member",
      partnerSafeReason: "Needs a direct source" }, "partner", "partner-member");
    expect(own).toMatchObject({ reviewState: "rejected", partnerSafeReason: "Needs a direct source" });
    expect(own).not.toHaveProperty("decisionRationale");
    expect(own).not.toHaveProperty("sourceReferences");
    expect(own).not.toHaveProperty("candidateSequence");
    expect(own).not.toHaveProperty("authorMembershipId");
  });
  it("allows internal readers full profile revisions without private chat lineage", () => {
    const row = projectRevision(accepted, "internal", "internal-member");
    expect(row).toMatchObject({ authorMembershipId: "someone-else", decisionRationale: "internal note" });
    expect(row).not.toHaveProperty("privateConversationId");
  });
});
