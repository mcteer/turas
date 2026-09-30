import { planDraftContentSchema,planSubmissionIssues,
  type PlanDraftContent,type PlanIssue } from "../../contracts/plan-content";

export type PlanReadiness={ready:boolean;issues:PlanIssue[]};

/** Drafts may retain explicit unknowns; submit requires a usable review body. */
export function planSubmitReadiness(raw:unknown):PlanReadiness {
  const issues=planSubmissionIssues(raw);
  return {ready:issues.length===0,issues};
}

/** Acceptance additionally refuses unresolved consequential statements and reuse fit. */
export function planAcceptanceReadiness(raw:unknown,sourceIssues:PlanIssue[]=[]):PlanReadiness {
  const issues=[...planSubmissionIssues(raw),...sourceIssues];
  const parsed=planDraftContentSchema.safeParse(raw);
  if (!parsed.success) return {ready:false,issues};
  const content:PlanDraftContent=parsed.data;
  for (const [index,assertion] of content.assertions.entries()) {
    if (!assertion.decisionCritical) continue;
    if (assertion.kind==="assumption" || assertion.kind==="estimate" ||
        assertion.kind==="proposal") {
      issues.push({code:"critical_statement_unresolved",path:`assertions.${index}`});
    }
    if (["accepted_fact","attributed_research","shared_practice"].includes(assertion.kind)
        && assertion.sourceDependencyIds.length===0) {
      issues.push({code:"critical_source_missing",path:`assertions.${index}.sourceDependencyIds`});
    }
  }
  for (const [index,solution] of content.reusedSolutions.entries()) {
    if (!solution.recommendationCritical) continue;
    if (solution.assessments.some((assessment)=>
      assessment.state==="unknown" || assessment.state==="incompatible")) {
      issues.push({code:"critical_fit_unresolved",path:`reusedSolutions.${index}.assessments`});
    }
  }
  return {ready:issues.length===0,issues};
}
