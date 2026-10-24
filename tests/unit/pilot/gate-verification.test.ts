import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const source=vi.hoisted(()=>({sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)}));
vi.mock('../../../scripts/pilot-source',()=>({pilotSource:async()=>source}));
import {pilotCatalog} from '../../../scripts/pilot-catalog';
import {writeEvidence,readEvidence} from '../../../scripts/pilot-evidence';
import {observePilotGates} from '../../../scripts/pilot-gate-verification';
import {checkPilotReadiness,verifyGateObservation} from '../../../scripts/pilot-readiness';
import {pilotRunSchema,type PilotRun} from '../../../lib/contracts/pilot-readiness';
const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'turas-gate-verification-')));roots.push(root);
 const binding={...source,environmentMarker:'test-observation',scopeDigest:'d'.repeat(64)},now=Date.now(),startedAt=new Date(now-120000).toISOString(),completedAt=new Date(now-60000).toISOString();
 const run:PilotRun={version:'pilot-readiness-v1',id:randomUUID(),createdAt:startedAt,...binding,attempts:[],selectedAttempts:[],receipts:[]};
 for(const gate of pilotCatalog.gates.slice(0,2)){
  const attemptId=randomUUID(),receiptIds:string[]=[];
  for(const method of gate.methods)for(const role of gate.requiredRoles){
   const id=randomUUID(),cases=(method==='local'?gate.localCaseIds:[gate.id+'.hosted.'+role]).map(id=>({id,state:'pass' as const,flaky:false}));
   const proof={version:'pilot-proof-v1',receiptId:id,runId:run.id,attemptId,gateId:gate.id,method,role,workspaceId:'00000000-0000-4000-8000-000000000001',...binding,startedAt,completedAt,state:'pass' as const};
   const proofDigest=await writeEvidence(root,id+'.json',{...proof,cases});
   const {receiptId,version,...attribution}=proof;run.receipts.push({...attribution,version:'pilot-readiness-v1',id,expectedCases:cases.length,passedCases:cases.length,failedCases:0,skippedCases:0,flakyCases:0,proofDigest,...(method==='hosted'?{hosted:{deploymentId:'controlled-deployment',commit:source.sourceCommit,origin:'https://example.com',environmentMarker:binding.environmentMarker,schemaLedgerDigest:'e'.repeat(64),runtimeGrantsVerified:true}}:{})});receiptIds.push(id);
  }
  run.attempts.push({id:attemptId,gateId:gate.id,complete:true,receiptIds});run.selectedAttempts.push({gateId:gate.id,attemptId});
 }
 return {root,run:pilotRunSchema.parse(run)};
}
it('observes shared execution intervals after dependencies without changing original proof times',async()=>{
 const {root,run}=await fixture();expect(checkPilotReadiness(run).gates[1].state).toBe('blocked');
 const result=await observePilotGates(root,run);expect(result.observations).toHaveLength(2);expect(checkPilotReadiness(result.run,Date.now(),result.observations).gates[1].state).toBe('pass');expect(result.run.receipts).toEqual(run.receipts);
 for(const ref of result.run.gateVerifications!)expect(await readEvidence(root,ref.id+'.json',ref.proofDigest)).toEqual(result.observations.find(row=>row.id===ref.id));
});
it('rejects changed original proof bytes before observing a gate',async()=>{
 const {root,run}=await fixture(),receipt=run.receipts[0];await writeFile(join(root,receipt.id+'.json'),'{}\n',{mode:0o600});await expect(observePilotGates(root,run)).rejects.toThrow('integrity');
});
it('rejects a changed dependency digest and observation before dependency completion',async()=>{
 const {root,run}=await fixture(),result=await observePilotGates(root,run),original=result.observations[1];
 expect(verifyGateObservation(result.run,{...original,dependencies:original.dependencies.map(row=>({...row,proofDigest:'f'.repeat(64)}))},result.observations)).toBe(false);
 expect(verifyGateObservation(result.run,{...original,startedAt:run.receipts[0].completedAt},result.observations)).toBe(false);
});
it('does not renew stale hosted execution by rereading its evidence',async()=>{
 const {root,run}=await fixture();for(const receipt of run.receipts.filter(row=>row.method==='hosted')){
  const proof=await readEvidence(root,receipt.id+'.json') as Record<string,unknown>,startedAt=new Date(Date.now()-26*3600000).toISOString(),completedAt=new Date(Date.now()-25*3600000).toISOString();
  await rm(join(root,receipt.id+'.json'));receipt.proofDigest=await writeEvidence(root,receipt.id+'.json',{...proof,startedAt,completedAt});receipt.startedAt=startedAt;receipt.completedAt=completedAt;
 }
 const result=await observePilotGates(root,run);expect(result.observations).toHaveLength(1);expect(checkPilotReadiness(result.run,Date.now(),result.observations).gates[1].state).toBe('unverified');
});
it('requires authenticated observation files and keeps latest failed attempts authoritative',async()=>{
 const {root,run}=await fixture(),result=await observePilotGates(root,run);expect(checkPilotReadiness(result.run).gates[0].state).toBe('unverified');
 const prior=run.receipts[0],attemptId=randomUUID(),id=randomUUID();run.receipts.push({...prior,id,attemptId,state:'fail',passedCases:0,failedCases:prior.expectedCases});run.attempts.push({id:attemptId,gateId:'G01',complete:true,receiptIds:[id]});
 // An older selected success cannot conceal the newer failed attempt.
 const retried=await observePilotGates(root,run);expect(retried.observations).toHaveLength(0);expect(checkPilotReadiness(retried.run,Date.now(),retried.observations).gates[0].state).toBe('unverified');
});
it('rejects forged original execution intervals and source bindings in observations',async()=>{
 const {root,run}=await fixture(),result=await observePilotGates(root,run),observation=result.observations[0];
 expect(verifyGateObservation(result.run,{...observation,executions:observation.executions.map(row=>({...row,completedAt:row.startedAt}))},result.observations)).toBe(false);
 expect(verifyGateObservation(result.run,{...observation,sourceDigest:'f'.repeat(64)},result.observations)).toBe(false);
 expect(verifyGateObservation(result.run,{...observation,completedAt:new Date(Date.now()+60000).toISOString()},result.observations)).toBe(false);
});
