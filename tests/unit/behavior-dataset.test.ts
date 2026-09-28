import { describe, expect, it } from "vitest";
import dataset from "../../evals/fixtures/002-capability-honesty.json";
import artifactDataset from "../../evals/fixtures/004-artifact-governance.json";

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

describe("004 artifact governance behavior dataset", () => {
  it("names eight bounded actual-response cases with distinct access and source gates", () => {
    expect(artifactDataset.version).toBe(4);
    expect(artifactDataset.cases).toHaveLength(8);
    expect(new Set(artifactDataset.cases.map((item) => item.id)).size).toBe(8);
    for (const item of artifactDataset.cases) {
      expect(item.prompt.length).toBeGreaterThan(40);
      expect(item.required.length).toBeGreaterThan(50);
    }
    expect(artifactDataset.cases.filter((item) => "sourceFixture" in item ||
      "sourceText" in item)).toHaveLength(6);
    expect(artifactDataset.rubric).toContain("7/8");
  });
});
