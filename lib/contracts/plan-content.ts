import { z } from "zod";
import { citationLocatorSchema } from "./retrieval";

export const editablePlanSectionKeys = ["charter","current_state","scope_acceptance",
  "options","technical_design","work_plan","staffing","raid","handoff",
  "measurement"] as const;
export const planSectionKeys = [...editablePlanSectionKeys,"evidence","decision"] as const;
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const narrative = z.string().max(4_000);
const requiredNarrative = z.string().trim().min(1).max(4_000);
const diagramText = requiredNarrative.refine((value) =>
  !/[<>]/.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
"Plain-text diagram description required");
const label = z.string().trim().min(1).max(160).refine(
  (value) => !/[<>]/.test(value) && !/[\u0000-\u001f]/.test(value),"Plain-text label required");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.uuid();
const url = z.url().max(2_048).refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
    (!parsed.port || parsed.port === "443");
},"Safe HTTPS URL required");

const sectionSchema = z.object({
  key:z.enum(editablePlanSectionKeys),
  state:z.enum(["content","unknown","not_applicable"]),
  narrative:narrative.optional(),
  ownerRole:requiredNarrative.optional(),
  discoveryAction:requiredNarrative.optional(),
  reason:requiredNarrative.optional(),
}).strict();

const assertionSchema = z.object({
  key,text:requiredNarrative,
  kind:z.enum(["accepted_fact","attributed_research","shared_practice",
    "proposal","estimate","assumption"]),
  sourceDependencyIds:z.array(id).max(10),
  ownerRole:requiredNarrative.optional(),
  validationAction:requiredNarrative.optional(),
  decisionCritical:z.boolean(),
}).strict().superRefine((value,ctx) => {
  const factual = ["accepted_fact","attributed_research","shared_practice"]
    .includes(value.kind);
  if (factual && value.sourceDependencyIds.length === 0) {
    ctx.addIssue({code:"custom",path:["sourceDependencyIds"],message:"Factual support required"});
  }
});

const sourceDependencySchema = z.object({
  id,
  kind:z.enum(["accepted_profile","approved_excerpt","verified_research",
    "shared_knowledge"]),
  sourceRevisionId:id,
  generation:z.number().int().positive().safe(),
  contentDigest:digest,
  locator:citationLocatorSchema,
  citationId:id.optional(),
}).strict();

export const planEvidenceSummarySchema = z.object({
  assertions:z.array(assertionSchema).max(100),
  sourceDependencies:z.array(sourceDependencySchema).max(40),
}).strict();

const diagramNodeSchema = z.object({key,label}).strict();
const diagramEdgeSchema = z.object({key,from:key,to:key,label}).strict();
const diagramSchema = z.object({
  key,
  kind:z.enum(["context","container"]),
  textEquivalent:diagramText,
  nodes:z.array(diagramNodeSchema).min(1).max(40),
  edges:z.array(diagramEdgeSchema).max(80),
}).strict().superRefine((diagram,ctx) => {
  const nodes = new Set(diagram.nodes.map((node) => node.key));
  if (nodes.size !== diagram.nodes.length) ctx.addIssue({code:"custom",path:["nodes"],
    message:"Duplicate node key"});
  const edges = new Set(diagram.edges.map((edge) => edge.key));
  if (edges.size !== diagram.edges.length) ctx.addIssue({code:"custom",path:["edges"],
    message:"Duplicate edge key"});
  for (const [index,edge] of diagram.edges.entries()) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      ctx.addIssue({code:"custom",path:["edges",index],message:"Unknown edge endpoint"});
    }
  }
});

const designDecisionSchema = z.object({
  key,title:label,chosen:requiredNarrative,alternatives:requiredNarrative,
  rationale:requiredNarrative,testing:requiredNarrative,rollback:requiredNarrative,
  ownerRole:requiredNarrative,
  links:z.array(z.union([url,z.object({artifactVersionId:id}).strict()])).max(10).optional(),
}).strict();

