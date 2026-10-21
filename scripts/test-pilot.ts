import {pilotCatalogAbortMetadata} from "./ci-process-diagnostics";
import {pilotSuiteDeadlineMs} from './pilot-suite-deadlines';
import {preparePilotAssetPermissions} from './pilot-asset-permissions';
import {parsePilotImagePreparation} from "../lib/contracts/pilot-images";
import { access,readFile,writeFile,cp } from "node:fs/promises";
import {createHash} from 'node:crypto';
import {verifyArtifactImage,assertFreshArtifactSignatures} from '../lib/server/artifacts/scan';
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import suites from "./pilot-suites.json";
import { withPilotEnvironment } from "./pilot-environment";
import { preparePilotLegacySessions } from "../tests/fixtures/pilot/migrations";
import { createEvidenceDirectory, readEvidence, writeEvidence } from "./pilot-evidence";
import { pilotSource } from "./pilot-source";
import { pilotCatalog } from "./pilot-catalog";
import { pilotRunSchema } from "../lib/contracts/pilot-readiness";
import { verifyPilotSuiteResult } from "./pilot-suite-results";

let failureRecord:{root:string;runId:string;sourceCommit:string;sourceDigest:string;catalogDigest:string}|null=null;
let failureStage='setup',activeSuite:string|null=null;
let cancellationCause:()=>unknown=()=> 'unavailable',childProcessError:unknown=null;
async function main(){
 if(process.argv.length!==2)throw new Error("Pilot catalog does not accept suite filters");
 if(suites.suites.some(suite=>suite.cases.length!==suite.expectedCases||new Set(suite.cases).size!==suite.cases.length))throw Error("Complete unique named pilot case inventory required");
 const source=await pilotSource(),runId=randomUUID(),root=path.resolve(`local-artifacts/016/run-${runId}`);
 // The owned fixture deliberately removes CI variables from its environment.
 // Retain only immutable parent provenance; never forward it to test children.
 const ci=Object.freeze({active:process.env.GITHUB_ACTIONS==='true',runId:process.env.GITHUB_RUN_ID,commit:process.env.TURAS_PILOT_CI_COMMIT??process.env.GITHUB_SHA});
 if(ci.active&&(!ci.runId||!/^\d{1,32}$/.test(ci.runId)||ci.commit!==source.sourceCommit))throw Error('Exact actual CI run and checkout required');
 await createEvidenceDirectory(root);failureRecord={root,runId,...source};
 const missing=[];for(const suite of suites.suites){try{await access(suite.file);}catch{missing.push(suite.file);}}
 if(missing.length){await writeEvidence(root,"execution.json",{version:"pilot-execution-v1",runId,...source,method:"local",state:"blocked",missingSuites:missing.length});process.stdout.write(JSON.stringify({state:"blocked",missingSuites:missing.length})+"\n");process.exitCode=1;return;}
 const preparationFile=process.env.TURAS_PILOT_UI_PREPARATION_FILE;if(!preparationFile)throw Error("Explicit prepared local images required for the full pilot catalog");
 const preparation=parsePilotImagePreparation(await readFile(preparationFile));
 const image=(kind:string)=>preparation.images.find(row=>row.kind===kind)!;
 for(const kind of ['parser','scanner'])await verifyArtifactImage(image(kind).localImageId,image(kind).localImageId.slice(7));
 const preparedStore=path.join(path.dirname(preparationFile),'store');
 for(const signature of preparation.scanner.signatures){const bytes=await readFile(path.join(preparedStore,'signatures',signature.name));if(bytes.length!==signature.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==signature.digest)throw Error('Scanner asset provenance differs');}
 if(createHash('sha256').update(await readFile(path.join(preparedStore,'assets/eng.traineddata'))).digest('hex')!==preparation.ocr.digest)throw Error('OCR asset provenance differs');
 await assertFreshArtifactSignatures(path.join(preparedStore,'signatures'));
 await writeEvidence(root,"image-preparation.json",preparation);
 const previousUmask=process.umask(0o077);
 try{await withPilotEnvironment(async environment=>{
  cancellationCause=environment.cancellationCause;
  process.env.TURAS_PILOT_UI_PREPARATION_FILE=path.resolve(preparationFile);process.env.TURAS_PILOT_RENDERER_IMAGE=preparation.images.find(image=>image.kind==='renderer')!.localImageId;process.env.TURAS_REPORTS_ENABLED='true';
  await preparePilotLegacySessions();await environment.upgradeToCurrent();
  process.env.TURAS_PILOT_PARSER_IMAGE=image('parser').localImageId;process.env.TURAS_PILOT_SCANNER_IMAGE=image('scanner').localImageId;
  await cp(path.join(preparedStore,'signatures'),path.join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
  await cp(path.join(preparedStore,'assets'),path.join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
  await preparePilotAssetPermissions(process.env.TURAS_ARTIFACT_STORE_ROOT!);
  let total=0;const suiteEvidence:{file:string;resultFile:string;resultDigest:string;processFile:string;processDigest:string}[]=[];const passedCaseIds=new Set<string>();const caseTimes=new Map<string,{start:string;end:string}>();
  for(const [index,suite] of suites.suites.entries()){
   activeSuite=suite.file;failureStage='suite-preparation';
   // Queue-only upload fixtures author a shape-only attestation. Restore the
   // verified image binding before the next suite without changing their jobs.
   await writeFile(path.join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:image('parser').localImageId,parserDigest:image('parser').localImageId.slice(7),scannerImage:image('scanner').localImageId,scannerDigest:image('scanner').localImageId.slice(7)}),{mode:0o600});
   environment.signal.throwIfAborted();const name=`suite-${index}.json`;
   const startedAt=new Date().toISOString();
   failureStage='suite-process';
   const child=spawn(process.execPath,["node_modules/vitest/vitest.mjs","run",suite.file,"--reporter=json",`--outputFile=${path.join(root,name)}`],{cwd:environment.appRoot,env:process.env,stdio:["ignore","pipe","pipe"],signal:environment.signal});
   let stdout='',stderr='',deadlineExpired=false;
   child.stdout.on('data',bytes=>{stdout=(stdout+bytes.toString()).slice(-131072);});
   child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-131072);});
   const timeout=setTimeout(()=>{deadlineExpired=true;child.kill("SIGKILL");},pilotSuiteDeadlineMs(suite.file));
   let exit:{code:number|null;signal:string|null};
   try{exit=await new Promise((resolve,reject)=>{child.once("close",(code,signal)=>resolve({code,signal}));child.once("error",reject);});}catch(error){childProcessError=error;throw error;}finally{clearTimeout(timeout);}
   const safe=(value:string)=>value.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-url]');
   await writeEvidence(root,`suite-${index}-process.json`,{file:suite.file,startedAt,completedAt:new Date().toISOString(),...exit,deadlineExpired,stdoutTail:safe(stdout),stderrTail:safe(stderr)});
   const code=exit.code;
   if(code!==0)throw new Error("Registered pilot suite failed");
   failureStage='suite-catalog-verification';
   const result=verifyPilotSuiteResult(suite.file,await readEvidence(root,name));suiteEvidence.push({file:suite.file,resultFile:name,resultDigest:createHash('sha256').update(await readFile(path.join(root,name))).digest('hex'),processFile:`suite-${index}-process.json`,processDigest:createHash('sha256').update(await readFile(path.join(root,`suite-${index}-process.json`))).digest('hex')});total+=result.passedCases;const prefix=suite.file.split("/")[1]+"."+path.basename(suite.file,".test.ts");for(let i=0;i<suite.expectedCases;i++){const id=`${prefix}.${String(i+1).padStart(3,"0")}`;passedCaseIds.add(id);caseTimes.set(id,{start:startedAt,end:new Date().toISOString()});}
  }
  activeSuite=null;failureStage='source-and-receipt-verification';
  const current=await pilotSource();if(current.sourceDigest!==source.sourceDigest||current.sourceCommit!==source.sourceCommit)throw new Error("Source changed during pilot execution");
  const receipts=[];const attempts=[];const selectedAttempts=[];
  const scopeDigest=(await import("./pilot-evidence")).evidenceDigest(JSON.stringify({runId,method:"local",environmentMarker:environment.environmentId,inventory:suites}));
  const now=new Date().toISOString();
  for(const gate of pilotCatalog.gates){
   if(!gate.localCaseIds.length||gate.localCaseIds.some(id=>!passedCaseIds.has(id)))continue;
   const attemptId=randomUUID(),receiptIds=[];
   for(const role of gate.requiredRoles){
    const id=randomUUID();const proof={version:"pilot-proof-v1",receiptId:id,runId,attemptId,gateId:gate.id,method:"local",role,workspaceId:(await import("../lib/server/bootstrap-ids")).DEMO_IDS.workspace,environmentMarker:environment.environmentId,...source,scopeDigest,startedAt:new Date(Math.min(...gate.localCaseIds.map(id=>Date.parse(caseTimes.get(id)!.start)))).toISOString(),completedAt:new Date(Math.max(...gate.localCaseIds.map(id=>Date.parse(caseTimes.get(id)!.end)))).toISOString(),state:"pass",cases:gate.localCaseIds.map(id=>({id,state:"pass",flaky:false}))};
    const proofDigest=await writeEvidence(root,`${id}.json`,proof);const {cases,receiptId,version,...binding}=proof;
    receipts.push({...binding,version:"pilot-readiness-v1",id,proofDigest,expectedCases:cases.length,passedCases:cases.length,failedCases:0,skippedCases:0,flakyCases:0});receiptIds.push(id);
   }
   attempts.push({id:attemptId,gateId:gate.id,complete:true,receiptIds});selectedAttempts.push({gateId:gate.id,attemptId});
  }
  await writeEvidence(root,"run.json",pilotRunSchema.parse({version:"pilot-readiness-v1",id:runId,createdAt:now,...source,environmentMarker:environment.environmentId,scopeDigest,attempts,selectedAttempts,receipts}));
  await writeEvidence(root,"execution.json",{version:"pilot-execution-v1",runId,...source,environmentMarker:environment.environmentId,method:"local",state:"pass",expectedCases:total,passedCases:total,suiteEvidenceContract:"pilot-catalog-evidence-index-v1",suiteEvidence});
  if(ci.active){
   const ciRunId=ci.runId,commit=ci.commit;
   if(!ciRunId||!/^\d{1,32}$/.test(ciRunId)||commit!==source.sourceCommit)throw Error('Exact actual CI run and checkout required');
   const binding={ciRunId,commit,runId,sourceDigest:source.sourceDigest},artifacts=[];
   for(const [index,suite] of suites.suites.entries()){
    const name=`ci-suite-${index}.json`,digest=await writeEvidence(root,name,{version:'pilot-ci-v1',...binding,suite:suite.file,result:await readEvidence(root,`suite-${index}.json`)});artifacts.push({name,digest});
   }
   await writeEvidence(root,'ci-index.json',{version:'pilot-ci-index-v1',...binding,artifacts});
   await (await import('./pilot-ci-evidence')).aggregatePilotCiEvidence(root,artifacts,binding,'ci-completed.json');
  }
  process.stdout.write(JSON.stringify({state:"pass",passedCases:total,fullPilotReady:false})+"\n");
 },{priorSchema:55,queryStatistics:true,deadlineMs:5400000});}finally{process.umask(previousUmask);}
}
main().catch(async()=>{if(failureRecord){const {root,...binding}=failureRecord;await writeEvidence(root,`failure-${randomUUID()}.json`,{version:"pilot-execution-v1",...binding,method:"local",state:"fail",safeFailure:"incomplete_execution",stage:failureStage,suiteFile:activeSuite,...pilotCatalogAbortMetadata(cancellationCause(),childProcessError)}).catch(()=>undefined);}process.stderr.write(JSON.stringify({kind:"pilot_catalog_failure",stage:failureStage,suiteFile:activeSuite,...pilotCatalogAbortMetadata(cancellationCause(),childProcessError)})+"\n");process.stderr.write("Pilot catalog failed; no readiness established.\n");process.exitCode=1;});
