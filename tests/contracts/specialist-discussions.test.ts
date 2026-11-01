import {describe,it,expect} from 'vitest';
import {cancelSpecialistSchema,specialistStatusSchema,specialistListSchema} from '../../lib/contracts/specialist-discussions';
const status={discussionId:'12345678-1234-4234-8234-123456789abc',assignmentId:'12345678-1234-4234-8234-123456789abd',specialistKind:'solution',state:'completed',canContinue:true,canCancel:true,reasonCode:'ready',updatedAt:'2026-11-01T00:00:00.000Z'};
describe('specialist browser boundary',()=>{
 it('withholds private native identifiers and raw source content',()=>{
  for(const key of ['workflowRunId','controlHookToken','taskId','childSessionId','reasoning','sources','error'])expect(specialistStatusSchema.safeParse({...status,[key]:'private'}).success).toBe(false);
 });
 it('rejects user supplied native cancellation targets',()=>{
  expect(cancelSpecialistSchema.safeParse({requestKey:status.discussionId,workflowRunId:'foreign'}).success).toBe(false);
 });
 it('does not offer follow-up or Stop on cancelled work',()=>{
  expect(specialistStatusSchema.safeParse({...status,state:'cancelled'}).success).toBe(false);
  expect(specialistStatusSchema.safeParse({...status,state:'cancelled',canContinue:false,canCancel:false,reasonCode:'cancelled'}).success).toBe(true);
 });
 it('bounds response size while allowing completed open discussions',()=>{
  expect(specialistListSchema.safeParse({contract:'specialist-discussions-v1',items:[status]}).success).toBe(true);
  expect(specialistListSchema.safeParse({contract:'specialist-discussions-v1',items:Array(51).fill(status)}).success).toBe(false);
 });
});
