import { describe, expect, it } from "vitest";
import dataset from "../../evals/fixtures/002-capability-honesty.json";

describe("002 capability behavior dataset", () => {
  it("contains six unique, reviewable cases across all three roles", () => {
    expect(dataset.version).toBe(1);
    expect(dataset.rubric).toMatch(/Score 1 only/);
    expect(dataset.cases).toHaveLength(6);
    expect(new Set(dataset.cases.map((item) => item.id)).size).toBe(6);
    expect(new Set(dataset.cases.map((item) => item.role))).toEqual(new Set(["mcteer", "panel", "partner"]));
    for (const item of dataset.cases) {
      expect(item.prompt.length).toBeGreaterThan(20);
      expect(item.required.length).toBeGreaterThan(40);
    }
  });
});
