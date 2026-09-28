import { describe, expect, it } from "vitest";
import { rateEvidence } from "../../lib/server/profiles/quality";

const asOf = new Date("2026-09-27T00:00:00Z");
const base = {
  R: 4, D: 4, C: 4,
  informationType: "product_capability" as const,
  dateBasis: "observation" as const,
  evidenceAt: new Date("2026-09-01T00:00:00Z"),
  asOf,
};

describe("evidence-quality-v1", () => {
  it("accepts every published component rating without changing the other components", () => {
    for (const value of [0, 1, 2, 3, 4]) {
      const result = rateEvidence({ ...base, R: value, D: value, C: value });
      expect(result.R).toBe(value);
      expect(result.D).toBe(value);
      expect(result.C).toBe(value);
      expect(result.F).toBe(4);
      expect(result.Q).toBe(Math.round(25 * (0.4 * value + 0.3 * 4 + 0.2 * value + 0.1 * value)));
    }
  });
  it("computes the published weighted band and component score", () => {
    expect(rateEvidence(base)).toMatchObject({ F: 4, Q: 100, band: "strong", freshness: "Recent" });
    expect(rateEvidence({ ...base, R: 0, D: 0, C: 0 }).Q).toBe(30);
  });
  it("applies 1, 1.5 and 2-window boundaries exactly", () => {
    expect(rateEvidence({ ...base, evidenceAt: new Date("2026-08-28T00:00:00Z") }).F).toBe(4);
    expect(rateEvidence({ ...base, evidenceAt: new Date("2026-08-20T00:00:00Z") }).F).toBe(3);
    expect(rateEvidence({ ...base, evidenceAt: new Date("2026-08-05T00:00:00Z") }).F).toBe(2);
    expect(rateEvidence({ ...base, evidenceAt: new Date("2026-07-01T00:00:00Z") }).F).toBe(1);
  });
  it("keeps missing and future evidence unknown and overdue review stale", () => {
    expect(rateEvidence({ ...base, evidenceAt: null }).F).toBe(0);
    expect(rateEvidence({ ...base, dateBasis: "unknown" }).freshness).toBe("Unknown");
    expect(rateEvidence({ ...base, evidenceAt: new Date("2026-10-01T00:00:00Z") }).F).toBe(0);
    expect(rateEvidence({ ...base, reviewAt: new Date("2026-09-26T00:00:00Z") })).toMatchObject({ F: 1, freshness: "Stale" });
  });
  it("expires by the next boundary or 24 hours, never by an elapsed boundary", () => {
    expect(rateEvidence(base).validUntil.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(rateEvidence({ ...base, evidenceAt: null }).validUntil.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
  it("uses every published review window and exact score band", () => {
    const windows = [
      ["account_status", 7], ["product_availability", 14],
      ["product_capability", 30], ["adoption_process", 90], ["architecture", 180],
    ] as const;
    for (const [informationType, days] of windows) {
      const evidenceAt = new Date(asOf.getTime() - days * 86_400_000);
      expect(rateEvidence({ ...base, informationType, evidenceAt }).F).toBe(4);
      expect(rateEvidence({ ...base, informationType,
        evidenceAt: new Date(evidenceAt.getTime() - 1) }).F).toBe(3);
      const oneAndHalf = new Date(asOf.getTime() - days * 1.5 * 86_400_000);
      expect(rateEvidence({ ...base, informationType, evidenceAt: oneAndHalf }).F).toBe(3);
      expect(rateEvidence({ ...base, informationType,
        evidenceAt: new Date(oneAndHalf.getTime() - 1) }).F).toBe(2);
      const twice = new Date(asOf.getTime() - days * 2 * 86_400_000);
      expect(rateEvidence({ ...base, informationType, evidenceAt: twice }).F).toBe(2);
      expect(rateEvidence({ ...base, informationType,
        evidenceAt: new Date(twice.getTime() - 1) }).F).toBe(1);
    }
    expect(rateEvidence({ ...base, R: 0, D: 0, C: 0, evidenceAt: null })).toMatchObject({ Q: 0, band: "insufficient" });
    expect(rateEvidence({ ...base, R: 4, D: 0, C: 0, evidenceAt: null })).toMatchObject({ Q: 40, band: "weak" });
    expect(rateEvidence({ ...base, R: 4, D: 4, C: 0, evidenceAt: null })).toMatchObject({ Q: 60, band: "usable" });
    expect(rateEvidence({ ...base, R: 4, D: 4, C: 0 })).toMatchObject({ Q: 90, band: "strong" });
    expect(rateEvidence({ ...base, R: 4, D: 2, C: 0 })).toMatchObject({ Q: 80, band: "strong" });
  });
  it("does not use a future event or retrieval date as evidence age", () => {
    const unknown = rateEvidence({ ...base, informationType: "unknown", evidenceAt: asOf });
    expect(unknown).toMatchObject({ F: 0, freshness: "Unknown" });
    const futureReview = new Date(asOf.getTime() + 3_600_000);
    expect(rateEvidence({ ...base, reviewAt: futureReview }).validUntil.toISOString())
      .toBe(futureReview.toISOString());
    expect(rateEvidence({ ...base, reviewAt: asOf })).toMatchObject({ F: 1, freshness: "Stale" });
  });
});
