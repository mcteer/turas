import {describe,expect,it} from 'vitest';
import {currentFactEligible,retrievalQuality,publicEvidenceQuality} from '../../lib/server/retrieval/context';
import {mcpEvidenceSchema,mcpKnowledgeSchema} from '../../lib/contracts/mcp';
import {rateFreshness} from '../../lib/server/research/specialists/solution-research/freshness';
import {combineSharedEvidenceQuality} from '../../lib/server/knowledge/quality';

const at=new Date('2026-11-13T00:00:00.000Z');
const day=86400000;
const input={rubricVersion:'evidence-quality-v1',R:4,D:4,C:4,
 reliabilityRationale:'Primary exact source',directnessRationale:'Exact support',
 corroborationRationale:'Independent support',informationType:'architecture',dateBasis:'observation'};
const quality=(age:number)=>retrievalQuality(input,{observationAt:new Date(at.getTime()-age)},at);

describe('seven-day guidance refresh',()=>{
 it('keeps the quality rubric while requiring new support after seven days',()=>{
  expect(quality(8*day).freshness).toBe('Recent');
  expect(currentFactEligible(quality(7*day),false,at)).toBe(true);
  expect(currentFactEligible(quality(7*day+1),false,at)).toBe(false);
  expect(currentFactEligible(quality(8*day),false,at)).toBe(false);
 });
 it('does not refresh the age of a source by reading it again',()=>{
  const later=new Date(at.getTime()+2*day);
  const read=retrievalQuality(input,{observationAt:new Date(at.getTime()-6*day)},later);
  expect(currentFactEligible(read,false,later)).toBe(false);
 });
 it('keeps unknown, future and overdue evidence out of current guidance',()=>{
  expect(currentFactEligible(retrievalQuality(input,{},at),false,at)).toBe(false);
  expect(currentFactEligible(quality(-day),false,at)).toBe(false);
  const overdue=retrievalQuality(input,{observationAt:at,reviewAt:new Date(at.getTime()-1)},at);
  expect(currentFactEligible(overdue,false,at)).toBe(false);
 });
 it('inherits the oldest supporting guidance deadline for a shared practice',()=>{
  expect(currentFactEligible(combineSharedEvidenceQuality([quality(day),quality(8*day)],at),false,at)).toBe(false);
  expect(currentFactEligible(combineSharedEvidenceQuality([quality(day),quality(2*day)],at),false,at)).toBe(true);
 });
 it('keeps private guidance deadlines out of public shared quality and the MCP v1 shape',()=>{
  const shared=publicEvidenceQuality(combineSharedEvidenceQuality([quality(day)],at));
  expect(shared).not.toHaveProperty('guidanceRefreshAfter');
  const {rationale,...mcpQuality}=shared;
  expect(mcpEvidenceSchema.shape.quality.safeParse(mcpQuality).success).toBe(true);
  expect(mcpKnowledgeSchema.shape.quality.safeParse(mcpQuality).success).toBe(true);
 });
 it('requests research after seven days even when the information-type rating is recent',()=>{
  expect(rateFreshness({informationType:'architecture',evidenceDate:'2026-11-06'},at).action).toBe('use_with_scope');
  expect(rateFreshness({informationType:'architecture',evidenceDate:'2026-11-05',checkedAt:at.toISOString()},at))
   .toMatchObject({rating:'recent',ageDays:8,action:'verify_before_current_decision'});
  expect(rateFreshness({informationType:'architecture',evidenceDate:'2026-11-06'},new Date('2026-11-13T12:00:00Z')))
   .toMatchObject({ageDays:7,action:'verify_before_current_decision'});
 });
});
