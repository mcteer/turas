import {z} from "zod";
import {executionRecordBase} from "./record-schema";
import {executionKey} from "./fields";
const base={...executionRecordBase,workPackageKey:executionKey,minutes:z.number().int().min(0).max(6000000)};
export const effortBudgetSchema=z.object({...base,kind:z.literal("effort_budget")}).strict()
  .refine(r=>(r.ownerMembershipId===null)===(r.unknownOwnerReason!==null),"Choose an owner or explain unknown ownership");
export const estimateSchema=z.object({...base,kind:z.literal("estimate"),asOf:z.iso.datetime(),explicitZero:z.boolean()}).strict()
  .refine(r=>(r.ownerMembershipId===null)===(r.unknownOwnerReason!==null),"Choose an owner or explain unknown ownership")
  .refine(r=>r.minutes!==0||r.explicitZero,"Assert zero remaining explicitly");
