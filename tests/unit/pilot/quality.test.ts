import {describe,it,expect} from 'vitest';
import {verifyQualityStepAuthorization} from '../../../scripts/pilot-quality-step-authorization';
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

describe('quality step authorization',()=>{
 it('binds the 016 full-profile step supplement to its original unexpanded budget',()=>{
  const authority={id:'11111111-1111-4111-8111-111111111111',authorizationDigest:'a'.repeat(64),expiresAt:'2026-10-14T00:00:00Z'};
  const approval={contract:'pilot-quality-step-authorization-v1',feature:'016',catalog:'003',budgetId:authority.id,authorizationDigest:authority.authorizationDigest,modelStepCap:32,userInstructionReference:'Authorize 32 steps for 003',recordedAt:'2026-10-13T00:00:00Z',expiresAt:authority.expiresAt};
  const now=Date.parse('2026-10-13T01:00:00Z');
  expect(verifyQualityStepAuthorization(approval,authority,now).modelStepCap).toBe(32);
  for(const patch of [{budgetId:'22222222-2222-4222-8222-222222222222'},{authorizationDigest:'b'.repeat(64)},{expiresAt:'2026-10-15T00:00:00Z'},{recordedAt:'2026-10-13T02:00:00Z'},{catalog:'004'},{feature:'003'},{modelStepCap:33},{capMicroUsd:25000000}])expect(()=>verifyQualityStepAuthorization({...approval,...patch},authority,now)).toThrow();
  expect(()=>verifyQualityStepAuthorization(approval,authority,Date.parse(authority.expiresAt))).toThrow();
 });
});
