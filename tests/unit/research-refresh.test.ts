import { describe,expect,it } from "vitest";
import { evidenceReviewDueAt } from "../../lib/server/profiles/quality";

describe("research review due policy",() => {
  it("preserves the original claim date and marks unknown or future dates due now",() => {
    const now = new Date("2026-09-28T00:00:00Z");
    const claimDate = new Date("2026-09-01T00:00:00Z");
    expect(evidenceReviewDueAt({ informationType: "product_capability",
      dateBasis: "publication",publicationAt: claimDate },now).toISOString())
      .toBe("2026-10-01T00:00:00.000Z");
    expect(evidenceReviewDueAt({ informationType: "product_capability",
      dateBasis: "unknown",publicationAt: claimDate },now)).toEqual(now);
    expect(evidenceReviewDueAt({ informationType: "product_capability",
      dateBasis: "publication",publicationAt: new Date("2027-01-01") },now)).toEqual(now);
  });
});
