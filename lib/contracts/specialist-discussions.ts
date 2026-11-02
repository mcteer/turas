import {z} from 'zod';

export const specialistKindSchema=z.enum(['customer-update','solution','best-practices']);
export const specialistStateSchema=z.enum(['admitted','working','waiting_input','stopping','completed','failed','cancelled','unavailable']);
export const specialistReasonSchema=z.enum(['pending','running','question','ready','stopping','completed','failed','cancelled','expired','context_changed','authority_unavailable','budget_unavailable','result_unavailable']);
export const specialistStatusSchema=z.object({
 discussionId:z.uuid(),specialistKind:specialistKindSchema,assignmentId:z.uuid(),
 state:specialistStateSchema,canContinue:z.boolean(),canCancel:z.boolean(),
 reasonCode:specialistReasonSchema,updatedAt:z.iso.datetime(),
}).strict().superRefine((item,ctx)=>{
 if(item.canContinue&&item.state!=='completed')ctx.addIssue({code:'custom',message:'Only completed assignments can accept a refinement'});
 if(item.canCancel&&['failed','cancelled','unavailable','stopping'].includes(item.state))ctx.addIssue({code:'custom',message:'Terminal or stopping work cannot offer Stop'});
});
export const specialistListSchema=z.object({contract:z.literal('specialist-discussions-v1'),items:z.array(specialistStatusSchema).max(50),nextCursor:z.string().min(1).max(500).optional()}).strict();
export const specialistListQuerySchema=z.object({cursor:z.string().min(1).max(500).optional()}).strict();
export const cancelSpecialistSchema=z.object({requestKey:z.uuid()}).strict();
export type SpecialistStatus=z.infer<typeof specialistStatusSchema>;
export type SpecialistKind=z.infer<typeof specialistKindSchema>;