const effortSchema = z.discriminatedUnion("state",[
  z.object({state:z.literal("unknown"),reason:requiredNarrative}).strict(),
  z.object({state:z.literal("hours"),minimum:z.number().min(0).max(100_000),
    maximum:z.number().min(0).max(100_000)}).strict().refine(
      (value) => value.minimum <= value.maximum,"Minimum exceeds maximum"),
]);
const track = z.enum(["value","production","both"]);
const workPackageSchema = z.object({
  key,title:label,track,ownerRole:requiredNarrative,exitEvidence:requiredNarrative,
  effort:effortSchema,
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value;
},"Valid calendar date required");
const milestoneSchema = z.object({
  key,title:label,track,ownerRole:requiredNarrative,exitEvidence:requiredNarrative,
  customerValidation:requiredNarrative,plannedDate:date.nullable(),
  plannedDateUnknownReason:requiredNarrative.optional(),
  dependencies:z.array(key).max(50),effort:effortSchema,
}).strict().superRefine((value,ctx) => {
  if (value.plannedDate === null && !value.plannedDateUnknownReason) {
    ctx.addIssue({code:"custom",path:["plannedDateUnknownReason"],
      message:"Unknown date reason required"});
  }
});
const fitDimensions = ["technology","security","delivery","process","adoption",
  "effort_capacity"] as const;
const fitAssessmentSchema = z.object({
  dimension:z.enum(fitDimensions),
  state:z.enum(["compatible","adaptation_required","unknown","incompatible"]),
  rationale:requiredNarrative,validationAction:requiredNarrative,
}).strict();
const reusedSolutionSchema = z.object({
  key,sourceDependencyId:id,recommendationCritical:z.boolean(),
  assessments:z.array(fitAssessmentSchema).length(6).refine((items) =>
    new Set(items.map((item) => item.dimension)).size === 6,"Six fit dimensions required"),
}).strict();

function uniqueKeys(items: readonly {key:string}[],ctx:z.RefinementCtx,path:string) {
  if (new Set(items.map((item) => item.key)).size !== items.length) {
    ctx.addIssue({code:"custom",path:[path],message:"Duplicate stable key"});
  }
}

