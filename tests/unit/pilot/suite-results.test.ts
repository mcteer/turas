import { expect,it } from "vitest";
import { verifyPilotSuiteResult } from "../../../scripts/pilot-suite-results";
import suites from "../../../scripts/pilot-suites.json";
function fixture(){const suite=suites.suites[0];return {file:suite.file,result:{success:true,numTotalTests:suite.expectedCases,numPassedTests:suite.expectedCases,numFailedTests:0,numPendingTests:0,testResults:[{assertionResults:suite.cases.map(title=>({title,status:"passed",retryReasons:[]}))}]}};}
it("checks the complete named suite inventory",()=>{const {file,result}=fixture();expect(verifyPilotSuiteResult(file,result).passedCases).toBe(22);});
it("rejects an unknown registered suite",()=>{expect(()=>verifyPilotSuiteResult("tests/unit/foreign.test.ts",fixture().result)).toThrow("Unknown pilot suite");});
it("rejects a partial case list despite a successful exit",()=>{const {file,result}=fixture();result.testResults[0].assertionResults.pop();expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects duplicate case titles",()=>{const {file,result}=fixture();result.testResults[0].assertionResults[1].title=result.testResults[0].assertionResults[0].title;expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects skipped cases despite successful summary counts",()=>{const {file,result}=fixture();result.testResults[0].assertionResults[0].status="skipped";expect(()=>verifyPilotSuiteResult(file,result)).toThrow("incomplete");});
it("rejects a retried pass",()=>{const {file,result}=fixture();const retried={...result,testResults:[{assertionResults:result.testResults[0].assertionResults.map((a,i)=>i===0?{...a,retryReasons:["synthetic retry"]}:a)}]};expect(()=>verifyPilotSuiteResult(file,retried)).toThrow("unstable");});
