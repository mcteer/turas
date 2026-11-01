import {fileURLToPath as retiredFilePath} from 'node:url';
import {resolve as retiredResolve} from 'node:path';
// Historical private-pilot fixture module; programme CLI retired.
import {verifyHostedFeedbackEvidence,isVerifiedHostedFeedbackEvidence,type VerifiedHostedFeedbackEvidence} from './pilot-hosted-feedback-evidence';
import {verifyPilotCiEvidence,isVerifiedPilotCiEvidence,type VerifiedPilotCiEvidence} from './pilot-ci-import';
import {verifyHostedCoreEvidence,isVerifiedHostedCoreEvidence,type VerifiedHostedCoreEvidence} from './pilot-hosted-core-evidence';
import {verifyHostedPartnerEvidence,isVerifiedHostedPartnerEvidence,type VerifiedHostedPartnerEvidence} from './pilot-hosted-partner-evidence';
import {verifyHostedSdkEvidence,isVerifiedHostedSdkEvidence,type VerifiedHostedSdkEvidence} from './pilot-hosted-journey-evidence';
import {execFileSync} from 'node:child_process';
import {verifyPilotAuxiliaryEvidence,isVerifiedPilotAuxiliaryEvidence,type VerifiedPilotAuxiliaryEvidence} from './pilot-auxiliary-evidence';
import {randomUUID} from 'node:crypto';
import {resolve,dirname,basename,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pilotReleaseBundleSchema,pilotReleaseObservationSchema,type PilotReleaseBundle} from '../lib/contracts/pilot-release-bundle';
import {pilotRunSchema,verifyPilotProof,type PilotRun,type PilotReceipt} from '../lib/contracts/pilot-readiness';
import {pilotCatalog} from './pilot-catalog';
import {pilotSource} from './pilot-source';
import {platformDeployment} from './pilot-hosted';
import {createEvidenceDirectory,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';
export type ReleaseScopedRun={kind:PilotReleaseBundle['runs'][number]['kind'];digest:string;run:PilotRun;proofs:Map<string,ReturnType<typeof verifyPilotProof>>;auxiliary?:Map<string,VerifiedPilotAuxiliaryEvidence>;hostedSdk?:VerifiedHostedSdkEvidence;hostedPartner?:VerifiedHostedPartnerEvidence;hostedCore?:VerifiedHostedCoreEvidence;ci?:VerifiedPilotCiEvidence;hostedFeedback?:VerifiedHostedFeedbackEvidence};
function requireScopedRun(bundle:PilotReleaseBundle,input:ReleaseScopedRun){
 const run=pilotRunSchema.parse(input.run);for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(run[key]!==bundle[key])throw Error('Scoped execution source differs');
 const target=input.kind==='preview'?bundle.preview:bundle.production;
 if(['preview','production','operator'].includes(input.kind)){
  const original=bundle.runs.find(row=>row.kind===input.kind&&row.digest===input.digest)?.scope;if(!original||run.id!==original.runId||run.environmentMarker!==target.environmentMarker||run.scopeDigest!==evidenceDigest(JSON.stringify(original)))throw Error('Actual hosted evidence scope differs');
 }else if(input.kind==='owned-local'&&!/^test-pilot-[a-f0-9]{12}$/.test(run.environmentMarker))throw Error('Actual owned local evidence required');
 for(const receipt of run.receipts){
  const allowed=input.kind==='owned-local'?['local']:input.kind==='ci'?['ci']:input.kind==='quality'?['actual-model-reviewed']:input.kind==='operator'?['automated-role-exercise']:['hosted','automated-role-exercise'];
  if(!allowed.includes(receipt.method))throw Error('Evidence method does not match its original execution kind');
  if(receipt.hosted&&(receipt.workspaceId!==target.workspaceId||receipt.hosted.deploymentId!==target.deploymentId||receipt.hosted.origin!==target.origin||receipt.hosted.environmentMarker!==target.environmentMarker))throw Error('Original hosted receipt targets another deployment');
  const proof=input.proofs.get(receipt.id);if(!proof)throw Error('Original scoped receipt proof missing');verifyPilotProof(receipt,proof);
  const gate=pilotCatalog.gates.find(row=>row.id===receipt.gateId)!;if(!gate.methods.includes(receipt.method)||!gate.requiredRoles.includes(receipt.role))throw Error('Original receipt does not match its governed gate method or role');
  if(receipt.method==='local'&&gate.localCaseIds.length&&(proof.cases.length!==gate.localCaseIds.length||gate.localCaseIds.some(id=>!proof.cases.some(row=>row.id===id))))throw Error('Original local inventory differs');
 }
 return {...input,run};
}
/** Aggregation preserves every original scope and execution interval. It never
 * manufactures a Production-attributed local/CI/quality execution receipt. */
export function evaluatePilotReleaseBundle(raw:unknown,inputs:readonly ReleaseScopedRun[],now=Date.now()){
 const bundle=pilotReleaseBundleSchema.parse(raw);if(Date.parse(bundle.createdAt)>now)throw Error('Future release bundle');
 if(inputs.some(input=>!bundle.runs.some(reference=>reference.kind===input.kind&&reference.digest===input.digest))||inputs.length!==bundle.runs.length||new Set(inputs.map(row=>row.kind+':'+row.digest)).size!==inputs.length||new Set(inputs.map(row=>row.run.id)).size!==inputs.length)throw Error('Complete unique scoped run inventory required');
 const scoped=inputs.map(input=>requireScopedRun(bundle,input)),gates:{id:string;state:'pass'|'fail'|'blocked'|'unverified';executions:{input:ReleaseScopedRun;receipt:PilotReceipt}[]}[]=[];
 for(const gate of pilotCatalog.gates){
  const executions:{input:ReleaseScopedRun;receipt:PilotReceipt}[]=[];let invalidSelection=false;
  for(const input of scoped){
   const selected=input.run.selectedAttempts.find(row=>row.gateId===gate.id),attempt=input.run.attempts.find(row=>row.id===selected?.attemptId);if(!attempt)continue;
   if(input.run.attempts.filter(row=>row.gateId===gate.id).at(-1)?.id!==attempt.id)invalidSelection=true;
   for(const receipt of input.run.receipts.filter(row=>attempt.receiptIds.includes(row.id))){
    if(receipt.method==='hosted'&&(gate.id==='G15'?input.kind!=='preview':input.kind!=='production'))continue;
    if(receipt.method==='automated-role-exercise'&&!['production','operator'].includes(input.kind))continue;
    executions.push({input,receipt});
   }
  }
  let state:typeof gates[number]['state']='unverified';
  if(executions.some(row=>row.receipt.state==='fail'))state='fail';
  else if(executions.some(row=>row.receipt.state==='blocked'))state='blocked';
  else if(!invalidSelection&&executions.length&&executions.every(row=>row.receipt.state==='pass')&&gate.methods.every(method=>gate.requiredRoles.every(role=>executions.some(row=>row.receipt.method===method&&row.receipt.role===role)))){
   state='pass';for(const {receipt} of executions){const age=now-Date.parse(receipt.completedAt),limit=['G16','G17','G18','G19','G22'].includes(gate.id)?1800000:86400000;if(age<0||['hosted','automated-role-exercise'].includes(receipt.method)&&age>limit)state='unverified';}
  }
  if(state==='pass'&&['G10','G12'].includes(gate.id))for(const {input,receipt} of executions.filter(row=>row.receipt.method==='local')){const auxiliary=input.auxiliary?.get(gate.id),proof=input.proofs.get(receipt.id)!;if(!isVerifiedPilotAuxiliaryEvidence(auxiliary,input.run,gate.id)||!auxiliary.artifactDigests.length||auxiliary.cases.length!==proof.cases.length||auxiliary.cases.some(id=>!proof.cases.some(row=>row.id===id&&row.state==='pass'&&!row.flaky)))state='unverified';}
  if(state==='pass'&&gate.id==='G14'&&executions.some(({input})=>!isVerifiedPilotCiEvidence(input.ci,input.run)))state='unverified';
  if(state==='pass'&&gate.id==='G17'&&executions.some(({input})=>!isVerifiedHostedCoreEvidence(input.hostedCore,input.run)))state='unverified';
  if(state==='pass'&&gate.id==='G18'&&executions.some(({input})=>!isVerifiedHostedPartnerEvidence(input.hostedPartner,input.run)))state='unverified';
  if(state==='pass'&&gate.id==='G19'&&executions.some(({input})=>!isVerifiedHostedSdkEvidence(input.hostedSdk,input.run)))state='unverified';
  if(state==='pass'&&gate.id==='G21'&&executions.some(({input})=>!isVerifiedHostedFeedbackEvidence(input.hostedFeedback,input.run,now)))state='unverified';
  if(state==='pass'&&gate.dependsOn.some(id=>gates.find(row=>row.id===id)?.state!=='pass'))state='blocked';
  // The final release record is an actual final operation, not merely a later
  // reread of an early hosted check. Preserve this execution-order requirement.
  if(state==='pass'&&gate.id==='G22'){
   const latest=Math.max(...gates.flatMap(row=>row.executions.map(value=>Date.parse(value.receipt.completedAt))));if(executions.some(row=>Date.parse(row.receipt.completedAt)<latest))state='blocked';
  }
  gates.push({id:gate.id,state,executions});
 }
 return {bundle,gates,technicalEligibility:gates.every(row=>row.state==='pass')?'eligible' as const:'ineligible' as const,releaseApproved:false as const};
}
export async function pilotReleaseBundle(args=process.argv.slice(2)){
 if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('Explicit immutable scoped bundle and fresh output directory required');
 const file=resolve(args[1]),bundle=pilotReleaseBundleSchema.parse(await readEvidence(dirname(file),basename(file))),root=resolve(args[3]);
 const current=async()=>{if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000}).trim())throw Error('Committed clean release verifier required');const source=await pilotSource();for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(source[key]!==bundle[key])throw Error('Current release bundle source differs');};await current();await createEvidenceDirectory(root);
 const deadline=AbortSignal.timeout(120000);const verifyTargets=async()=>{for(const scope of [bundle.preview,bundle.production])if(JSON.stringify(await platformDeployment(scope,false,deadline))!==JSON.stringify(await platformDeployment(scope,true,deadline)))throw Error('Current serving release identity differs');deadline.throwIfAborted();};await verifyTargets();
 const inputs:ReleaseScopedRun[]=[];
 for(const reference of bundle.runs){deadline.throwIfAborted();if(!isAbsolute(reference.directory)||resolve(reference.directory)!==reference.directory)throw Error('Exact absolute private evidence directory required');const run=pilotRunSchema.parse(await readEvidence(reference.directory,reference.manifest,reference.digest)),proofs=new Map<string,ReturnType<typeof verifyPilotProof>>();for(const receipt of run.receipts)proofs.set(receipt.id,verifyPilotProof(receipt,await readEvidence(reference.directory,receipt.id+'.json',receipt.proofDigest)));const auxiliary=new Map<string,VerifiedPilotAuxiliaryEvidence>();if(run.receipts.some(row=>row.method==='local'&&['G10','G12'].includes(row.gateId))){const verified=await verifyPilotAuxiliaryEvidence(reference.directory,run);auxiliary.set(verified.gateId,verified);}const hostedSdk=run.receipts.some(row=>row.method==='hosted'&&row.gateId==='G19')?await verifyHostedSdkEvidence(reference.directory,run):undefined;const hostedPartner=run.receipts.some(row=>row.method==='hosted'&&row.gateId==='G18')?await verifyHostedPartnerEvidence(reference.directory,run):undefined;const hostedCore=run.receipts.some(row=>row.method==='hosted'&&row.gateId==='G17')?await verifyHostedCoreEvidence(reference.directory,run):undefined;const ci=run.receipts.some(row=>row.method==='ci'&&row.gateId==='G14')?await verifyPilotCiEvidence(reference.directory,run):undefined;const hostedFeedback=run.receipts.some(row=>row.gateId==='G21')?await verifyHostedFeedbackEvidence(reference.directory,run):undefined;inputs.push({kind:reference.kind,digest:reference.digest,run,proofs,auxiliary,hostedSdk,hostedPartner,hostedCore,ci,hostedFeedback});}
 const evaluated=evaluatePilotReleaseBundle(bundle,inputs),observations:{gateId:string;observationId:string;digest:string;completedAt:string}[]=[];
 for(const gate of evaluated.gates){
  deadline.throwIfAborted();const startedAt=new Date().toISOString();
  // Reopen all selected original bytes for this observation after dependency
  // observations complete. Original freshness is never based on this clock.
  for(const {input,receipt} of gate.executions){const reference=bundle.runs.find(row=>row.kind===input.kind&&row.digest===input.digest);if(!reference)throw Error('Original scoped reference missing');await readEvidence(reference.directory,reference.manifest,reference.digest);if(gate.id==='G14')await verifyPilotCiEvidence(reference.directory,input.run);if(gate.id==='G17')await verifyHostedCoreEvidence(reference.directory,input.run);if(gate.id==='G18')await verifyHostedPartnerEvidence(reference.directory,input.run);if(gate.id==='G19')await verifyHostedSdkEvidence(reference.directory,input.run);if(gate.id==='G21')await verifyHostedFeedbackEvidence(reference.directory,input.run);verifyPilotProof(receipt,await readEvidence(reference.directory,receipt.id+'.json',receipt.proofDigest));}
  await current();const selected=evaluatePilotReleaseBundle(bundle,inputs),state=selected.gates.find(row=>row.id===gate.id)!.state;
  const required=pilotCatalog.gates.find(row=>row.id===gate.id)!,dependencies=required.dependsOn.map(id=>{const value=observations.find(row=>row.gateId===id);if(!value)throw Error('Original dependency observation missing');return {gateId:id,observationId:value.observationId,digest:value.digest};});
  const observation=pilotReleaseObservationSchema.parse({contract:'pilot-release-gate-observation-v1',id:randomUUID(),bundleId:bundle.id,bundleDigest:evidenceDigest(JSON.stringify(bundle)),gateId:gate.id,sourceCommit:bundle.sourceCommit,sourceDigest:bundle.sourceDigest,catalogDigest:bundle.catalogDigest,startedAt,completedAt:new Date().toISOString(),state,executions:gate.executions.map(({input,receipt})=>({runId:input.run.id,runDigest:input.digest,attemptId:receipt.attemptId,receiptId:receipt.id,proofDigest:receipt.proofDigest,environmentMarker:receipt.environmentMarker,workspaceId:receipt.workspaceId,scopeDigest:receipt.scopeDigest,method:receipt.method,role:receipt.role,startedAt:receipt.startedAt,completedAt:receipt.completedAt})),dependencies});
  if(observation.dependencies.some(row=>Date.parse(observations.find(value=>value.observationId===row.observationId)!.completedAt)>Date.parse(startedAt)))throw Error('Release observation preceded its dependency');
  const digest=await writeEvidence(root,observation.id+'.json',observation);observations.push({gateId:gate.id,observationId:observation.id,digest,completedAt:observation.completedAt});
 }
 await verifyTargets();await current();deadline.throwIfAborted();const final=evaluatePilotReleaseBundle(bundle,inputs),result={contract:'pilot-release-bundle-result-v1',bundleId:bundle.id,bundleDigest:evidenceDigest(JSON.stringify(bundle)),sourceCommit:bundle.sourceCommit,sourceDigest:bundle.sourceDigest,catalogDigest:bundle.catalogDigest,technicalEligibility:final.technicalEligibility,releaseApproved:false,observations,gates:final.gates.map(({id,state})=>({id,state}))};await writeEvidence(root,'result.json',result);return result;
}

if(process.argv[1]&&retiredResolve(process.argv[1])===retiredFilePath(import.meta.url)){console.error('Private pilot command retired; historical fixtures are import-only.');process.exitCode=2;}
