import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {featureSourceDigest} from "./execution-source-digest";
const gate=process.argv[2],sourceDigest=await featureSourceDigest("013");if(process.argv.length!==3||!process.env.TURAS_013_EXPECTED_SOURCE_DIGEST||sourceDigest!==process.env.TURAS_013_EXPECTED_SOURCE_DIGEST)throw Error("Partner CI source identity mismatch");
function check(value:unknown):asserts value{if(!value)throw Error("Incomplete partner CI evidence: "+gate);}
const root="local-artifacts/013",paths:string[]=[];async function scan(path:string){for(const entry of await readdir(path,{withFileTypes:true})){if(entry.name.startsWith("owned-")||entry.name.startsWith("runtime-"))continue;const file=join(path,entry.name);if(entry.isDirectory())await scan(file);else if(entry.name==="completed.json"||entry.name==="summary.json"||entry.name.endsWith(".summary.json")||entry.name==="build.json")paths.push(file);}}await scan(root);
const evidence=[];for(const path of paths){const data=JSON.parse(await readFile(path,"utf8"));if(data.sourceDigest===sourceDigest)evidence.push({path,data});}
if(gate==="deterministic"){check(evidence.some(({data:d})=>d.acceptance===true&&d.suites===11&&d.passed>0&&d.failed===0&&d.skipped===0));check(evidence.some(({data:d})=>d.web===true&&d.eve===true&&d.hostedProof===false));}
else if(gate==="webkit")check(evidence.some(({data:d})=>d.acceptance===true&&d.journeys===5&&d.projects===4&&d.passed>=20&&d.failed===0&&d.skipped===0));
else if(gate==="recovery")check(evidence.some(({data:d})=>d.results?.length===2&&d.results.every((r:{schema:number;workflowPreserved:boolean;deadlinePreserved:boolean;disabledRetention:boolean;lateAdmissionDenied:boolean})=>r.schema===51&&r.workflowPreserved&&r.deadlinePreserved&&r.disabledRetention&&r.lateAdmissionDenied)));
else if(gate==="benchmark")check(evidence.some(({data:d})=>d.classes?.length===7&&d.results?.length===7&&d.productionQuotas===true&&d.rateResetsDuringMeasurement===0&&d.results.every((r:{operations:number;errors:number;p95Ms:number})=>r.operations===100&&r.errors===0&&r.p95Ms<=2000)));
else if(gate==="regressions")check(evidence.some(({data:d})=>d.manifest?.length===13&&d.results?.length===14&&d.results.every((r:{passed:number;failed:number;skipped:number})=>r.passed>0&&r.failed===0&&r.skipped===0)));
else throw Error("Unknown partner CI gate");console.log(JSON.stringify({gate,sourceDigest,complete:true,hostedProof:false}));
