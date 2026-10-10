import {describe,it,expect} from 'vitest';
import {learningEvaluationCases} from '../../lib/learning/evaluation-cases';
import {learningExpectedBehaviors,learningRubric} from '../../lib/learning/evaluation-rubric';
import {learningArmOutputSchema,learningCaseReviewSchema} from '../../lib/contracts/learning';
import {learningReadSchemas} from '../../lib/server/learning/model-budget';
describe('fixed independent learning evaluation inputs',()=>{
 it('has exactly eight ordered synthetic cases with review expectations outside provider inputs',()=>{
  expect(learningEvaluationCases.map(c=>c.id)).toEqual(['E01','E02','E03','E04','E05','E06','E07','E08']);
  expect(Object.keys(learningExpectedBehaviors)).toEqual(learningEvaluationCases.map(c=>c.id));
  expect(learningEvaluationCases.every(c=>Object.keys(c).sort().join(',')==='context,id,question')).toBe(true);
  expect(learningEvaluationCases[7].context.originals.map(o=>o.status)).toEqual(['superseded','accepted']);
  expect(learningRubric.minimumCandidateTotal).toBe(7);
 });
 it('bounds read keys separately from the twenty-original draft scope',()=>{
  expect(learningReadSchemas.learning_evidence.safeParse({sourceKeys:Array.from({length:10},(_,i)=>`original-${i}`)}).success).toBe(true);
  expect(learningReadSchemas.learning_evidence.safeParse({sourceKeys:Array.from({length:11},(_,i)=>`original-${i}`)}).success).toBe(false);
 });
 it('rejects malformed outputs and model- or client-supplied verdicts',()=>{
  const output={kind:'abstain',text:'Current evidence is unavailable',citationKeys:[],unknowns:['No current source']};
  expect(learningArmOutputSchema.safeParse(output).success).toBe(true);
  expect(learningArmOutputSchema.safeParse({...output,pass:true}).success).toBe(false);
  expect(learningArmOutputSchema.safeParse({...output,citationKeys:['one','one']}).success).toBe(false);
  expect(learningCaseReviewSchema.safeParse({pass:true}).success).toBe(false);
 });
});

import {learningEvaluationVerdict} from '../../lib/server/learning/evaluation-review';
describe('deterministic paired human verdict',()=>{
 const cases=()=>learningEvaluationCases.map((c,i)=>({caseId:c.id,baselineScore:i===0?7:8,candidateScore:8,safetyPassed:true,citationPassed:true,authorityPassed:true}));
 it('requires all eight complete pairs and at least one improvement',()=>{expect(learningEvaluationVerdict(cases())).toBe('passed');expect(learningEvaluationVerdict(cases().slice(1))).toBe('incomplete');expect(learningEvaluationVerdict(cases().map(c=>({...c,baselineScore:8})))).toBe('failed');});
 it('rejects regressions, low scores and unsafe or unauthorized output despite a higher average',()=>{
  for(const patch of [{candidateScore:6},{baselineScore:8,candidateScore:7},{safetyPassed:false},{citationPassed:false},{authorityPassed:false}]){const rows=cases();rows[1]={...rows[1],...patch};expect(learningEvaluationVerdict(rows)).toBe('failed');}
 });
});
