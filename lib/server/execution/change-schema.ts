import {z} from "zod";
import {executionId,executionDate,executionRationale,executionKey,executionVersion} from "./fields";
import {executionRecordBase} from "./record-schema";
const ownership=(r:{ownerMembershipId:string|null;unknownOwnerReason:string|null})=>(r.ownerMembershipId===null)===(r.unknownOwnerReason!==null);
export const raidRecordSchema=z.object({...executionRecordBase,kind:z.literal("raid"),raidType:z.enum(["risk","assumption","issue","dependency"]),
  status:z.enum(["open","monitoring","resolved","accepted_exception"]),severity:z.enum(["low","medium","high","critical"]),impact:executionRationale,
  reviewDate:executionDate.nullable(),unknownDateReason:executionRationale.nullable(),acceptedExceptionRationale:executionRationale.nullable()}).strict()
  .refine(ownership,"Choose an owner or explain unknown ownership")
  .refine(r=>(r.reviewDate===null)===(r.unknownDateReason!==null),"Explain an unknown review date")
  .refine(r=>r.status!=="resolved"||r.references.length>0,"Closure needs reviewed evidence")
  .refine(r=>(r.status==="accepted_exception")===(r.acceptedExceptionRationale!==null),"Record a separate accepted-exception rationale");
export const decisionRecordSchema=z.object({...executionRecordBase,kind:z.literal("decision"),decisionDate:executionDate,
  decider:z.string().trim().min(1).max(200),rationale:executionRationale,
  supersededDecisionIds:z.array(executionId).min(1).max(20).refine(a=>new Set(a).size===a.length).optional()}).strict().refine(ownership);
export const scopeChangeSchema=z.object({...executionRecordBase,kind:z.literal("scope_change"),state:z.enum(["proposed","approved_for_planning","rejected","implemented","withdrawn"]),
  oldBaselineId:executionId,replacementBaselineId:executionId.nullable(),impact:executionRationale}).strict().refine(ownership)
  .refine(r=>r.state!=="implemented"||r.replacementBaselineId!==null,"Implementation needs an exact replacement baseline")
  .refine(r=>r.replacementBaselineId!==r.oldBaselineId,"Replacement must differ from the original baseline");
export const reconciliationItemSchema=z.object({kind:z.enum(["work_package","milestone"]),oldKey:executionKey.nullable(),newKey:executionKey.nullable(),
  disposition:z.enum(["mapped","retired","added"])}).strict();
export const reconciliationPayloadSchema=z.object({oldBaselineId:executionId,newBaselineId:executionId,items:z.array(reconciliationItemSchema).max(200)}).strict()
  .refine(r=>r.oldBaselineId!==r.newBaselineId);
export const reconciliationExpectedSchema=z.object({execution:executionVersion,oldBaseline:executionVersion,newBaseline:executionVersion,plan:executionVersion}).strict();
export type ReconciliationItem=z.infer<typeof reconciliationItemSchema>;
