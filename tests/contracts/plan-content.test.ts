import { describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { syntheticPlanContent,PLAN_FIXTURE_SCOPE } from "../fixtures/plans/seed";
import {
  planDraftContentSchema,buildStoredPlanContent,planSubmissionIssues,
} from "../../lib/contracts/plan-content";
import {
  planCreateSchema,planDecisionSchema,planDraftStartSchema,
  planPageQuerySchema,planRevisionEnvelopeSchema,planReviewStateSchema,
  canPlanReviewTransition,canPlanDraftingTransition,planLimits,
} from "../../lib/contracts/plans";

function content() { return syntheticPlanContent(); }

describe("delivery-plan-v1 strict boundaries",() => {
  it("builds exactly twelve sections with server-owned evidence and decision",() => {
    const parsed = planDraftContentSchema.parse(content());
    const stored = buildStoredPlanContent(parsed);
    expect(stored.sections.map((item) => item.key)).toEqual([
      "charter","current_state","scope_acceptance","options","technical_design",
      "work_plan","staffing","raid","handoff","measurement","evidence","decision",
    ]);
    expect(planDraftContentSchema.safeParse({...content(),
      sections:[...content().sections,{key:"decision",state:"content",narrative:"Accepted"}],
    }).success).toBe(false);
  });

  it("rejects unknown fields, unsafe markup, invalid links and oversized content",() => {
    expect(planDraftContentSchema.safeParse({...content(),extra:"hidden"}).success).toBe(false);
    const unsafe = content();
    unsafe.diagrams[0].nodes[0].label = "<script>alert(1)</script>";
    expect(planDraftContentSchema.safeParse(unsafe).success).toBe(false);
    const large = content();
    large.sections[0].narrative = "x".repeat(131_073);
    expect(planDraftContentSchema.safeParse(large).success).toBe(false);
  });

  it("requires factual dependencies and explicit assumption ownership",() => {
    const unsupported = content();
    unsupported.assertions[0].sourceDependencyIds = [];
    expect(planDraftContentSchema.safeParse(unsupported).success).toBe(false);
    const duplicate = content();
    duplicate.assertions.push({...duplicate.assertions[0]});
    expect(planDraftContentSchema.safeParse(duplicate).success).toBe(false);
    const incomplete = content();
    incomplete.assertions = [{key:"sponsor_unknown",kind:"assumption" as const,
      text:"A sponsor may be available.",sourceDependencyIds:[],
      decisionCritical:true} as never];
    expect(planDraftContentSchema.safeParse(incomplete).success).toBe(true);
    expect(planSubmissionIssues(incomplete)).toContainEqual({
      code:"assertion_validation_required",path:"assertions.0"});
  });

  it("rejects missing diagram endpoints and cyclic milestones",() => {
    const broken = content();
    broken.diagrams[0].edges[0].to = "missing";
    expect(planDraftContentSchema.safeParse(broken).success).toBe(false);
    const cyclic = content();
    cyclic.milestones[0].dependencies.push("ready");
    expect(planDraftContentSchema.safeParse(cyclic).success).toBe(false);
    const invalidEffort = content();
    invalidEffort.milestones[0].effort = {state:"hours",minimum:50,maximum:10} as never;
    expect(planDraftContentSchema.safeParse(invalidEffort).success).toBe(false);
    const tooManyMilestones = content();
    tooManyMilestones.milestones = Array.from({length:51},(_,index) => ({
      ...tooManyMilestones.milestones[0],key:`milestone_${index}`}));
    expect(planDraftContentSchema.safeParse(tooManyMilestones).success).toBe(false);
  });

  it("requires every reused solution fit dimension and blocks unsafe recommendation",() => {
    const missingFit = content();
    missingFit.reusedSolutions = [{key:"synthetic_practice",sourceDependencyId:randomUUID(),
      recommendationCritical:true,assessments:[]} ] as never;
    expect(planDraftContentSchema.safeParse(missingFit).success).toBe(false);
    const missingSection = content();
    missingSection.sections.pop();
    expect(planDraftContentSchema.safeParse(missingSection).success).toBe(false);
    const tooManySources = content();
    tooManySources.sourceDependencies = Array.from({length:41},() => ({
      ...tooManySources.sourceDependencies[0],id:randomUUID()}));
    expect(planDraftContentSchema.safeParse(tooManySources).success).toBe(false);
  });

  it("checks plan scope, versions, idempotency and decision attestation",() => {
    const create = {requestKey:"create_plan_001",customerId:PLAN_FIXTURE_SCOPE.customerId,
      workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
      workloadId:PLAN_FIXTURE_SCOPE.workloadId,audience:"delivery",
      ownerMembershipId:PLAN_FIXTURE_SCOPE.memberId,content:content()};
    expect(planCreateSchema.safeParse(create).success).toBe(true);
    expect(planCreateSchema.safeParse({...create,customerId:"wrong"}).success).toBe(false);
    expect(planCreateSchema.safeParse({...create,audience:"public"}).success).toBe(false);
    expect(planCreateSchema.safeParse({...create,requestKey:"short"}).success).toBe(false);
    expect(planRevisionEnvelopeSchema.safeParse({id:randomUUID(),revisionNumber:1,
      aggregateVersion:1,contentDigest:"a".repeat(64),asOf:"2026-09-29T12:00:00Z"}).success)
      .toBe(true);
    expect(planRevisionEnvelopeSchema.safeParse({id:randomUUID(),revisionNumber:0,
      aggregateVersion:1,contentDigest:"A".repeat(64),asOf:"2999-01-01T00:00:00Z"}).success)
      .toBe(false);
    const decision = {requestKey:"decide_plan_001",action:"accept",revisionId:randomUUID(),
      contentDigest:"a".repeat(64),expectedAggregateVersion:1,
      reviewPreviewId:randomUUID(),rationale:"Reviewed synthetic plan"};
    expect(planDecisionSchema.safeParse(decision).success).toBe(true);
    expect(planDecisionSchema.safeParse({...decision,deliverySuitabilityConfirmed:true}).success)
      .toBe(true);
  });

  it("bounds drafting, review states and page size",() => {
    expect(planDraftStartSchema.safeParse({requestKey:"draft_plan_001",planId:randomUUID(),
      baseRevisionId:randomUUID(),expectedAggregateVersion:1,
      instructions:"x".repeat(8_001)}).success).toBe(false);
    expect(planPageQuerySchema.parse({}).limit).toBe(20);
    expect(planPageQuerySchema.safeParse({limit:51}).success).toBe(false);
    expect(planReviewStateSchema.safeParse("accepted").success).toBe(true);
    expect(planReviewStateSchema.safeParse("published").success).toBe(false);
    expect(canPlanReviewTransition("draft","in_review")).toBe(true);
    expect(canPlanReviewTransition("accepted","draft")).toBe(false);
    expect(canPlanDraftingTransition("running","unconfirmed")).toBe(true);
    expect(canPlanDraftingTransition("cancelled","saved")).toBe(false);
    expect(planLimits.modelSteps).toBe(6);
    expect(planLimits.outputTokensPerStep).toBe(4_096);
    const incomplete = content();
    incomplete.sections[0].narrative = "";
    expect(planSubmissionIssues(incomplete).length).toBeGreaterThan(0);
  });
});
