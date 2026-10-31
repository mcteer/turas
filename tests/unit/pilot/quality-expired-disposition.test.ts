import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,rm,readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
import {evidenceDigest,readEvidence} from '../../../scripts/pilot-evidence';
it('disposes expired uncertainty without renewal, refund, source adoption or historical rewrites',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/expired-disposition-'));
 const start=Date.now(),expiresAt=new Date(start+1000).toISOString();
 try{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(start);
  const ledger=await QualityBudgetLedger.create(join(root,'budget'),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd:25000000,contextCreditCap:0,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:'anthropic/claude-sonnet-5.5',expiresAt});
  const id=await ledger.dispatch({modelId:'anthropic/claude-sonnet-5.5',ceilingMicroUsd:6908000,pricingDigest:'d'.repeat(64)});await ledger.hold(id,'provider_error');
  const names=(await readdir(ledger.root)).sort(),before=await Promise.all(names.map(n=>readFile(join(ledger.root,n),'utf8'))),source=await ledger.currentSource();
  const d=await readEvidence(ledger.root,'event-000001.json'),u=await readEvidence(ledger.root,'event-000002.json'),authority=await ledger.currentAuthority();
  const approval={contract:'pilot-quality-expired-disposition-v1',id:randomUUID(),budgetId:authority.id,ledgerRoot:ledger.root,originalAuthorizationDigest:authority.originalAuthorizationDigest,previousAuthorityDigest:authority.authorizationDigest,journalHeadDigest:authority.journalHeadDigest,unknownDispatches:[{id,dispatchDigest:evidenceDigest(JSON.stringify(d)),unknownDigest:evidenceDigest(JSON.stringify(u)),permanentHoldMicroUsd:6908000}],additionalAllowanceMicroUsd:0,taskAdmissionDigest:'e'.repeat(64),independentReviewDigest:'f'.repeat(64),userInstructionReference:'Synthetic independently reviewed audit only',recordedAt:new Date(start+2000).toISOString(),uncertainRequestsMayRetry:false,unknownChargeSettled:false,automaticTopUp:false};
  await expect(ledger.reviewExpiredDisposition(approval)).rejects.toThrow();
  vi.setSystemTime(start+2000);
  for(const altered of [{additionalAllowanceMicroUsd:1},{uncertainRequestsMayRetry:true},{unknownChargeSettled:true},{automaticTopUp:true},{budgetId:randomUUID()},{originalAuthorizationDigest:'0'.repeat(64)},{previousAuthorityDigest:'0'.repeat(64)},{unknownDispatches:[approval.unknownDispatches[0],approval.unknownDispatches[0]]},{sourceCommit:'1'.repeat(40)},{unknownDispatches:[]},{unknownDispatches:[{...approval.unknownDispatches[0],permanentHoldMicroUsd:1}]},{journalHeadDigest:'0'.repeat(64)}])await expect(ledger.reviewExpiredDisposition({...approval,...altered})).rejects.toThrow();
  expect(await ledger.reviewExpiredDisposition(approval)).toMatchObject({authorityRenewed:false,unknownChargeSettled:false,expiresAt,permanentHeldMicroUsd:6908000});
  expect(await Promise.all(names.map(n=>readFile(join(ledger.root,n),'utf8')))).toEqual(before);
  const after=await ledger.currentAuthority();expect(after).toEqual({...authority,journalHeadDigest:after.journalHeadDigest});expect(after.journalHeadDigest).not.toBe(authority.journalHeadDigest);expect(await ledger.currentSource()).toEqual(source);
  expect(await new QualityBudgetLedger(ledger.root).status()).toMatchObject({chargedMicroUsd:0,heldMicroUsd:6908000,permanentHeldMicroUsd:6908000,unknown:1,capMicroUsd:25000000,contextDispatches:0,admissionHeld:true});
  await expect(ledger.dispatch({modelId:'anthropic/claude-sonnet-5.5',ceilingMicroUsd:1000,pricingDigest:'d'.repeat(64)})).rejects.toThrow();
  await expect(ledger.beginAttempt({sourceCommit:'1'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)})).rejects.toThrow();
  await expect(ledger.settle(id,{chargedMicroUsd:0,inputTokens:0,outputTokens:0,generationId:'not-proof'})).rejects.toThrow();
  await ledger.continueAuthorization({contract:'pilot-quality-continuation-v1',id:randomUUID(),budgetId:authority.id,ledgerRoot:ledger.root,originalAuthorizationDigest:authority.originalAuthorizationDigest,previousAuthorityDigest:authority.authorizationDigest,journalHeadDigest:after.journalHeadDigest,sourceCommit:'1'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),userInstructionReference:'Separate synthetic time-only continuation',recordedAt:new Date().toISOString(),expiresAt:new Date(start+10000).toISOString()});
  expect(await ledger.status()).toMatchObject({heldMicroUsd:6908000,permanentHeldMicroUsd:6908000,unknown:1,capMicroUsd:25000000,admissionHeld:false});
  await ledger.beginAttempt({sourceCommit:'1'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)});
  await ledger.recordUnknownExposure(id,6908001,'9'.repeat(64));expect(await ledger.status()).toMatchObject({heldMicroUsd:6908001,admissionHeld:true});
  await expect(ledger.dispatch({modelId:'anthropic/claude-sonnet-5.5',ceilingMicroUsd:1000,pricingDigest:'d'.repeat(64)})).rejects.toThrow();
 }finally{vi.useRealTimers();await rm(root,{recursive:true,force:true});}
});
