import {randomUUID} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pilotGateVerificationSchema,pilotRunSchema,verifyPilotProof,type PilotRun,type PilotGateVerification} from '../lib/contracts/pilot-readiness';
import {pilotCatalog} from './pilot-catalog';
import {readEvidence,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {checkPilotReadiness} from './pilot-readiness';

/** Observe evidence in dependency order. Never dispatches work or changes an
 * original execution timestamp. Hosted freshness remains the execution's age. */
export async function observePilotGates(root:string,raw:unknown){
 const original=pilotRunSchema.parse(raw),source=await pilotSource();
 const current=async()=>{const actual=await pilotSource();for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(actual[key]!==original[key]||actual[key]!==source[key])throw Error('Gate verification source differs');};
 await current();let run:PilotRun={...original,gateVerifications:[]};const observations:PilotGateVerification[]=[];
 for(const gate of pilotCatalog.gates){
  const selected=run.selectedAttempts.find(row=>row.gateId===gate.id),attempt=run.attempts.find(row=>row.id===selected?.attemptId);
  if(!attempt||gate.dependsOn.some(id=>!run.gateVerifications!.some(row=>row.gateId===id)))continue;
  const startedAt=new Date().toISOString(),receipts=attempt.receiptIds.map(id=>run.receipts.find(row=>row.id===id)!);
  for(const receipt of receipts){
   const proof=verifyPilotProof(receipt,await readEvidence(root,`${receipt.id}.json`,receipt.proofDigest));
   if(receipt.method==='local'&&gate.localCaseIds.length>0&&(proof.cases.length!==gate.localCaseIds.length||gate.localCaseIds.some(id=>!proof.cases.some(row=>row.id===id))))throw Error('Original gate inventory differs');
  }
  if(['G10','G12'].includes(gate.id)&&receipts.some(row=>row.method==='local')){const {verifyPilotAuxiliaryEvidence}=await import('./pilot-auxiliary-evidence');if((await verifyPilotAuxiliaryEvidence(root,run)).gateId!==gate.id)throw Error('Typed auxiliary gate evidence differs');}
  await current();
  const observation=pilotGateVerificationSchema.parse({version:'pilot-gate-verification-v1',id:randomUUID(),runId:run.id,gateId:gate.id,attemptId:attempt.id,environmentMarker:run.environmentMarker,...source,scopeDigest:run.scopeDigest,startedAt,completedAt:new Date().toISOString(),executions:receipts.map(row=>({receiptId:row.id,proofDigest:row.proofDigest,startedAt:row.startedAt,completedAt:row.completedAt})),dependencies:gate.dependsOn.map(id=>{const row=run.gateVerifications!.find(row=>row.gateId===id)!;return {gateId:id,verificationId:row.id,proofDigest:row.proofDigest};})});
  // A provisional in-memory reference enables the same eligibility checker;
  // only an actual digest of newly written bytes is persisted in the run.
  const candidate=pilotRunSchema.parse({...run,gateVerifications:[...run.gateVerifications!,{gateId:gate.id,id:observation.id,proofDigest:'0'.repeat(64)}]});
  if(checkPilotReadiness(candidate,Date.now(),[...observations,observation]).gates.find(row=>row.id===gate.id)?.state!=='pass')continue;
  const proofDigest=await writeEvidence(root,`${observation.id}.json`,observation);observations.push(observation);
  run=pilotRunSchema.parse({...run,gateVerifications:[...run.gateVerifications!,{gateId:gate.id,id:observation.id,proofDigest}]});
 }
 await current();return {run,observations};
}
export async function pilotGateVerification(args=process.argv.slice(2)){
 if(args.length!==4||args[0]!=='--run'||args[2]!=='--output'||basename(args[3])!==args[3])throw Error('Explicit private run and fresh output filename required');
 const file=resolve(args[1]),root=dirname(file),result=await observePilotGates(root,await readEvidence(root,basename(file)));
 await writeEvidence(root,args[3],result.run);return checkPilotReadiness(result.run,Date.now(),result.observations);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotGateVerification().then(result=>{console.info(JSON.stringify(result));process.exitCode=result.technicalEligibility==='eligible'?0:1;}).catch(()=>{console.error('Gate evidence verification incomplete; original executions unchanged.');process.exitCode=2;});
