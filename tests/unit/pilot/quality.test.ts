import {describe,it,expect} from 'vitest';
import {mkdir,mkdtemp,rm,writeFile,readFile,access} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dataset003 from '../../../evals/fixtures/003-context-governance.json';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
import {writeEvidence} from '../../../scripts/pilot-evidence';
import {verifyQualityStepAuthorization} from '../../../scripts/pilot-quality-step-authorization';
import {qualityApplicability,qualityCatalog} from '../../../scripts/pilot-quality';
import {prepareQualityWorkspace,verifyQualityWorkspace} from '../../../scripts/pilot-quality-workspace';
describe('quality applicability',()=>{
 it('requires fresh review for shared session or recovery changes',()=>{
  const entries=qualityApplicability(['lib/server/auth/sessions.ts']);
  expect(entries).toHaveLength(9);expect(entries.every(item=>item.applicability==='fresh-required'&&item.currentActualModelProof==='unverified'&&!item.historicalProofAccepted)).toBe(true);
 });
 it('requires fresh review when the actual evaluation fixtures change',()=>expect(qualityApplicability(['evals/fixtures/005-research-cases.json']).every(item=>item.applicability==='fresh-required')).toBe(true));
 it('never accepts historical captures just because behavior appears unchanged',()=>{
  const entries=qualityApplicability(['docs/pilot-operations.md']);expect(entries.every(item=>item.applicability==='historical-review-required'&&!item.historicalProofAccepted&&item.currentActualModelProof==='unverified')).toBe(true);
 });
 it('retains all governing boundaries and verifier commands',async()=>{
  expect(new Set(qualityCatalog.map(item=>item.feature)).size).toBe(9);
  expect(qualityCatalog.every(item=>item.boundaries.length===3&&item.evaluation&&item.verifier)).toBe(true);
  await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
  const root=await mkdtemp(resolve('local-artifacts/016/review-workspace-test-'));
  try{
   // The complete catalog runs unit files inside an ignored owned app copy.
   // The controller always snapshots the canonical Git source, not that copy.
   const sourceRoot=(await promisify(execFile)('git',['rev-parse','--show-toplevel'])).stdout.trim();
   const workspace=join(root,'source');await prepareQualityWorkspace(sourceRoot,workspace);
   await expect(access(join(workspace,'.env.local'))).rejects.toThrow();
   await expect(access(join(workspace,'.eve'))).rejects.toThrow();
   expect(await readFile(join(workspace,'next.config.ts'),'utf8')).toBe(await readFile(join(sourceRoot,'next.config.ts'),'utf8'));
   await writeFile(join(workspace,'next.config.ts'),'// changed review source\n');
   await expect(verifyQualityWorkspace(sourceRoot,workspace)).rejects.toThrow('Review workspace source differs');
  }finally{await rm(root,{recursive:true,force:true});}
 },120000);
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

it('verifies expanded profile review only under the exact approved pilot runtime',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
 const root=await mkdtemp(resolve('local-artifacts/016/step-review-test-'));
 try{
  const id=randomUUID(),expiresAt=new Date(Date.now()+60000).toISOString(),authorizationDigest='a'.repeat(64),source={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)};
  const ledger=await QualityBudgetLedger.create(join(root,'budget'),{contract:'pilot-quality-budget-v1',id,authorizationDigest,sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest,capMicroUsd:25000000,contextCreditCap:4,modelId:'spacexai/grok-4.7',expiresAt});
  const attemptId=await ledger.beginAttempt(source);
  const stepAuthorization={contract:'pilot-quality-step-authorization-v1',feature:'016',catalog:'003',budgetId:id,authorizationDigest,modelStepCap:32,userInstructionReference:'Synthetic operator approval fixture',recordedAt:new Date().toISOString(),expiresAt};
  await writeEvidence(root,'runtime.json',{contract:'pilot-quality-runtime-v1',id,attemptId,sourceRoot:process.cwd(),ledgerRoot:ledger.root,...source,authorizationDigest,capMicroUsd:25000000,contextCreditCap:4,expiresAt,stepAuthorization});
  const results=dataset003.cases.flatMap(item=>[1,2].map(run=>({caseId:item.id,run,modelSteps:2,semanticScore:1,rationale:'Synthetic verifier test only',response:'Synthetic verifier test only',hardGates:{noSecretExposure:true}})));
  const review=join(root,'review.json');await writeFile(review,JSON.stringify({feature:'003',modelStepCap:32,datasetVersion:dataset003.version,results}),{mode:0o600});
  const run=(file?:string)=>promisify(execFile)(process.execPath,['--import','tsx','scripts/verify-behavior-review.ts','--feature','003',relative(process.cwd(),review)],{env:{...process.env,NODE_OPTIONS:'',TURAS_016_QUALITY_RUNTIME_FILE:file??''},timeout:15000});
  await expect(run()).rejects.toThrow();
  expect((await run(join(root,'runtime.json'))).stdout).toContain('12 of 12');
  await writeEvidence(root,'wrong-runtime.json',{contract:'pilot-quality-runtime-v1',id,attemptId,sourceRoot:process.cwd(),ledgerRoot:ledger.root,...source,authorizationDigest,capMicroUsd:25000000,contextCreditCap:4,expiresAt,stepAuthorization:{...stepAuthorization,budgetId:randomUUID()}});
  await expect(run(join(root,'wrong-runtime.json'))).rejects.toThrow();
  expect(await ledger.status()).toMatchObject({dispatches:0,contextDispatches:0,chargedMicroUsd:0});
 }finally{await rm(root,{recursive:true,force:true});}
});
