import {rm} from 'node:fs/promises';
import {auxiliaryFixture} from '../../fixtures/pilot/auxiliary';
import {verifyPilotAuxiliaryEvidence} from '../../../scripts/pilot-auxiliary-evidence';
import {readEvidence} from '../../../scripts/pilot-evidence';
const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
import {afterEach,expect,it} from 'vitest';import {randomUUID} from 'node:crypto';
import {pilotCatalog} from '../../../scripts/pilot-catalog';
import {evaluatePilotReleaseBundle,type ReleaseScopedRun} from '../../../scripts/pilot-release-bundle';
import {pilotReleaseBundleSchema,type PilotReleaseBundle} from '../../../lib/contracts/pilot-release-bundle';
import {pilotRunSchema,pilotReceiptSchema,verifyPilotProof,type PilotReceipt} from '../../../lib/contracts/pilot-readiness';
import {evidenceDigest} from '../../../scripts/pilot-evidence';
const current={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)};
function proof(receipt:PilotReceipt,caseIds:string[]){const {id,proofDigest,expectedCases,passedCases,failedCases,skippedCases,flakyCases,hosted,version,...binding}=receipt;return {...binding,version:'pilot-proof-v1',receiptId:id,cases:caseIds.map(id=>({id,state:receipt.state==='pass'?'pass':'fail',flaky:false}))};}
async function fixture(){
 const now=Date.now(),target=(target:'preview'|'production')=>({contract:'pilot-hosted-scope-v1' as const,runId:randomUUID(),projectId:'prj_'+target,teamId:'team_unit',deploymentId:'dpl_'+target,origin:'https://'+target+'.example.com',environmentMarker:target+'-unit',workspaceId:randomUUID(),target,...current});
 const bundle:PilotReleaseBundle={contract:'pilot-release-bundle-v1',id:randomUUID(),createdAt:new Date(now).toISOString(),...current,preview:target('preview'),production:target('production'),runs:[]},inputs:ReleaseScopedRun[]=[];
 for(const slot of ['local','load','ui','ci','quality','preview','production'] as const){
  const kind=slot==='local'||slot==='load'||slot==='ui'?'owned-local':slot,targetScope=kind==='preview'?bundle.preview:bundle.production,id=['preview','production'].includes(kind)?targetScope.runId:randomUUID(),environmentMarker=kind==='owned-local'?'test-pilot-'+randomUUID().replaceAll('-','').slice(0,12):kind==='ci'?'ci-unit':kind==='quality'?'quality-unit':targetScope.environmentMarker,scopeDigest=['preview','production'].includes(kind)?evidenceDigest(JSON.stringify(targetScope)):'d'.repeat(64),workspaceId=['preview','production'].includes(kind)?targetScope.workspaceId:randomUUID();
  const run=pilotRunSchema.parse({version:'pilot-readiness-v1',id,createdAt:new Date(now-4000).toISOString(),...current,environmentMarker,scopeDigest,attempts:[],selectedAttempts:[],receipts:[]}),input:ReleaseScopedRun={kind,digest:'0'.repeat(64),run,proofs:new Map(),auxiliary:new Map()};
  if(slot==='load'||slot==='ui'){
   const actual=await auxiliaryFixture({ui:slot==='ui',completeUi:slot==='ui'});roots.push(actual.directory);input.run=actual.run;for(const receipt of actual.run.receipts)input.proofs.set(receipt.id,verifyPilotProof(receipt,await readEvidence(actual.directory,receipt.id+'.json',receipt.proofDigest)));const verified=await verifyPilotAuxiliaryEvidence(actual.directory,actual.run);input.auxiliary!.set(verified.gateId,verified);input.digest=evidenceDigest(JSON.stringify(input.run)+'\n');inputs.push(input);bundle.runs.push({kind,directory:actual.directory,manifest:'run.json',digest:input.digest});continue;
  }
  for(const gate of pilotCatalog.gates){
   const methods=gate.methods.filter(method=>slot==='local'?method==='local'&&!['G10','G12'].includes(gate.id):slot==='ci'?method==='ci':slot==='quality'?method==='actual-model-reviewed':slot==='preview'?method==='hosted'&&['G02','G15'].includes(gate.id):['hosted','automated-role-exercise'].includes(method)&&gate.id!=='G15');if(!methods.length)continue;
   const attemptId=randomUUID(),receiptIds:string[]=[];
   for(const method of methods)for(const role of gate.requiredRoles){
    const caseIds=method==='local'&&gate.localCaseIds.length?gate.localCaseIds:Array.from({length:gate.id==='G12'?40:gate.id==='G10'?18:1},(_,i)=>gate.id+'.unit.'+i),receipt=pilotReceiptSchema.parse({version:'pilot-readiness-v1',id:randomUUID(),runId:id,attemptId,gateId:gate.id,method,role,workspaceId,...current,environmentMarker,scopeDigest,startedAt:new Date(now-4000).toISOString(),completedAt:new Date(now-(gate.id==='G22'?1000:2000)).toISOString(),state:'pass',expectedCases:caseIds.length,passedCases:caseIds.length,failedCases:0,skippedCases:0,flakyCases:0,proofDigest:'e'.repeat(64),...(['hosted','automated-role-exercise'].includes(method)?{hosted:{deploymentId:targetScope.deploymentId,commit:current.sourceCommit,origin:targetScope.origin,environmentMarker,runtimeGrantsVerified:true,schemaLedgerDigest:'f'.repeat(64)}}:{})});
    const value=proof(receipt,caseIds);receipt.proofDigest=evidenceDigest(JSON.stringify(value)+'\n');input.proofs.set(receipt.id,verifyPilotProof(receipt,value));run.receipts.push(receipt);receiptIds.push(receipt.id);

   }
   run.attempts.push({id:attemptId,gateId:gate.id,complete:true,receiptIds});run.selectedAttempts.push({gateId:gate.id,attemptId});
  }
  input.run=pilotRunSchema.parse(run);input.digest=evidenceDigest(JSON.stringify(input.run)+'\n');inputs.push(input);bundle.runs.push({kind,directory:'/private/unit/'+slot,manifest:'run.json',digest:input.digest,...(['preview','production'].includes(kind)?{scope:targetScope}:{})});
 }
 const observed=Date.now();for(const input of inputs)for(const receipt of input.run.receipts.filter(row=>row.gateId==='G22')){receipt.completedAt=new Date(observed).toISOString();const value=proof(receipt,input.proofs.get(receipt.id)!.cases.map(row=>row.id));receipt.proofDigest=evidenceDigest(JSON.stringify(value)+'\n');input.proofs.set(receipt.id,verifyPilotProof(receipt,value));}for(let i=0;i<inputs.length;i++){inputs[i].digest=evidenceDigest(JSON.stringify(inputs[i].run)+'\n');bundle.runs[i].digest=inputs[i].digest;}return {bundle:pilotReleaseBundleSchema.parse(bundle),inputs,now:observed};
}
function refresh(f:Awaited<ReturnType<typeof fixture>>,input:ReleaseScopedRun){for(const receipt of input.run.receipts){const old=input.proofs.get(receipt.id)!,value=proof(receipt,old.cases.map(row=>row.id));receipt.proofDigest=evidenceDigest(JSON.stringify(value)+'\n');input.proofs.set(receipt.id,verifyPilotProof(receipt,value));}const index=f.inputs.indexOf(input);input.digest=evidenceDigest(JSON.stringify(input.run)+'\n');f.bundle.runs[index].digest=input.digest;}
it('composes complete original local CI quality Preview and Production scopes without relabeling their executions or approving release',async()=>{
 const f=await fixture(),result=evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now);expect(result.technicalEligibility).toBe('eligible');expect(result.releaseApproved).toBe(false);expect(new Set(result.gates.flatMap(g=>g.executions.map(row=>row.receipt.environmentMarker))).size).toBeGreaterThan(3);expect(result.gates.find(g=>g.id==='G15')!.executions.every(row=>row.input.kind==='preview')).toBe(true);
});
it('does not substitute Preview role checks for missing Production coverage',async()=>{
 const f=await fixture(),production=f.inputs.find(row=>row.kind==='production')!;production.run.selectedAttempts=production.run.selectedAttempts.filter(row=>row.gateId!=='G02');refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).gates.find(row=>row.id==='G02')!.state).toBe('unverified');
});
it('preserves the original one-scope receipt attribution guard',async()=>{
 const f=await fixture(),local=f.inputs.find(row=>row.kind==='owned-local')!;local.run.receipts[0].environmentMarker=f.bundle.production.environmentMarker;expect(()=>pilotRunSchema.parse(local.run)).toThrow();expect(()=>evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now)).toThrow();
});
it('requires original typed workload and four-project UI evidence rather than arbitrary empty-inventory pass claims',async()=>{
 const f=await fixture();for(const input of f.inputs)input.auxiliary?.clear();const result=evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now);expect(result.gates.find(row=>row.id==='G10')!.state).toBe('unverified');expect(result.gates.find(row=>row.id==='G12')!.state).toBe('unverified');expect(result.technicalEligibility).toBe('ineligible');
});
it('retains stale original hosted times even if a new release bundle is created',async()=>{
 const f=await fixture(),production=f.inputs.find(row=>row.kind==='production')!;for(const receipt of production.run.receipts.filter(row=>row.gateId==='G16')){receipt.startedAt=new Date(f.now-1900000).toISOString();receipt.completedAt=new Date(f.now-1850000).toISOString();}refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).gates.find(row=>row.id==='G16')!.state).toBe('unverified');
});
it('rejects missing original scoped references and different source bundles',async()=>{
 const f=await fixture();expect(()=>evaluatePilotReleaseBundle(f.bundle,f.inputs.slice(1),f.now)).toThrow();f.bundle.sourceDigest='0'.repeat(64);expect(()=>evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now)).toThrow();
});
it('does not let an older success conceal the latest failed complete scoped attempt',async()=>{
 const f=await fixture(),production=f.inputs.find(row=>row.kind==='production')!,old=production.run.receipts.find(row=>row.gateId==='G17')!,attemptId=randomUUID(),receipt={...old,id:randomUUID(),attemptId,state:'fail' as const,passedCases:0,failedCases:old.expectedCases};production.run.receipts.push(receipt);production.proofs.set(receipt.id,production.proofs.get(old.id)!);production.run.attempts.push({id:attemptId,gateId:'G17',complete:true,receiptIds:[receipt.id]});refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).gates.find(row=>row.id==='G17')!.state).toBe('unverified');production.run.selectedAttempts.find(row=>row.gateId==='G17')!.attemptId=attemptId;refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).gates.find(row=>row.id==='G17')!.state).toBe('fail');
});
it('requires the actual final release record to complete after the other original checks',async()=>{
 const f=await fixture(),production=f.inputs.find(row=>row.kind==='production')!;for(const receipt of production.run.receipts.filter(row=>row.gateId==='G22'))receipt.completedAt=new Date(f.now-3000).toISOString();refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).gates.find(row=>row.id==='G22')!.state).toBe('blocked');
});

