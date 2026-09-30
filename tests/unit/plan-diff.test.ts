import { describe,expect,it } from "vitest";
import { comparePlanContent } from "../../lib/server/plans/diff";
import { syntheticPlanContent } from "../fixtures/plans/seed";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";

function fixture():PlanDraftContent {
  const content=syntheticPlanContent() as unknown as PlanDraftContent;
  content.assertions=[];
  content.sourceDependencies=[];
  return content;
}

describe("plan-diff-v1",()=>{
  it("uses stable keys and deterministic order across collection reordering",()=>{
    const base=fixture();
    const target=structuredClone(base);
    target.milestones.reverse();
    target.workPackages.reverse();
    const diff=comparePlanContent(base,target);
    expect(diff.changes).toEqual([]);
  });

  it("distinguishes a milestone replacement from a changed estimate",()=>{
    const base=fixture();
    const target=structuredClone(base);
    target.milestones=target.milestones.filter((item)=>item.key!=="ready");
    target.milestones.push({...base.milestones[1],key:"readiness_replacement",
      dependencies:["proof_done"],title:"Replacement readiness gate"});
    target.workPackages[0].effort={state:"hours",minimum:4,maximum:12};
    const diff=comparePlanContent(base,target);
    expect(diff.changes).toContainEqual({area:"milestones",key:"milestones.ready",kind:"removed",fields:[]});
    expect(diff.changes).toContainEqual({area:"milestones",key:"milestones.readiness_replacement",
      kind:"added",fields:[]});
    expect(diff.changes).toContainEqual({area:"effort",key:"workPackages.proof",
      kind:"changed",fields:["effort"]});
    expect(diff.changes.some((change)=>change.area==="milestones" &&
      change.key==="milestones.proof_done")).toBe(false);
  });

  it("reports scope, design, and evidence fields without copying prose",()=>{
    const base=fixture();
    const target=structuredClone(base);
    target.sections.find((section)=>section.key==="scope_acceptance")!.narrative="Changed scope";
    target.diagrams[0].textEquivalent="Changed flow";
    target.assertions.push({key:"new_assumption",kind:"assumption",
      text:"Sensitive synthetic assumption",sourceDependencyIds:[],decisionCritical:false,
      ownerRole:"Architect",validationAction:"Validate"});
    const diff=comparePlanContent(base,target);
    expect(diff.changes).toContainEqual({area:"scope",key:"scope_acceptance",
      kind:"changed",fields:["narrative"]});
    expect(diff.changes).toContainEqual({area:"design",key:"diagrams.web_context",
      kind:"changed",fields:["textEquivalent"]});
    expect(diff.changes).toContainEqual({area:"evidence",key:"assertions.new_assumption",
      kind:"added",fields:[]});
    expect(JSON.stringify(diff)).not.toContain("Sensitive synthetic assumption");
    expect(comparePlanContent(target,base).changes).toContainEqual({area:"evidence",
      key:"assertions.new_assumption",kind:"removed",fields:[]});
  });
});
