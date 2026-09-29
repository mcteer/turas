import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { judgedPassages } from "../fixtures/retrieval/judged-corpus";

const retrieval = JSON.parse(readFileSync(
  "evals/fixtures/005-retrieval-governance.json","utf8")) as {
  version: string;answerableQueries: Array<{ id: string;kind: string;
    query: string;relevantPassages: string[] }>;
  denials: Array<{ id: string;actor: string;expected: string }>;
};
const research = JSON.parse(readFileSync(
  "evals/fixtures/005-research-cases.json","utf8")) as {
  version: string;caseLimit: number;maxRootStepsPerCase: number;
  maxOutputTokensPerStep: number;minimumScore: number;hardGates: string[];
  cases: Array<{ id: string;expectedReview: string;requiresActualOutput: boolean }>;
};

describe("fixed 005 judged fixtures",() => {
  it("binds all relevance labels to the seeded synthetic source text",() => {
    expect(retrieval.version).toBe("005-retrieval-governance-v1");
    expect(retrieval.answerableQueries).toHaveLength(40);
    expect(retrieval.answerableQueries.filter((item) => item.kind === "semantic").length)
      .toBeGreaterThanOrEqual(8);
    expect(new Set(retrieval.answerableQueries.map((item) => item.id)).size).toBe(40);
    expect(retrieval.denials.map((item) => item.expected).sort())
      .toEqual(["denied","no_results"]);
    const corpus = new Set<string>(judgedPassages);
    expect(corpus.size).toBe(20);
    const labeled = new Set<string>();
    for (const item of retrieval.answerableQueries) {
      expect(item.query.trim()).toBe(item.query);
      expect(item.relevantPassages.length).toBeGreaterThan(0);
      for (const passage of item.relevantPassages) {
        expect(corpus.has(passage),item.id).toBe(true);
        labeled.add(passage);
      }
    }
    expect(labeled).toEqual(corpus);
  });

  it("defines every actual-output case and its fixed hard gates",() => {
    expect(research.version).toBe("005-research-review-v1");
    expect(research.caseLimit).toBe(12);
    expect(research.cases.map((item) => item.id))
      .toEqual(Array.from({ length: 12 },(_,index) =>
        `R${String(index+1).padStart(2,"0")}`));
    expect(research.maxRootStepsPerCase).toBe(5);
    expect(research.maxOutputTokensPerStep).toBe(1_000);
    expect(research.minimumScore).toBe(7);
    expect(new Set(research.hardGates))
      .toEqual(new Set(["authority","origin","integrity","citation","budget"]));
    expect(research.cases.every((item) =>
      item.requiresActualOutput && item.expectedReview.trim().length > 0)).toBe(true);
  });
});
