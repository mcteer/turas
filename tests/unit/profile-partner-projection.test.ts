import { describe, expect, it, vi } from "vitest";
import { projectRevision, type ProjectionRow } from "../../lib/server/profiles/projection";
import { recordKindSchema } from "../../lib/contracts/profile-payloads";
import { internalProfileRevisionDtoSchema, partnerProfileRevisionDtoSchema,
  unknownQualityInput } from "../../lib/contracts/profiles";

const own = "00000000-0000-4000-8000-000000000101";
const other = "00000000-0000-4000-8000-000000000102";
function row(overrides: Partial<ProjectionRow> = {}): ProjectionRow {
  return { id: "00000000-0000-4000-8000-000000000201",
    recordId: "00000000-0000-4000-8000-000000000202", workloadId: null,
    kind: "claim", reviewState: "accepted", audience: "delivery",
    dataCategory: "delivery_context", authorMembershipId: other,
    payload: { kind: "claim", text: "Synthetic delivery fact", sourceType: "manual" },
    qualityInput: unknownQualityInput, sourceReferences: [], candidateSequence: 9,
    decisionRationale: "Private reviewer reasoning", partnerSafeReason: "Safe reason",
    ...overrides };
}

describe("partner profile projection", () => {
  it("shows accepted delivery context from any contributor without private review fields", () => {
    for (const kind of recordKindSchema.options) {
      const visible = projectRevision(row({ kind, payload: { kind,
        ...(kind === "stakeholder" ? { classification: "delivery" } : {}) } }), "partner", own);
      expect(visible).toMatchObject({ reviewState: "accepted", kind });
      for (const hidden of ["authorMembershipId", "candidateSequence", "decisionRationale",
        "qualityInput", "sourceReferences", "partnerSafeReason"]) {
        expect(visible).not.toHaveProperty(hidden);
      }
    }
  });

  it("shows only the actor's pending/rejected content with a safe reason", () => {
    for (const state of ["pending", "rejected"] as const) {
      expect(projectRevision(row({ reviewState: state }), "partner", own)).toBeNull();
      expect(projectRevision(row({ reviewState: state, authorMembershipId: own }), "partner", own))
        .toMatchObject({ reviewState: state, partnerSafeReason: "Safe reason" });
    }
  });

  it("does not reveal hidden candidate sequence changes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-02T00:00:00.000Z"));
      expect(projectRevision(row({ candidateSequence: 3 }), "partner", own))
        .toEqual(projectRevision(row({ candidateSequence: 97 }), "partner", own));
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates distinct partner and internal DTO shapes", () => {
    const partner = projectRevision(row(), "partner", own);
    expect(partnerProfileRevisionDtoSchema.safeParse(partner).success).toBe(true);
    expect(partnerProfileRevisionDtoSchema.safeParse({ ...partner,
      authorMembershipId: other }).success).toBe(false);
    const internal = projectRevision(row(), "internal", own);
    expect(internalProfileRevisionDtoSchema.safeParse(internal).success).toBe(true);
    expect(partnerProfileRevisionDtoSchema.safeParse(internal).success).toBe(false);
    expect(internal).toMatchObject({ audience: "delivery", dataCategory: "delivery_context" });
    expect(partner).not.toHaveProperty("audience");
    expect(partner).not.toHaveProperty("dataCategory");
  });

  it("excludes internal categories, internal stakeholders and unsupported restricted support", () => {
    for (const category of ["internal_operations", "commercial", "personnel", "other_internal"] as const) {
      expect(projectRevision(row({ dataCategory: category }), "partner", own)).toBeNull();
    }
    expect(projectRevision(row({ audience: "internal" }), "partner", own)).toBeNull();
    expect(projectRevision(row({ kind: "stakeholder", payload: { kind: "stakeholder",
      name: "Private owner", classification: "internal" } }), "partner", own)).toBeNull();
    expect(projectRevision(row({ restrictedSupport: true, safeAttestation: null }),
      "partner", own)).toBeNull();
    const attested = projectRevision(row({ restrictedSupport: true,
      safeAttestation: "Reviewed support is available to the internal team" }), "partner", own);
    expect(attested).toMatchObject({ sourceStatus: "restricted" });
    expect(JSON.stringify(attested)).not.toContain("Private reviewer reasoning");
  });

  it("removes private chat lineage and hidden nested support while retaining visible citations", () => {
    const visibleId = "00000000-0000-4000-8000-000000000301";
    const hiddenId = "00000000-0000-4000-8000-000000000302";
    const projected = projectRevision(row({ visibleEvidenceIds: [visibleId], payload: {
      kind: "claim", text: "Synthetic delivery statement", sourceType: "manual",
      sourceMessageId: "00000000-0000-4000-8000-000000000303",
      sourceSpanDigest: "a".repeat(64), sourceUrl: "https://example.com/private",
      sourceExcerpt: "Private supporting text", ownerReferenceId: hiddenId,
      evidenceRevisionIds: [visibleId, hiddenId],
      dimensions: [{ key: "outcome_ownership", evidenceRevisionIds: [hiddenId, visibleId] }],
    } }), "partner", own);
    expect(projected).toMatchObject({ payload: { evidenceRevisionIds: [visibleId],
      dimensions: [{ evidenceRevisionIds: [visibleId] }] } });
    for (const hidden of [hiddenId, "00000000-0000-4000-8000-000000000303",
      "a".repeat(64), "https://example.com/private", "Private supporting text"]) {
      expect(JSON.stringify(projected)).not.toContain(hidden);
    }
    const internal = projectRevision(row({ payload: { kind: "claim", text: "Shared exact claim",
      sourceMessageId: "00000000-0000-4000-8000-000000000303",
      sourceSpanDigest: "a".repeat(64) } }), "internal", own);
    expect(internal).toMatchObject({ payload: { text: "Shared exact claim" } });
    expect(JSON.stringify(internal)).not.toContain("00000000-0000-4000-8000-000000000303");
  });
});