it('retains an independently identified original Production run without forcing its run ID into another scope',async()=>{
 const f=await fixture(),production=f.inputs.find(row=>row.kind==='production')!,index=f.inputs.indexOf(production),scope={...f.bundle.production,runId:randomUUID()};production.run.id=scope.runId;production.run.scopeDigest=evidenceDigest(JSON.stringify(scope));for(const receipt of production.run.receipts){receipt.runId=scope.runId;receipt.scopeDigest=production.run.scopeDigest;}f.bundle.runs[index].scope=scope;refresh(f,production);expect(evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now).technicalEligibility).toBe('eligible');
});

it('rejects forged auxiliary summaries even when their cases and digest strings match',async()=>{const f=await fixture();for(const input of f.inputs)for(const [gate,value] of input.auxiliary??[])input.auxiliary!.set(gate,{...value});const result=evaluatePilotReleaseBundle(f.bundle,f.inputs,f.now);expect(result.technicalEligibility).toBe('ineligible');expect(result.gates.find(row=>row.id==='G10')!.state).toBe('unverified');});
it('rejects duplicate reference identities and non-bijective input inventories',async()=>{const f=await fixture();const duplicate={...f.inputs[0],run:{...f.inputs[0].run,id:randomUUID()}};expect(()=>evaluatePilotReleaseBundle(f.bundle,[f.inputs[0],duplicate,...f.inputs.slice(2)],f.now)).toThrow();f.bundle.runs[1]={...f.bundle.runs[0],directory:'/another/private/path'};expect(()=>pilotReleaseBundleSchema.parse(f.bundle)).toThrow();});
