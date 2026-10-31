import{spawnSync,execFileSync}from'node:child_process';
import{resolve}from'node:path';
import{featureSourceDigest}from'./execution-source-digest';
import{expansionCiBindingSchema,expansionWebkitProjects,expansionWebkitSpecs,verifyExpansionCiProjects}from'./expansion-webkit-ci';
async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--input'||process.env.GITHUB_ACTIONS!=='true'||process.env.EXPANSION_PROJECT_JOBS_RESULT!=='success')throw Error('Actual complete current CI dependency results and artifact input required');
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:5000}).trim();if(commit!==process.env.GITHUB_SHA)throw Error('Exact CI checkout required');
 const binding=expansionCiBindingSchema.parse({sourceCommit:commit,sourceDigest:await featureSourceDigest('011'),ciRunId:process.env.GITHUB_RUN_ID,ciRunAttempt:process.env.GITHUB_RUN_ATTEMPT}),discoveries:Record<string,unknown>={};
 for(const project of expansionWebkitProjects){const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test',...expansionWebkitSpecs,`--project=${project}`,'--reporter=json','--list','--forbid-only','--retries=0','--repeat-each=1'],{encoding:'utf8',timeout:60000,maxBuffer:10000000,env:{...process.env,AI_GATEWAY_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0'}});if(result.error||result.status!==0)throw Error('Independent complete current project discovery required');discoveries[project]=JSON.parse(result.stdout);}
 const receipt=await verifyExpansionCiProjects(resolve(process.argv[3]),binding,discoveries,process.env.EXPANSION_PROJECT_JOBS_RESULT);if(await featureSourceDigest('011')!==binding.sourceDigest)throw Error('Source changed during CI aggregation');console.log(JSON.stringify(receipt));
}
main().catch(()=>{console.error('Expansion WebKit acceptance incomplete; all four current-source project jobs and cases are required.');process.exitCode=1;});
