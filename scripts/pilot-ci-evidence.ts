import { z } from "zod";
import suiteCatalog from "./pilot-suites.json";
const registeredSuites=new Set(suiteCatalog.suites.map(suite=>suite.file));
import { readEvidence, writeEvidence } from "./pilot-evidence";
import { verifyPilotSuiteResult } from "./pilot-suite-results";
import { pilotCommit, pilotDigest } from "../lib/contracts/pilot-readiness";
const artifactSchema=z.strictObject({version:z.literal("pilot-ci-v1"),ciRunId:z.string().regex(/^[0-9]{1,32}$/),commit:pilotCommit,runId:z.uuid(),sourceDigest:pilotDigest,
 suite:z.string().refine(file=>registeredSuites.has(file),"Registered pilot CI suite required"),result:z.unknown()});
/** Explicit artifact list only. Transport/authentication of CI artifacts is separate. */
export async function aggregatePilotCiEvidence(root:string,artifacts:{name:string;digest:string}[],binding:{ciRunId:string;commit:string;runId:string;sourceDigest:string},outputName:string) {
 if(!artifacts.length||artifacts.length>256)throw new Error("Explicit CI artifacts required");
 const seen=new Set<string>();const results=[];
 for(const file of artifacts){
  const artifact=artifactSchema.parse(await readEvidence(root,file.name,file.digest));
  for(const key of ["ciRunId","commit","runId","sourceDigest"] as const)if(artifact[key]!==binding[key])throw new Error("Foreign CI artifact");
  if(seen.has(artifact.suite))throw new Error("Duplicate CI suite");seen.add(artifact.suite);
  results.push(verifyPilotSuiteResult(artifact.suite,artifact.result));
 }
 // A subset is retained as input diagnostics, never a complete G14 acceptance.
 const inventory=suiteCatalog.suites;
 if(inventory.some(s=>!seen.has(s.file)))throw new Error("Incomplete CI catalog");
 return writeEvidence(root,outputName,{version:"pilot-ci-v1",...binding,method:"ci",expectedCases:results.reduce((n,r)=>n+r.expectedCases,0),passedCases:results.reduce((n,r)=>n+r.passedCases,0)});
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pilotSource } from "./pilot-source";
const indexSchema=z.strictObject({version:z.literal("pilot-ci-index-v1"),ciRunId:z.string().regex(/^[0-9]{1,32}$/),commit:pilotCommit,runId:z.uuid(),sourceDigest:pilotDigest,
 artifacts:z.array(z.strictObject({name:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}\.json$/),digest:pilotDigest})).min(1).max(256)});
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=="--input")throw new Error("Explicit private CI index required");
 const input=path.resolve(args[1]),root=path.dirname(input),index=indexSchema.parse(await readEvidence(root,path.basename(input)));
 const source=await pilotSource();if(index.commit!==source.sourceCommit||index.sourceDigest!==source.sourceDigest)throw new Error("CI source mismatch");
 await aggregatePilotCiEvidence(root,index.artifacts,index,`ci-${index.runId}.json`);
 process.stdout.write(JSON.stringify({state:"pass",method:"ci",releaseApproved:false})+"\n");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write("CI evidence invalid or incomplete.\n");process.exitCode=2;});
