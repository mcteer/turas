import type { ProfilePayload } from "../../contracts/profile-payloads";
import { HttpFailure } from "../../contracts/http";

export const maturityRubricVersion = "customer-maturity-v1" as const;
export const maturityStages = ["Explore", "Activate", "Accelerate", "Optimize", "Scale", "Transform"] as const;
export const maturityStates = ["Unknown", "Emerging", "Established", "Measured", "Scaled", "Adaptive"] as const;
export const maturityDimensions = [
  { key: "outcome_ownership", label: "Outcome ownership" },
  { key: "delivery_collaboration", label: "Delivery collaboration" },
  { key: "experience_adoption", label: "Experience adoption" },
  { key: "operational_trust", label: "Operational trust" },
  { key: "platform_organization", label: "Platform organization" },
  { key: "innovation_ai", label: "Innovation and AI" },
] as const;

export function validateMaturityAssessment(payload: ProfilePayload): void {
  if (payload.kind !== "maturity_assessment") return;
  if (payload.rubricVersion !== maturityRubricVersion || payload.dimensions.length !== maturityDimensions.length ||
      new Set(payload.dimensions.map((dimension) => dimension.key)).size !== maturityDimensions.length) {
    throw new HttpFailure(422, "invalid_maturity", "A complete six-dimension assessment is required");
  }
  if (Date.parse(payload.observationStart) > Date.parse(payload.observationEnd) ||
      Date.parse(payload.observationEnd) > Date.now() ||
      Date.parse(payload.reviewAt) <= Date.parse(payload.observationEnd)) {
    throw new HttpFailure(422, "invalid_maturity_window", "Assessment dates are invalid");
  }
  for (const dimension of payload.dimensions) {
    if (dimension.state !== "Unknown" && dimension.evidenceRevisionIds.length === 0) {
      throw new HttpFailure(422, "missing_maturity_support", "Known dimensions require eligible evidence");
    }
    if (dimension.state === "Unknown" && dimension.evidenceRevisionIds.length > 0) {
      throw new HttpFailure(422, "unknown_maturity_citation", "Unknown dimensions cannot cite support");
    }
  }
  if (payload.journeyStage && payload.evidenceRevisionIds.length === 0) {
    throw new HttpFailure(422, "missing_stage_support", "An evidenced journey stage is required");
  }
}
