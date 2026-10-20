import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {join,basename,resolve} from 'node:path';
import {z} from 'zod';
import {pilotRunSchema,verifyPilotProof,type PilotRun} from '../lib/contracts/pilot-readiness';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {assessPilotLoad,pilotLoadClasses,type LoadSample} from '../lib/server/operations/load-measurements';
import {executionUiDiscovery,verifyExecutionUiReport} from './execution-ui-report';
import {pilotCatalog} from './pilot-catalog';import suites from './pilot-suites.json';
import {readBoundedEvidence,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';
const validatedAuxiliary = new WeakSet<object>();
export type VerifiedPilotAuxiliaryEvidence = Readonly<{gateId:string;runId:string;environmentMarker:string;sourceCommit:string;sourceDigest:string;catalogDigest:string;scopeDigest:string;cases:readonly string[];artifactDigests:readonly string[]}>;
export function isVerifiedPilotAuxiliaryEvidence(value:unknown,run:PilotRun,gateId:string):value is VerifiedPilotAuxiliaryEvidence {
 if(!value||typeof value!=='object'||!validatedAuxiliary.has(value))return false;
 const proof=value as VerifiedPilotAuxiliaryEvidence;return proof.gateId===gateId&&proof.runId===run.id&&(['environmentMarker','sourceCommit','sourceDigest','catalogDigest','scopeDigest'] as const).every(key=>proof[key]===run[key]);
}
const indexSchema=z.strictObject({contract:z.literal('pilot-owned-auxiliary-v1'),runId:z.uuid(),environmentMarker:z.string().regex(/^test-pilot-[a-f0-9]{12}$/),sourceCommit:z.string(),sourceDigest:z.string(),catalogDigest:z.string(),scopeDigest:z.string(),gateId:z.enum(['G10','G12']),artifacts:z.array(z.strictObject({name:z.string(),digest:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(16)});
export async function writePilotAuxiliaryRun(input:{directory:string;environmentMarker:string;source:{sourceCommit:string;sourceDigest:string;catalogDigest:string};startedAt:string;completedAt:string;gateId:'G10'|'G12';caseIds:string[];artifactNames:string[]}){
 const id=randomUUID(),attemptId=randomUUID(),artifacts=[];for(const name of input.artifactNames)artifacts.push({name,digest:evidenceDigest(await readFile(join(input.directory,name)))});
 const scopeDigest=evidenceDigest(JSON.stringify({contract:'pilot-owned-auxiliary-scope-v1',runId:id,environmentMarker:input.environmentMarker,...input.source,gateId:input.gateId,artifacts})),gate=pilotCatalog.gates.find(row=>row.id===input.gateId)!,receipts=[];
 for(const role of gate.requiredRoles){const receiptId=randomUUID(),binding={runId:id,attemptId,gateId:input.gateId,method:'local' as const,role,workspaceId:DEMO_IDS.workspace,environmentMarker:input.environmentMarker,...input.source,scopeDigest,startedAt:input.startedAt,completedAt:input.completedAt,state:'pass' as const},proofDigest=await writeEvidence(input.directory,receiptId+'.json',{version:'pilot-proof-v1',receiptId,...binding,cases:input.caseIds.map(id=>({id,state:'pass',flaky:false}))});receipts.push({version:'pilot-readiness-v1' as const,id:receiptId,...binding,expectedCases:input.caseIds.length,passedCases:input.caseIds.length,failedCases:0,skippedCases:0,flakyCases:0,proofDigest});}
 const run=pilotRunSchema.parse({version:'pilot-readiness-v1',id,createdAt:input.startedAt,environmentMarker:input.environmentMarker,...input.source,scopeDigest,attempts:[{id:attemptId,gateId:input.gateId,complete:true,receiptIds:receipts.map(row=>row.id)}],selectedAttempts:[{gateId:input.gateId,attemptId}],receipts});
 await writeEvidence(input.directory,'auxiliary-index.json',indexSchema.parse({contract:'pilot-owned-auxiliary-v1',runId:id,environmentMarker:input.environmentMarker,...input.source,scopeDigest,gateId:input.gateId,artifacts}));await writeEvidence(input.directory,'run.json',run);return run;
}
/** Recompute typed workload/UI assessments. An arbitrary positive case count is
 * insufficient when the gate has no frozen unit-test case list. */
export async function verifyPilotAuxiliaryEvidence(directory:string,run:PilotRun){
 const index=indexSchema.parse(await readEvidence(directory,'auxiliary-index.json'));for(const key of ['environmentMarker','sourceCommit','sourceDigest','catalogDigest','scopeDigest'] as const)if(index[key]!==run[key])throw Error('Auxiliary scope/source differs');if(index.runId!==run.id)throw Error('Auxiliary run differs');
 if(index.scopeDigest!==evidenceDigest(JSON.stringify({contract:'pilot-owned-auxiliary-scope-v1',runId:index.runId,environmentMarker:index.environmentMarker,sourceCommit:index.sourceCommit,sourceDigest:index.sourceDigest,catalogDigest:index.catalogDigest,gateId:index.gateId,artifacts:index.artifacts})))throw Error('Original auxiliary scope differs');
 const values=new Map<string,unknown>();for(const ref of index.artifacts){if(values.has(ref.name))throw Error('Duplicate auxiliary artifact');values.set(ref.name,await readBoundedEvidence(directory,ref.name,67108864,ref.digest));}
 const checkSource=(raw:unknown)=>{const value=z.object({sourceCommit:z.string(),sourceDigest:z.string(),catalogDigest:z.string(),environmentMarker:z.string()}).parse(raw);for(const key of ['sourceCommit','sourceDigest','catalogDigest','environmentMarker'] as const)if(value[key]!==run[key])throw Error('Auxiliary capture source differs');};let caseIds:string[]=[];
 if(index.gateId==='G10'){
  if(JSON.stringify([...values.keys()].sort())!==JSON.stringify(['samples.json','measurements.json','completed.json'].sort()))throw Error('Complete original load artifacts required');
  checkSource(values.get('measurements.json'));checkSource(values.get('completed.json'));const metrics=z.object({sessions:z.number(),internalSessions:z.number(),assignedPartnerSessions:z.number(),customers:z.number(),eligiblePassages:z.number(),warmupElapsedMs:z.number(),measurementElapsedMs:z.number(),totalElapsedMs:z.number(),quotaResets:z.number(),providerCalls:z.number(),queryCounts:z.record(z.string(),z.number()),pass:z.literal(true)}).parse(values.get('measurements.json'));
  const samples=z.array(z.unknown()).max(1000000).parse(values.get('samples.json')) as LoadSample[],assessment=assessPilotLoad(samples,metrics);if(!assessment.pass||!z.object({pass:z.literal(true),hostedProof:z.literal(false)}).safeParse(values.get('completed.json')).success)throw Error('Original full workload thresholds incomplete');caseIds=pilotLoadClasses.map(id=>'pilot.load.'+id);
 }else{
  const expected=['summary.json',...suites.ui.projects.flatMap(project=>[project+'-discovery.json',project+'.json'])];if(values.size!==expected.length||expected.some(name=>!values.has(name)))throw Error('Complete original four-project UI artifacts required');checkSource(values.get('summary.json'));z.object({passed:z.literal(40),failed:z.literal(0),skipped:z.literal(0),projects:z.literal(4),acceptance:z.literal(true)}).parse(values.get('summary.json'));
  for(const project of suites.ui.projects){const discovery=values.get(project+'-discovery.json'),root=z.object({config:z.object({rootDir:z.string()})}).parse(discovery).config.rootDir,files=suites.ui.files.map(file=>resolve(root,basename(file)));
   const titles:Record<string,string[]>={};function visit(rows:{specs?:{file:string;title:string}[];suites?:typeof rows}[]){for(const row of rows){for(const spec of row.specs??[])(titles['tests/ui/'+basename(spec.file)]??=[]).push(spec.title);visit(row.suites??[]);}}visit((discovery as {suites:Parameters<typeof visit>[0]}).suites);
   for(const file of suites.ui.files)if(JSON.stringify([...(titles[file]??[])].sort())!==JSON.stringify([...suites.ui.cases[file as keyof typeof suites.ui.cases]].sort()))throw Error('Frozen UI named inventory differs');
   const cases=executionUiDiscovery(discovery,files,project);if(cases.length!==10)throw Error('Complete UI project required');verifyExecutionUiReport(values.get(project+'.json'),cases);caseIds.push(...cases.map(row=>'pilot.ui.'+project+'.'+row.id));
  }
 }
 const selected=run.selectedAttempts.find(row=>row.gateId===index.gateId),attempt=run.attempts.find(row=>row.id===selected?.attemptId);if(!attempt)throw Error('Original auxiliary selected attempt required');
 for(const receipt of run.receipts.filter(row=>attempt.receiptIds.includes(row.id))){const proof=verifyPilotProof(receipt,await readEvidence(directory,receipt.id+'.json',receipt.proofDigest));if(receipt.state!=='pass'||proof.cases.length!==caseIds.length||caseIds.some(id=>!proof.cases.some(row=>row.id===id&&row.state==='pass'&&!row.flaky)))throw Error('Auxiliary proof does not match actual typed capture');}
 const verified=Object.freeze({gateId:index.gateId,runId:run.id,environmentMarker:run.environmentMarker,sourceCommit:run.sourceCommit,sourceDigest:run.sourceDigest,catalogDigest:run.catalogDigest,scopeDigest:run.scopeDigest,cases:Object.freeze(caseIds),artifactDigests:Object.freeze(index.artifacts.map(row=>row.digest))});validatedAuxiliary.add(verified);return verified;
}
