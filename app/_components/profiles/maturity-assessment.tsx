"use client";

type Dimension = { key: string; state: string; rationale: string;
  evidenceRevisionIds: string[]; nextCapability: string };
type Assessment = { observationStart: string; observationEnd: string; assessor: string;
  rubricVersion: string; rationale: string; journeyStage?: string;
  dimensions: Dimension[]; nextCapability: string; reviewAt: string;
  evidenceRevisionIds: string[] };

const labels: Record<string, string> = {
  outcome_ownership: "Outcome ownership", delivery_collaboration: "Delivery collaboration",
  experience_adoption: "Experience adoption", operational_trust: "Operational trust",
  platform_organization: "Platform organization", innovation_ai: "Innovation and AI",
};

export function MaturityAssessment({ payload, supportStatus, scope }: {
  payload: Assessment; supportStatus?: string; scope: string;
}) {
  return <article className="profile-card profile-maturity-card">
    <div className="profile-card-head"><h3>{payload.journeyStage ?? "Journey stage Unknown"}</h3>
      <span className="profile-badge">{payload.rubricVersion}</span></div>
    <p><span className="profile-label">Scope: </span>{scope}</p>
    <p>{payload.rationale}</p>
    <p className="muted">Observed {new Date(payload.observationStart).toLocaleDateString()}–{new Date(payload.observationEnd).toLocaleDateString()} · Assessed by {payload.assessor} · Review {new Date(payload.reviewAt).toLocaleDateString()}</p>
    {supportStatus && supportStatus !== "settled" && <p className="profile-caution">Evidence {supportStatus.replaceAll("_", " ")}; reassess before relying on this assessment.</p>}
    <div className="profile-maturity-dimensions">{payload.dimensions.map((dimension) =>
      <div key={dimension.key} className="profile-maturity-dimension">
        <h4>{labels[dimension.key] ?? dimension.key}</h4><span className="profile-badge">{dimension.state}</span>
        <p>{dimension.rationale}</p>
        <p className="muted">Next capability: {dimension.nextCapability}</p>
        <p className="muted">{dimension.evidenceRevisionIds.length ?
          `Evidence: ${dimension.evidenceRevisionIds.join(", ")}` : "Evidence gap: no supporting revision"}</p>
      </div>)}</div>
    <p><strong>Next capability:</strong> {payload.nextCapability}</p>
    {payload.evidenceRevisionIds.length > 0 && <p className="muted">Stage support: {payload.evidenceRevisionIds.join(", ")}</p>}
  </article>;
}
