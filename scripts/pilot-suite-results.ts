import { z } from "zod";
import suites from "./pilot-suites.json";
const assertion=z.object({title:z.string(),status:z.enum(["passed","failed","pending","skipped","todo","disabled"]),retryReasons:z.array(z.unknown()).optional()});
const resultSchema=z.object({success:z.boolean(),numTotalTests:z.number().int().nonnegative(),numPassedTests:z.number().int().nonnegative(),numFailedTests:z.number().int().nonnegative(),numPendingTests:z.number().int().nonnegative(),testResults:z.array(z.object({assertionResults:z.array(assertion)}))});
export function verifyPilotSuiteResult(file:string,input:unknown) {
 const suite=suites.suites.find(s=>s.file===file);if(!suite)throw new Error("Unknown pilot suite");
 const result=resultSchema.parse(input),assertions=result.testResults.flatMap(s=>s.assertionResults);
 const titles=assertions.map(a=>a.title);
 if(suite.cases.length!==suite.expectedCases||new Set(suite.cases).size!==suite.cases.length||assertions.length!==suite.expectedCases||new Set(titles).size!==titles.length||suite.cases.some(title=>!titles.includes(title))||
   result.numTotalTests!==suite.expectedCases||result.numPassedTests!==suite.expectedCases||result.numFailedTests||result.numPendingTests||!result.success||assertions.some(a=>a.status!=="passed"||(a.retryReasons?.length??0)>0))throw new Error("Pilot suite incomplete or unstable");
 return {expectedCases:suite.expectedCases,passedCases:result.numPassedTests,failedCases:0,skippedCases:0,flakyCases:0};
}
