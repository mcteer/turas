import {runPilotQualityCommand} from './pilot-quality-command';
import {processFailureMetadata} from './ci-process-diagnostics';

/** Early diagnostic only. The complete catalog remains the acceptance producer. */
async function main(){
 let output='';
 try{
  const result=await runPilotQualityCommand({command:process.execPath,args:['--import','tsx','node_modules/vitest/vitest.mjs','run','tests/integration/pilot/evaluation-source.test.ts','--reporter=json','--outputFile=local-artifacts/016/evaluation-source-preflight.json'],cwd:process.cwd(),environment:process.env,deadline:Date.now()+720000,onOutput:bytes=>{output=(output+bytes.toString()).slice(-131072);}});
  console.info(JSON.stringify({kind:'evaluation_source_preflight',...processFailureMetadata({...result,stderrTail:output})}));
  if(result.code!==0||result.signal||result.deadlineExpired)process.exitCode=1;
 }catch(error){
  console.info(JSON.stringify({kind:'evaluation_source_preflight',...processFailureMetadata({stderrTail:output}),ownedCommandFailed:true}));
  process.exitCode=1;
 }
}
void main();
