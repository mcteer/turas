import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
export const expansionContractVersion = "expansion-v1" as const;
export const expansionId = z.uuid().toLowerCase();
export const expansionVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const expansionDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const expansionDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { Temporal.PlainDate.from(value,{overflow:"reject"});return true; } catch { return false; }
});
const text=z.string().trim().min(1).max(2000), title=z.string().trim().min(1).max(200);
export const expansionProductKey=z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/);
export const expansionProblemKey=z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/);
export const expansionSourceKeys=z.array(expansionId).max(20).refine(v=>new Set(v).size===v.length,"Duplicate source keys");
export const expansionOwnerSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("membership"),membershipId:expansionId}).strict(),
  z.object({kind:z.literal("unknown"),reason:text}).strict(),
]);
export const expansionAssertionSchema=z.object({
  purpose:z.enum(["customer_need","product_suitability","current_use","outcome","context"]),
  classification:z.enum(["accepted_fact","attributed_observation"]),text,sourceKeys:expansionSourceKeys.min(1),
}).strict();
const baseline=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("evidenced"),text,sourceKeys:expansionSourceKeys.min(1)}).strict(),
  z.object({kind:z.literal("unknown"),reason:text}).strict(),
]);
export const expansionBenefitSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("measurable_target"),rationale:text,metric:title,unit:title,target:title,baseline,validationCriterion:text}).strict(),
  z.object({kind:z.literal("qualitative_outcome"),rationale:text,validationCriterion:text}).strict(),
  z.object({kind:z.literal("unknown"),reason:text}).strict(),
]);
export const expansionCurrentUseSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("evidenced"),state:z.enum(["actual","evaluating","planned","retired","unknown"]),sourceKeys:expansionSourceKeys.min(1)}).strict(),
  z.object({kind:z.literal("unknown"),reason:text}).strict(),
]);
export const expansionPrerequisiteSchema=z.object({id:z.string().min(1).max(80),status:z.enum(["satisfied","validation_needed","blocked"]),
  rationale:text,sourceKeys:expansionSourceKeys,unknownReason:text.optional(),ownerMembershipId:expansionId.optional(),validationStep:text.optional(),
}).strict().superRefine((v,c)=>{
  if(v.status==="satisfied"&&!v.sourceKeys.length)c.addIssue({code:"custom",message:"Satisfied prerequisite needs evidence"});
  if(!v.sourceKeys.length&&!v.unknownReason)c.addIssue({code:"custom",message:"Missing evidence needs a reason"});
  if(v.status==="validation_needed"&&(!v.ownerMembershipId||!v.validationStep))c.addIssue({code:"custom",message:"Validation needs an owner and concrete step"});
});
export const expansionHypothesisSchema=z.object({contractVersion:z.literal(expansionContractVersion),title,
  productKey:expansionProductKey,productLabel:title,productVersion:z.string().trim().min(1).max(100).optional(),
  problemKey:expansionProblemKey,intent:z.enum(["new_product","usage_expansion"]),problem:text,
  customerBenefit:text,currentUse:expansionCurrentUseSchema,benefit:expansionBenefitSchema,
  assertions:z.array(expansionAssertionSchema).max(20),unknowns:z.array(z.object({text,reason:text}).strict()).max(20),
  prerequisites:z.array(expansionPrerequisiteSchema).max(10),
  constraints:z.array(z.object({text,sourceKeys:expansionSourceKeys,unknownReason:text.optional()}).strict()).max(10),
  alternatives:z.array(z.object({kind:z.enum(["retain_current_practice","other"]),title,rationale:text}).strict()).min(1).max(5),
  proposedEngagement:text,nextStep:z.object({action:text,validationCriterion:text,owner:expansionOwnerSchema}).strict(),
  nextReviewDate:expansionDate,
}).strict().superRefine((v,c)=>{
  if(!v.alternatives.some(a=>a.kind==="retain_current_practice"))c.addIssue({code:"custom",message:"Retain current practice alternative required"});
  if(new Set(v.prerequisites.map(p=>p.id)).size!==v.prerequisites.length)c.addIssue({code:"custom",message:"Duplicate prerequisite"});
  for(const constraint of v.constraints)if(!constraint.sourceKeys.length&&!constraint.unknownReason)c.addIssue({code:"custom",message:"Constraint needs evidence or unknown reason"});
});
export const expansionDisposition=z.enum(["proposed","qualified","deferred","dismissed"]);
export type ExpansionHypothesis=z.infer<typeof expansionHypothesisSchema>;
export type ExpansionDisposition=z.infer<typeof expansionDisposition>;
export type ExpansionOwner=z.infer<typeof expansionOwnerSchema>;
export function validateExpansionReviewDate(date:string,at=new Date()) {
  const today=Temporal.Instant.from(at.toISOString()).toZonedDateTimeISO("UTC").toPlainDate();
  const parsed=Temporal.PlainDate.from(expansionDate.parse(date));
  return Temporal.PlainDate.compare(parsed,today)>=0&&Temporal.PlainDate.compare(parsed,today.add({days:366}))<=0;
}
