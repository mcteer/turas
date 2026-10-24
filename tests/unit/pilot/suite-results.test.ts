import { expect,it } from "vitest";
import { verifyPilotSuiteResult } from "../../../scripts/pilot-suite-results";
import {assertPilotCatalogInventory,pilotCatalog} from "../../../scripts/pilot-catalog";
import {pilotSuiteCaseIds} from "../../../scripts/pilot-suite-results";
import suites from "../../../scripts/pilot-suites.json";
function fixture(){const suite=suites.suites[0];return {file:suite.file,result:{success:true,numTotalTests:suite.expectedCases,numPassedTests:suite.expectedCases,numFailedTests:0,numPendingTests:0,testResults:[{assertionResults:suite.cases.map(title=>({title,status:"passed",retryReasons:[]}))}]}};}
it("checks the complete named suite inventory",()=>{
 const {file,result}=fixture();expect(verifyPilotSuiteResult(file,result).passedCases).toBe(22);
 expect(()=>assertPilotCatalogInventory(pilotCatalog)).not.toThrow();
 const stale=structuredClone(pilotCatalog),gate=stale.gates.find(g=>g.id==='G06')!;
 gate.localCaseIds.push(...Array.from({length:6},(_,i)=>'unit.managed-edge-transport.'+String(i+6).padStart(3,'0')));
 expect(()=>assertPilotCatalogInventory(stale)).toThrow('unregistered case: G06');
 const duplicate=structuredClone(pilotCatalog);duplicate.gates[0].localCaseIds.push(duplicate.gates[0].localCaseIds[0]);
 expect(()=>assertPilotCatalogInventory(duplicate)).toThrow('Duplicate pilot catalog case ID');
 const edge=suites.suites.find(s=>s.file==='tests/unit/pilot/managed-edge-transport.test.ts')!;
 expect(pilotSuiteCaseIds(edge.file,edge.expectedCases)).toEqual(Array.from({length:5},(_,i)=>'unit.managed-edge-transport.'+String(i+1).padStart(3,'0')));
 expect(()=>assertPilotCatalogInventory(pilotCatalog,{suites:suites.suites.filter(s=>s!==edge)})).toThrow('unregistered case: G06');
 expect(()=>assertPilotCatalogInventory(pilotCatalog,{suites:[...suites.suites,edge]})).toThrow('Invalid pilot suite inventory');
 const alias={...edge,file:'tests/unit/managed-edge-transport.test.ts'};
 expect(()=>assertPilotCatalogInventory(pilotCatalog,{suites:[...suites.suites,alias]})).toThrow('Ambiguous pilot suite case ID');
 expect(()=>assertPilotCatalogInventory(pilotCatalog,{suites:[{...edge,expectedCases:6}]})).toThrow('Invalid pilot suite inventory');
});
it("rejects an unknown registered suite",()=>{expect(()=>verifyPilotSuiteResult("tests/unit/foreign.test.ts",fixture().result)).toThrow("Unknown pilot suite");});
it("rejects a partial case list despite a successful exit",()=>{const {file,result}=fixture();result.testResults[0].assertionResults.pop();expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects duplicate case titles",()=>{const {file,result}=fixture();result.testResults[0].assertionResults[1].title=result.testResults[0].assertionResults[0].title;expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects skipped cases despite successful summary counts",()=>{const {file,result}=fixture();result.testResults[0].assertionResults[0].status="skipped";expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects a retried pass",()=>{const {file,result}=fixture();const retried={...result,testResults:[{assertionResults:result.testResults[0].assertionResults.map((a,i)=>i===0?{...a,retryReasons:["synthetic retry"]}:a)}]};expect(()=>verifyPilotSuiteResult(file,retried)).toThrow("unstable");});

it("aggregates the complete current CI catalog beyond 128 suites and rejects omissions duplicates and foreign source",async()=>{
 const {mkdtemp,rm,realpath}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {randomUUID}=await import('node:crypto'),{writeEvidence,readEvidence}=await import('../../../scripts/pilot-evidence'),{aggregatePilotCiEvidence}=await import('../../../scripts/pilot-ci-evidence');
 const root=await mkdtemp(join(await realpath(tmpdir()),'pilot-ci-catalog-'));
 const binding={ciRunId:'123',commit:'a'.repeat(40),runId:randomUUID(),sourceDigest:'b'.repeat(64)};
 try{
  expect(suites.suites.length).toBeGreaterThan(128);const artifacts=[];
  for(const [i,suite] of suites.suites.entries()){
   const result={success:true,numTotalTests:suite.expectedCases,numPassedTests:suite.expectedCases,numFailedTests:0,numPendingTests:0,testResults:[{assertionResults:suite.cases.map(title=>({title,status:'passed',retryReasons:[]}))}]};
   const name=`suite-${i}.json`,digest=await writeEvidence(root,name,{version:'pilot-ci-v1',...binding,suite:suite.file,result});artifacts.push({name,digest});
  }
  const digest=await aggregatePilotCiEvidence(root,artifacts,binding,'complete.json');
  expect(await readEvidence(root,'complete.json',digest)).toMatchObject({passedCases:suites.suites.reduce((n,s)=>n+s.expectedCases,0)});
  await expect(aggregatePilotCiEvidence(root,artifacts.slice(1),binding,'partial.json')).rejects.toThrow('Incomplete CI catalog');
  await expect(aggregatePilotCiEvidence(root,[...artifacts,artifacts[0]],binding,'duplicate.json')).rejects.toThrow('Duplicate CI suite');
  await expect(aggregatePilotCiEvidence(root,artifacts,{...binding,commit:'c'.repeat(40)},'foreign.json')).rejects.toThrow('Foreign CI artifact');
 }finally{await rm(root,{recursive:true,force:true});}
});
