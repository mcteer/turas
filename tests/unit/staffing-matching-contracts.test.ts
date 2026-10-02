import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingCreateMatchSchema, staffingMatchPageSchema } from "../../lib/contracts/staffing-matching";
describe("exact bounded matching requests", () => {
  it("binds computation to the exact demand and refuses caller resource pools or ranking inputs", () => {
    const input = { requestKey: randomUUID(), rationale: "Synthetic comparison", revisionId: randomUUID(), contentDigest: "a".repeat(64), expectedAggregateVersion: 2 };
    expect(staffingCreateMatchSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ resourceIds: [randomUUID()] }, { sortBy: "cost" }, { asOf: "2026-10-01T00:00:00Z" },
      { ignoreUnknown: true }, { contentDigest: undefined }]) expect(staffingCreateMatchSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("requires an exact result and bounded scope cursor pagination", () => {
    expect(staffingMatchPageSchema.parse({ resultId: randomUUID() }).pageSize).toBe(20);
    for (const input of [{}, { resultId: randomUUID(), pageSize: 51 }, { resultId: randomUUID(), pageSize: 0 },
      { resultId: randomUUID(), cursor: "x".repeat(2049) }, { resultId: randomUUID(), mode: "finance" }]) {
      expect(staffingMatchPageSchema.safeParse(input).success).toBe(false);
    }
  });
});
