import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {withExecutionEvalEnvironment,cleanupPreparedExecutionPublicRuntime} from './execution-eval-environment';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Unpaid artifact check requires empty provider credentials');
try{
 await withExecutionEvalEnvironment(async environment=>{
  await environment.prepareRuntime();
  const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/integration/execution-journey.test.ts','--testTimeout=120000','--hookTimeout=120000'],{env:process.env,encoding:'utf8',timeout:240000,maxBuffer:1024*1024});
  if(result.status!==0){await mkdir('local-artifacts/legacy-parity-artifact',{recursive:true,mode:0o700});await writeFile('local-artifacts/legacy-parity-artifact/failure-private.log',(result.stdout??'')+(result.stderr??''),{mode:0o600});throw Error('Actual scan/extraction and governed publication check failed');}
  console.log(JSON.stringify({kind:'actual-artifact-publication',actualScanner:true,actualParser:true,governedHumanReview:true,executionJourney:true,paidProviderCalls:0}));
 },{deadlineAt:Date.now()+600000});
}finally{await cleanupPreparedExecutionPublicRuntime();}
