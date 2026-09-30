import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { canonicalPlanJson } from "../../contracts/plans";
import type { PlanDraftContent } from "../../contracts/plan-content";
import { withTransaction } from "../db/client";
import type { PlanActor } from "./policy";
import { readPlan } from "./read";
import { currentPlanSourceDigest } from "./sources";

export type PlanDiffChange={area:"scope"|"design"|"work"|"milestones"|
  "effort"|"evidence";key:string;kind:"added"|"removed"|"changed";fields:string[]};
export type PlanDiff={contractVersion:"plan-diff-v1";changes:PlanDiffChange[]};

function different(left:unknown,right:unknown):boolean {
  return canonicalPlanJson(left)!==canonicalPlanJson(right);
}

function changedFields(left:Record<string,unknown>,right:Record<string,unknown>,
  excluded:string[]=[]):string[] {
  return [...new Set([...Object.keys(left),...Object.keys(right)])]
    .filter((field)=>!excluded.includes(field) && different(left[field],right[field])).sort();
}

function compareCollection<T extends {key:string}>(changes:PlanDiffChange[],
  area:PlanDiffChange["area"],prefix:string,left:readonly T[],right:readonly T[],
  excluded:string[]=[]):void {
  const before=new Map(left.map((item)=>[item.key,item]));
  const after=new Map(right.map((item)=>[item.key,item]));
  for (const key of new Set([...before.keys(),...after.keys()])) {
    const from=before.get(key),to=after.get(key);
    const path=prefix ? `${prefix}.${key}`:key;
    if (!from) changes.push({area,key:path,kind:"added",fields:[]});
    else if (!to) changes.push({area,key:path,kind:"removed",fields:[]});
    else {
      const fields=changedFields(from as unknown as Record<string,unknown>,
        to as unknown as Record<string,unknown>,["key",...excluded]);
      if (fields.length) changes.push({area,key:path,kind:"changed",fields});
    }
  }
}

/** Stable-key semantic summary. Content values and private lineage never enter this DTO. */
export function comparePlanContent(base:PlanDraftContent,target:PlanDraftContent):PlanDiff {
  const changes:PlanDiffChange[]=[];
  const scopeFields=changedFields(base as unknown as Record<string,unknown>,
    target as unknown as Record<string,unknown>,[
      "sections","assertions","sourceDependencies","diagrams","designDecisions",
      "workPackages","milestones","reusedSolutions"]);
  for (const field of scopeFields) changes.push({area:"scope",key:field,
    kind:"changed",fields:[field]});
  const sectionAreas:Record<string,PlanDiffChange["area"]>={
    charter:"scope",current_state:"scope",scope_acceptance:"scope",options:"design",
    technical_design:"design",work_plan:"work",staffing:"work",raid:"work",
    handoff:"work",measurement:"work",
  };
  for (const [sectionKey,area] of Object.entries(sectionAreas)) {
    compareCollection(changes,area,"",base.sections.filter((item)=>item.key===sectionKey),
      target.sections.filter((item)=>item.key===sectionKey));
  }
  compareCollection(changes,"design","diagrams",base.diagrams,target.diagrams);
  compareCollection(changes,"design","designDecisions",base.designDecisions,target.designDecisions);
  compareCollection(changes,"work","workPackages",base.workPackages,target.workPackages,
    ["effort"]);
  compareCollection(changes,"milestones","milestones",base.milestones,target.milestones,
    ["effort"]);
  for (const [prefix,from,to] of [
    ["workPackages",base.workPackages,target.workPackages],
    ["milestones",base.milestones,target.milestones],
  ] as const) {
    const prior=new Map(from.map((item)=>[item.key,item.effort]));
    for (const item of to) {
      const effort=prior.get(item.key);
      if (effort && different(effort,item.effort)) changes.push({area:"effort",
        key:`${prefix}.${item.key}`,kind:"changed",fields:["effort"]});
    }
  }
  compareCollection(changes,"evidence","assertions",base.assertions,target.assertions);
  compareCollection(changes,"evidence","sourceDependencies",
    base.sourceDependencies.map((item)=>({...item,key:item.id})),
    target.sourceDependencies.map((item)=>({...item,key:item.id})),["id"]);
  compareCollection(changes,"design","reusedSolutions",base.reusedSolutions,
    target.reusedSolutions);
  changes.sort((a,b)=>a.area.localeCompare(b.area) || a.key.localeCompare(b.key) ||
    a.kind.localeCompare(b.kind));
  return {contractVersion:"plan-diff-v1",changes};
}

/** Read both sides under the same current-authority and original-source fence. */
export async function readPlanDiff(actor:PlanActor,planId:string,baseRevisionId:string,
  targetRevisionId:string,existingClient?:PoolClient):Promise<PlanDiff & {
    planId:string;baseRevisionId:string;targetRevisionId:string;
    baseDigest:string;targetDigest:string}> {
  const run=async(client:PoolClient)=>{
    const base=await readPlan(actor,planId,baseRevisionId,client);
    const target=await readPlan(actor,planId,targetRevisionId,client);
    if (!base.content || !target.content ||
        !["readable","historical_warning"].includes(base.contentAvailability) ||
        !["readable","historical_warning"].includes(target.contentAvailability)) {
      throw new HttpFailure(409,"plan_unavailable","Plan comparison unavailable");
    }
    // Recheck after both payloads have been read and hold source headers to commit.
    await currentPlanSourceDigest(client,actor,baseRevisionId,base.customerId,
      base.workloadId,base.audience,true);
    await currentPlanSourceDigest(client,actor,targetRevisionId,target.customerId,
      target.workloadId,target.audience,true);
    const baseContent=base.content as PlanDraftContent;
    const targetContent=target.content as PlanDraftContent;
    return {...comparePlanContent(baseContent,targetContent),planId,baseRevisionId,
      targetRevisionId,baseDigest:base.contentDigest,targetDigest:target.contentDigest};
  };
  return existingClient ? run(existingClient):withTransaction(run);
}
