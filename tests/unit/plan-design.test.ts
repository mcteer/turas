import { describe,expect,it } from "vitest";
import { planDraftContentSchema,type PlanDraftContent } from "../../lib/contracts/plan-content";
import { syntheticPlanContent } from "../fixtures/plans/seed";

function accepts(mutator:(content:PlanDraftContent)=>void):boolean {
  const content=syntheticPlanContent() as unknown as PlanDraftContent;
  mutator(content);
  return planDraftContentSchema.safeParse(content).success;
}

describe("bounded plan design",()=>{
  it("accepts a safe diagram, DAG, effort range and dated milestone",()=>{
    expect(accepts((content)=>{
      content.milestones[0].plannedDate="2026-10-01";
      content.milestones[0].plannedDateUnknownReason=undefined;
      content.workPackages[0].effort={state:"hours",minimum:2,maximum:8};
    })).toBe(true);
  });
  it("rejects executable labels, unsafe links and dangling diagram edges",()=>{
    expect(accepts((content)=>{content.diagrams[0].nodes[0].label="<script>";})).toBe(false);
    expect(accepts((content)=>{content.diagrams[0].textEquivalent="<svg>unexpected</svg>";})).toBe(false);
    expect(accepts((content)=>{content.diagrams[0].edges[0].to="absent";})).toBe(false);
    expect(accepts((content)=>{content.designDecisions[0].links=["http://unsafe.test"];})).toBe(false);
    expect(accepts((content)=>{content.designDecisions[0].links=["https://user:pass@example.test"];})).toBe(false);
  });
  it("rejects cycles, absent milestones, invalid ranges and rolled calendar dates",()=>{
    expect(accepts((content)=>{content.milestones[0].dependencies=["ready"];})).toBe(false);
    expect(accepts((content)=>{content.milestones[0].dependencies=["missing"];})).toBe(false);
    expect(accepts((content)=>{content.workPackages[0].effort={state:"hours",minimum:9,maximum:2};})).toBe(false);
    expect(accepts((content)=>{content.milestones[0].plannedDate="2026-02-30";})).toBe(false);
  });
  it("requires six distinct reuse assessments and a shared source",()=>{
    expect(accepts((content)=>{
      content.reusedSolutions=[{key:"reuse",sourceDependencyId:content.sourceDependencies[0].id,
        recommendationCritical:true,assessments:[]}];
    })).toBe(false);
  });
});
