import { describe, expect, it } from "vitest";
import { profilePayloadSchema } from "../../lib/contracts/profile-payloads";
import { maturityDimensions, maturityStages, maturityStates,
  validateMaturityAssessment } from "../../lib/server/profiles/maturity";

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
function unknownAssessment() {
  return {
    kind: "maturity_assessment" as const, observationStart: iso(-40), observationEnd: iso(-10),
    assessor: "Synthetic assessor", rubricVersion: "customer-maturity-v1" as const,
    rationale: "Evidence is incomplete", nextCapability: "Gather evidence", reviewAt: iso(20),
    dimensions: maturityDimensions.map(({ key }) => ({ key, state: "Unknown" as const,
      rationale: "Missing current evidence", nextCapability: "Gather evidence",
      evidenceRevisionIds: [] as string[] })), evidenceRevisionIds: [] as string[],
  };
}

describe("customer maturity rubric", () => {
  it("keeps six dimensions independent and permits an explicitly Unknown assessment", () => {
    expect(maturityDimensions).toHaveLength(6);
    expect(maturityStates).toEqual(["Unknown", "Emerging", "Established", "Measured", "Scaled", "Adaptive"]);
    expect(maturityStages).toEqual(["Explore", "Activate", "Accelerate", "Optimize", "Scale", "Transform"]);
    const payload = profilePayloadSchema.parse(unknownAssessment());
    expect(() => validateMaturityAssessment(payload)).not.toThrow();
    expect("journeyStage" in payload).toBe(false);
  });

  it("requires all six distinct dimensions, eligible support for known states and a stage citation", () => {
    const missing = { ...unknownAssessment(), dimensions: unknownAssessment().dimensions.slice(0, 5) };
    expect(profilePayloadSchema.safeParse(missing).success).toBe(false);
    const known = unknownAssessment();
    known.dimensions[0] = { ...known.dimensions[0], state: "Measured" as never };
    expect(profilePayloadSchema.safeParse(known).success).toBe(false);
    const stage = { ...unknownAssessment(), journeyStage: "Accelerate" };
    expect(profilePayloadSchema.safeParse(stage).success).toBe(false);
  });

  it("rejects a future observation but permits a future review", () => {
    const future = { ...unknownAssessment(), observationEnd: iso(1) };
    expect(profilePayloadSchema.safeParse(future).success).toBe(false);
    const past = profilePayloadSchema.parse(unknownAssessment());
    expect(() => validateMaturityAssessment(past)).not.toThrow();
  });

  it("rejects reversed windows, premature review and citations on an Unknown dimension", () => {
    const reversed = { ...unknownAssessment(), observationStart: iso(-5) };
    expect(profilePayloadSchema.safeParse(reversed).success).toBe(false);
    const premature = { ...unknownAssessment(), reviewAt: iso(-11) };
    expect(profilePayloadSchema.safeParse(premature).success).toBe(false);
    const cited = unknownAssessment();
    cited.dimensions[0].evidenceRevisionIds = ["00000000-0000-4000-8000-000000000999"];
    const parsed = profilePayloadSchema.parse(cited);
    expect(() => validateMaturityAssessment(parsed)).toThrowError(/Unknown dimensions cannot cite support/);
  });
});
