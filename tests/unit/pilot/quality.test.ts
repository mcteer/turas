import {describe,it,expect} from 'vitest';
import {qualityApplicability,qualityCatalog} from '../../../scripts/pilot-quality';
describe('quality applicability',()=>{
 it('requires fresh review for shared session or recovery changes',()=>{
  const entries=qualityApplicability(['lib/server/auth/sessions.ts']);
  expect(entries).toHaveLength(9);expect(entries.every(item=>item.applicability==='fresh-required'&&item.currentActualModelProof==='unverified'&&!item.historicalProofAccepted)).toBe(true);
 });
 it('requires fresh review when the actual evaluation fixtures change',()=>expect(qualityApplicability(['evals/fixtures/005-research-cases.json']).every(item=>item.applicability==='fresh-required')).toBe(true));
 it('never accepts historical captures just because behavior appears unchanged',()=>{
  const entries=qualityApplicability(['docs/pilot-operations.md']);expect(entries.every(item=>item.applicability==='historical-review-required'&&!item.historicalProofAccepted&&item.currentActualModelProof==='unverified')).toBe(true);
 });
 it('retains all governing boundaries and verifier commands',()=>{
  expect(new Set(qualityCatalog.map(item=>item.feature)).size).toBe(9);
  expect(qualityCatalog.every(item=>item.boundaries.length===3&&item.evaluation&&item.verifier)).toBe(true);
 });
 it('rejects malformed or excessive inventories',()=>{
  for(const paths of [['../secret'],['/private'],['lib/./source'],['lib/a\nsecret'],Array(10001).fill('lib/x')])expect(()=>qualityApplicability(paths)).toThrow();
 });
});
