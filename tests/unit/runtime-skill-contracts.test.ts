import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

function skill(name: string) {
  return readFileSync(new URL(`../../agent/skills/${name}/SKILL.md`, import.meta.url), "utf8");
}

it("keeps closeout in the delivery lifecycle and codification outside the numbered phases", () => {
  const methodology = skill("delivery-methodology");
  expect(methodology).toMatch(/^\| 7\. Close \|/m);
  expect(methodology).toMatch(/^### Stage 7 — Close$/m);
  expect(methodology).toMatch(/^### Codify Field Learning \(cross-cutting\)$/m);
  expect(methodology).toContain("through the governed review path; do not submit or publish it automatically");
  expect(methodology).not.toMatch(/^(?:\| \d+\. Codify|### Stage \d+ — Codify)/m);
});

it("distinguishes a complete formal maturity record from an optional reviewed journey stage", () => {
  const maturity = skill("customer-maturity-journey");
  expect(maturity).toMatch(/formal `customer-maturity-v1` assessment records all six dimensions/i);
  expect(maturity).toMatch(/mark unsupported dimensions \*\*Unknown\*\*/i);
  expect(maturity).toMatch(/journey-stage summary is optional, evidenced, and human-reviewed/i);
});

it("attributes solution assessment to the model reported by the evaluator", () => {
  const research = skill("solution-research");
  expect(research).toContain("use the evaluator model reported by the tool");
  expect(research).not.toContain("The primary model answers");
});