export const planDraftContentSchema = z.object({
  title:label,
  asOf:z.iso.datetime({offset:true}).refine((value) =>
    Date.parse(value) <= Date.now(),"asOf cannot be future"),
  startDate:date.nullable().optional(),
  startDateUnknownReason:requiredNarrative.optional(),
  targetDate:date.nullable().optional(),
  targetDateUnknownReason:requiredNarrative.optional(),
  sections:z.array(sectionSchema).length(10),
  assertions:z.array(assertionSchema).max(100),
  sourceDependencies:z.array(sourceDependencySchema).max(40),
  diagrams:z.array(diagramSchema).max(3),
  designDecisions:z.array(designDecisionSchema).max(20),
  workPackages:z.array(workPackageSchema).max(50),
  milestones:z.array(milestoneSchema).max(50),
  reusedSolutions:z.array(reusedSolutionSchema).max(10),
}).strict().superRefine((value,ctx) => {
  const sectionKeys = value.sections.map((item) => item.key);
  if (new Set(sectionKeys).size !== 10 ||
      editablePlanSectionKeys.some((item) => !sectionKeys.includes(item))) {
    ctx.addIssue({code:"custom",path:["sections"],message:"Ten editable sections required"});
  }
  for (const collection of ["assertions","diagrams","designDecisions",
    "workPackages","milestones","reusedSolutions"] as const) {
    uniqueKeys(value[collection],ctx,collection);
  }
  if (new Set(value.sourceDependencies.map((item) => item.id)).size !==
      value.sourceDependencies.length) {
    ctx.addIssue({code:"custom",path:["sourceDependencies"],
      message:"Duplicate source dependency ID"});
  }
  const sources = new Set(value.sourceDependencies.map((item) => item.id));
  const sourceKinds = new Map(value.sourceDependencies.map((item) => [item.id,item.kind]));
  for (const [index,assertion] of value.assertions.entries()) {
    if (new Set(assertion.sourceDependencyIds).size !== assertion.sourceDependencyIds.length) {
      ctx.addIssue({code:"custom",path:["assertions",index,"sourceDependencyIds"],
        message:"Duplicate source dependency"});
    }
    if (assertion.sourceDependencyIds.some((item) => !sources.has(item))) {
      ctx.addIssue({code:"custom",path:["assertions",index,"sourceDependencyIds"],
        message:"Unknown source dependency"});
    }
    const allowed = assertion.kind === "accepted_fact" ?
      ["accepted_profile","approved_excerpt"] :
      assertion.kind === "attributed_research" ? ["verified_research"] :
      assertion.kind === "shared_practice" ? ["shared_knowledge"]:null;
    if (allowed && assertion.sourceDependencyIds.some((item)=>
      sourceKinds.has(item) && !allowed.includes(sourceKinds.get(item)!))) {
      ctx.addIssue({code:"custom",path:["assertions",index,"sourceDependencyIds"],
        message:"Source kind does not match factual assertion"});
    }
  }
  for (const [index,solution] of value.reusedSolutions.entries()) {
    if (!sources.has(solution.sourceDependencyId)) {
      ctx.addIssue({code:"custom",path:["reusedSolutions",index,"sourceDependencyId"],
        message:"Unknown shared source dependency"});
    }
    if (value.sourceDependencies.find((source) => source.id === solution.sourceDependencyId)
        ?.kind !== "shared_knowledge") {
      ctx.addIssue({code:"custom",path:["reusedSolutions",index,"sourceDependencyId"],
        message:"Shared practice source required"});
    }
  }
  const milestones = new Map(value.milestones.map((item) => [item.key,item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(milestoneKey:string):boolean {
    if (visiting.has(milestoneKey)) return false;
    if (visited.has(milestoneKey)) return true;
    const item = milestones.get(milestoneKey);
    if (!item) return false;
    visiting.add(milestoneKey);
    const okay = item.dependencies.every((dependency) => visit(dependency));
    visiting.delete(milestoneKey);
    visited.add(milestoneKey);
    return okay;
  }
  for (const [index,item] of value.milestones.entries()) {
    if (!visit(item.key)) ctx.addIssue({code:"custom",path:["milestones",index,"dependencies"],
      message:"Milestone dependencies must be acyclic and present"});
  }
  if (value.startDate && value.targetDate && value.startDate > value.targetDate) {
    ctx.addIssue({code:"custom",path:["targetDate"],message:"Target precedes start"});
  }
  if (value.startDate === null && !value.startDateUnknownReason) {
    ctx.addIssue({code:"custom",path:["startDateUnknownReason"],
      message:"Unknown start date reason required"});
  }
  if (value.targetDate === null && !value.targetDateUnknownReason) {
    ctx.addIssue({code:"custom",path:["targetDateUnknownReason"],
      message:"Unknown target date reason required"});
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 131_072) {
    ctx.addIssue({code:"custom",path:[],message:"Plan content exceeds 131072 bytes"});
  }
});

export type PlanDraftContent = z.infer<typeof planDraftContentSchema>;
export type PlanIssue = {code:string;path:string};

export function buildStoredPlanContent(content:PlanDraftContent) {
  const sections = editablePlanSectionKeys.map((key) =>
    content.sections.find((section) => section.key === key)!);
  return {...content,sourceDependencies:content.sourceDependencies.map(({citationId:_,...source}) => source),
    sections:[...sections,
    {key:"evidence" as const,state:"server_derived" as const},
    {key:"decision" as const,state:"server_derived" as const}]};
}

export function planSubmissionIssues(raw:unknown):PlanIssue[] {
  const result = planDraftContentSchema.safeParse(raw);
  if (!result.success) return result.error.issues.map((issue) => ({
    code:"invalid_content",path:issue.path.join(".")}));
  const content = result.data;
  const issues:PlanIssue[] = [];
  for (const [index,section] of content.sections.entries()) {
    if (section.state === "content" && !section.narrative?.trim()) {
      issues.push({code:"section_content_required",path:`sections.${index}.narrative`});
    }
    if (section.state === "unknown" && (!section.ownerRole || !section.discoveryAction)) {
      issues.push({code:"discovery_owner_required",path:`sections.${index}`});
    }
    if (section.state === "not_applicable" && !section.reason) {
      issues.push({code:"not_applicable_reason_required",path:`sections.${index}.reason`});
    }
  }
  for (const [index,assertion] of content.assertions.entries()) {
    if (["assumption","estimate"].includes(assertion.kind) &&
        (!assertion.ownerRole || !assertion.validationAction)) {
      issues.push({code:"assertion_validation_required",path:`assertions.${index}`});
    }
  }
  if (content.diagrams.length === 0) issues.push({code:"diagram_required",path:"diagrams"});
  if (content.designDecisions.length === 0) {
    issues.push({code:"design_decision_required",path:"designDecisions"});
  }
  if (content.milestones.length === 0) issues.push({code:"milestone_required",path:"milestones"});
  for (const track of ["value","production"] as const) {
    if (!content.workPackages.some((item) => item.track === track || item.track === "both")) {
      issues.push({code:"track_required",path:"workPackages"});
    }
  }
  return issues;
}
