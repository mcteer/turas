import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { PROFILE_FIXTURE_IDS } from "../profiles";

/** Synthetic identifiers and payloads; this file never writes a database. */
export const PLAN_FIXTURE_SCOPE = {
  workspaceId: DEMO_IDS.workspace,
  customerId: DEMO_IDS.sharedCustomer,
  deniedCustomerId: DEMO_IDS.deniedCustomer,
  workloadId: PROFILE_FIXTURE_IDS.cedarWorkloadWeb,
  otherWorkloadId: PROFILE_FIXTURE_IDS.cedarWorkloadCommerce,
  administratorId: DEMO_IDS.mcteerMembership,
  memberId: DEMO_IDS.panelMembership,
  partnerId: DEMO_IDS.partnerMembership,
} as const;

export function syntheticSource(state: "eligible" | "withdrawn" = "eligible") {
  return {
    reference: {id: randomUUID(),kind: "accepted_profile" as const,
      sourceRevisionId: randomUUID(),generation: 1,
      contentDigest: "a".repeat(64),
      locator: {kind:"profile_field" as const,fieldPath:"usageDescription"}},
    quality: { rubricVersion: "evidence-quality-v1",score: 85 },
    state,
  };
}

export function syntheticPlanContent() {
  const source = syntheticSource();
  const sections = [
    ["charter","Improve the synthetic public web workflow and name a delivery owner."],
    ["current_state","The current deployment is subject to evidence review."],
    ["scope_acceptance","Validate a measurable public workflow before production use."],
    ["options","Compare a limited proof with a direct production migration."],
    ["technical_design","Use a bounded web service and reversible routing change."],
    ["work_plan","Run value proof and production readiness as separate tracks."],
    ["staffing","An application engineer and customer reviewer are proposed roles."],
    ["raid","Deployment access is a dependency to confirm during discovery."],
    ["handoff","Hand off the reviewed design and rollback procedure."],
    ["measurement","Measure a synthetic successful request and error rate."],
  ].map(([key,narrative]) => ({key,state:"content" as const,narrative}));
  return {
    title: "Synthetic Cedar public web plan",
    asOf: "2026-09-29T12:00:00Z",
    sections,
    assertions: [{key:"current_workflow",kind:"accepted_fact" as const,
      text:"The reviewed synthetic public web workload exists.",
      sourceDependencyIds:[source.reference.id],decisionCritical:false}],
    sourceDependencies: [source.reference],
    diagrams: [{key:"web_context",kind:"context" as const,
      textEquivalent:"Customer browser sends requests to the web service.",
      nodes:[{key:"browser",label:"Browser"},{key:"web",label:"Web service"}],
      edges:[{key:"request",from:"browser",to:"web",label:"HTTPS request"}]}],
    designDecisions: [{key:"reversible_route",title:"Use reversible routing",
      chosen:"Use a staged route",alternatives:"Direct cutover",
      rationale:"The staged route permits rollback.",
      testing:"Verify request and error signals",rollback:"Restore the previous route",
      ownerRole:"Application engineer"}],
    workPackages: [{key:"proof",title:"Validate workflow",track:"value" as const,
      ownerRole:"Application engineer",exitEvidence:"Reviewed request result",
      effort:{state:"unknown" as const,reason:"Estimate after discovery"}},
      {key:"readiness",title:"Prepare rollback",track:"production" as const,
      ownerRole:"Application engineer",exitEvidence:"Reviewed rollback rehearsal",
      effort:{state:"unknown" as const,reason:"Estimate after discovery"}}],
    milestones: [{key:"proof_done",title:"Proof reviewed",track:"value" as const,
      ownerRole:"Customer reviewer",exitEvidence:"Signed internal proof checklist",
      customerValidation:"Customer reviewer inspects the proof",
      plannedDate:null,plannedDateUnknownReason:"Schedule after discovery",
      dependencies:[] as string[],effort:{state:"unknown" as const,reason:"Estimate after discovery"}},
      {key:"ready",title:"Production readiness reviewed",track:"production" as const,
      ownerRole:"Application engineer",exitEvidence:"Rollback rehearsal record",
      customerValidation:"Customer reviewer inspects the readiness evidence",
      plannedDate:null,plannedDateUnknownReason:"Schedule after discovery",
      dependencies:["proof_done"],
      effort:{state:"unknown" as const,reason:"Estimate after discovery"}}],
    reusedSolutions: [],
  };
}
