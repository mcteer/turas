import {z} from "zod";
import {executionRecordBase} from "./record-schema";
import {executionId,executionKey,executionDate,executionRationale} from "./fields";
const ids=(max:number)=>z.array(executionId).max(max).refine(a=>new Set(a).size===a.length,"Duplicate identity");
const delivery={...executionRecordBase,
  deliverables:z.array(z.object({milestoneKey:executionKey,evidenceReferenceId:executionId}).strict()).min(1).max(50)
    .refine(a=>new Set(a.map(i=>`${i.milestoneKey}/${i.evidenceReferenceId}`)).size===a.length,"Duplicate criterion reference"),
  receiver:z.object({kind:z.enum(["internal","external"]),label:z.string().trim().min(1).max(200)}).strict(),
  acknowledgement:z.object({state:z.enum(["not_recorded","recorded"]),eventDate:executionDate.nullable(),evidenceReferenceIds:ids(20)}).strict()
    .refine(a=>a.state==="recorded"?a.eventDate!==null&&a.evidenceReferenceIds.length>0:a.eventDate===null&&!a.evidenceReferenceIds.length,"Recorded acknowledgement requires dated evidence"),
  openObligationIds:ids(50),
};
function validDelivery(r:z.infer<z.ZodObject<typeof delivery>>){
  const references=new Set(r.references.map(ref=>ref.id));
  return references.size===r.references.length&&r.deliverables.every(d=>references.has(d.evidenceReferenceId))&&r.acknowledgement.evidenceReferenceIds.every(id=>references.has(id))&&
    (r.ownerMembershipId===null)===(r.unknownOwnerReason!==null);
}
export const handoffSchema=z.object({...delivery,kind:z.literal("handoff")}).strict().refine(validDelivery,"Use exact evidence and explicit ownership");
export const closeoutSchema=z.object({...delivery,kind:z.literal("closeout"),handoffRevisionId:executionId}).strict().refine(validDelivery,"Use exact evidence and explicit ownership");
const decimal=z.string().regex(/^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
export const outcomeSchema=z.object({...executionRecordBase,kind:z.literal("outcome"),status:z.enum(["observed","not_measured","inconclusive"]),
  measure:z.string().trim().min(1).max(80).nullable(),unit:z.string().trim().min(1).max(80).nullable(),currentValue:decimal.nullable(),baselineValue:decimal.nullable(),comparisonValue:decimal.nullable(),
  baselineUnknownReason:executionRationale.nullable(),comparisonUnknownReason:executionRationale.nullable(),measurementStart:executionDate.nullable(),measurementEnd:executionDate.nullable(),limitationReason:executionRationale.nullable(),
}).strict().refine(r=>(r.ownerMembershipId===null)===(r.unknownOwnerReason!==null),"Choose an owner or explain unknown ownership")
  .refine(r=>r.status==="observed"?r.measure!==null&&r.unit!==null&&r.currentValue!==null&&r.measurementStart!==null&&r.measurementEnd!==null&&r.measurementStart<=r.measurementEnd&&r.references.length>0&&
    (r.baselineValue===null)===(r.baselineUnknownReason!==null)&&(r.comparisonValue===null)===(r.comparisonUnknownReason!==null):
    r.limitationReason!==null&&r.currentValue===null&&r.baselineValue===null&&r.comparisonValue===null&&r.measurementStart===null&&r.measurementEnd===null&&r.baselineUnknownReason===null&&r.comparisonUnknownReason===null,
    "Measured values need a window and evidence; unknown outcomes retain their limitation");
