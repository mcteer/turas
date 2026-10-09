import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {withGapEnvironment} from './gaps-eval-environment';
import {featureSourceDigest} from './execution-source-digest';
if(process.argv.length!==2)throw Error('Owned gap build accepts no overrides');
const sourceDigest=await featureSourceDigest('012');
await withGapEnvironment(async environment=>{const run=spawnSync('npm',['run','build:check'],{cwd:environment.appRoot,env:process.env,stdio:'inherit',timeout:600000});if(run.error||run.status!==0)throw Error('Owned web/eve build failed');},{deadlineMs:660000});
if(sourceDigest!==await featureSourceDigest('012'))throw Error('Build source changed');
const evidence={gate:'gap-build',sourceDigest,web:true,eve:true,hostedProof:false};await mkdir('local-artifacts/012',{recursive:true,mode:0o700});await writeFile('local-artifacts/012/build.json',JSON.stringify(evidence),{mode:0o600});console.log(JSON.stringify(evidence));
