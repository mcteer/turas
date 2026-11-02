import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify,executionContract,successfulExecution,select,gatePlan,gates,coreJobs,browserFlows} from './change-scope.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('documentation scope covers the whole diff, including deleted/renamed code paths',()=>{
 assert.equal(classify(['README.md','specs/020-eve-runtime-upgrade/validation.md']),'documentation');
 for(const path of ['agent/instructions.md','lib/server/access.ts','migrations/085.cjs','scripts/pilot-suites.json','tests/unit/example.test.ts','package-lock.json','unmapped-file'])assert.equal(classify(['README.md',path]),'full');
});
test('only the explicit CI selector and its wrappers qualify as CI-only',()=>{
 assert.equal(classify(['.github/ci/change-scope.mjs','.github/ci/change-scope.test.mjs','.github/workflows/ci.yml']),'ci-only');
 assert.equal(classify(['.github/workflows/new-workflow.yml']),'full');
});
const original="name: Checks\njobs:\n  unit:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node tests.mjs\n  aggregate:\n    if: always()\n    needs: unit\n    runs-on: ubuntu-latest\n    steps:\n      - run: node verify.mjs\n";
const wrapped=original.replace('  unit:\n','  scope:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node selector.mjs\n  unit:\n    needs: scope\n    if: ${{ needs.scope.outputs.full == \'true\' }}\n').replace('    if: always()\n    needs: unit','    if: ${{ always() && needs.scope.outputs.full == \'true\' }}\n    needs: [scope, unit]')+'  ci-result:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node summary.mjs\n';
test('scheduling wrappers preserve the exact underlying execution contract',()=>assert.equal(executionContract(original),executionContract(wrapped)));
test('command, action, runner, matrix, environment and step-condition changes invalidate reuse',()=>{
 for(const changed of [wrapped.replace('node tests.mjs','echo success'),wrapped.replaceAll('ubuntu-latest','ubuntu-24.04'),wrapped.replace('      - run: node tests.mjs','      - if: false\n        run: node tests.mjs'),wrapped.replace('    steps:\n      - run: node tests.mjs','    env:\n      SKIP: yes\n    steps:\n      - run: node tests.mjs')])assert.notEqual(executionContract(original),executionContract(changed));
});
test('duplicate job definitions fail closed',()=>assert.throws(()=>executionContract(original+'  unit:\n    runs-on: ubuntu-latest\n')));
test('normalization preserves whitespace inside execution commands',()=>assert.notEqual(executionContract(wrapped),executionContract(wrapped.replace('node verify.mjs\n','node verify.mjs \n'))));
test('only complete successful trusted workflow execution qualifies',()=>{
 const run={status:'completed',conclusion:'success',head_sha:'a'.repeat(40),repository:{full_name:'mcteer/turas'}};
 const jobs=Array.from({length:54},()=>({status:'completed',conclusion:'success'})),scope={repo:'mcteer/turas',minimum:54};
 assert.equal(successfulExecution(run,jobs,scope),true);
 for(const conclusion of ['failure','cancelled','skipped',null])assert.equal(successfulExecution({...run,conclusion},jobs,scope),false);
 for(const conclusion of ['failure','cancelled','skipped'])assert.equal(successfulExecution(run,[...jobs.slice(1),{status:'completed',conclusion}],scope),false);
 assert.equal(successfulExecution(run,jobs.slice(1),scope),false);
 assert.equal(successfulExecution({...run,repository:{full_name:'other/repo'}},jobs,scope),false);
});

async function repository(run){
 const previous=process.cwd(),root=mkdtempSync(join(tmpdir(),'turas-ci-scope-'));
 const g=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const commit=()=>{g('add','.');g('commit','-qm','Fixture');return g('rev-parse','HEAD');};
 try{
  g('init','-q');g('config','user.name','Fixture');g('config','user.email','fixture@example.test');
  mkdirSync(join(root,'.github/workflows'),{recursive:true});mkdirSync(join(root,'.github/ci'));mkdirSync(join(root,'app/_components'),{recursive:true});
  for(const name of ['ci.yml','legacy-backend-parity.yml'])writeFileSync(join(root,'.github/workflows',name),original);
  writeFileSync(join(root,'app/_components/example.tsx'),'"use client";\nexport const Example=()=>null;\n');writeFileSync(join(root,'app/style.css'),'body { color: black; }\n');
  writeFileSync(join(root,'app/runtime.ts'),'export const version=0;\n');writeFileSync(join(root,'README.md'),'Initial\n');const base=commit();
  writeFileSync(join(root,'app/runtime.ts'),'export const version=1;\n');const prior=commit();
  for(const name of ['ci.yml','legacy-backend-parity.yml'])writeFileSync(join(root,'.github/workflows',name),wrapped);
  writeFileSync(join(root,'.github/ci/change-scope.mjs'),'// Selector fixture\n');let head=commit();
  process.chdir(root);
  const event=()=>({repository:{full_name:'mcteer/turas'},pull_request:{number:1,base:{sha:base},head:{sha:head}}});
  const api=({job='success',available=true,merged=false,currentBase=base,finalPrHead}={})=>async url=>{
   if(!available)throw Error('Metadata unavailable');
   const main={id:11,status:'completed',conclusion:'success',repository:{full_name:'mcteer/turas'},head_sha:prior,pull_requests:[{number:1,head:{sha:prior},base:{sha:base}}],html_url:'https://github.com/mcteer/turas/actions/runs/11'};
   let value;
   if(url.includes('/workflows/ci.yml/'))value={workflow_runs:[main]};
   else if(url.includes('/workflows/legacy-backend-parity.yml/'))value={workflow_runs:[{...main,id:22}]};
   else if(url.endsWith('/pulls/1'))value={number:1,head:{sha:finalPrHead??(merged?prior:head)},base:{sha:currentBase},merged,merge_commit_sha:merged?head:null};
   else if(url.includes('/runs/11/jobs'))value={jobs:Array.from({length:54},(_,i)=>({status:'completed',conclusion:i===0?job:'success'}))};
   else if(url.includes('/runs/22/jobs'))value={jobs:Array.from({length:8},()=>({status:'completed',conclusion:'success'}))};
   else throw Error('Unexpected metadata request');
   return {ok:true,json:async()=>value};
  };
  await run({root,g,commit,prior,base,event,api,setHead:value=>{head=value;}});
 }finally{process.chdir(previous);rmSync(root,{recursive:true,force:true});}
}
test('CI-only synchronization reuses a complete green ancestor with identical runtime and commands',()=>repository(async f=>{
 const result=await select({event:f.event(),token:'fixture',api:f.api()});assert.equal(result.full,false);assert.equal(result.provenance.sourceCommit,f.prior);
}));
test('latest-commit CI changes cannot hide earlier runtime changes without a green baseline',()=>repository(async f=>{
 for(const job of ['failure','cancelled','skipped'])assert.equal((await select({event:f.event(),token:'fixture',api:f.api({job})})).full,true);
 assert.equal((await select({event:f.event(),token:'fixture',api:f.api({available:false})})).full,true);
}));
test('changed test commands invalidate previously green source',()=>repository(async f=>{
 writeFileSync(join(f.root,'.github/workflows/ci.yml'),wrapped.replace('node tests.mjs','node changed-tests.mjs'));f.setHead(f.commit());
 assert.equal((await select({event:f.event(),token:'fixture',api:f.api()})).full,true);
}));
test('changed runtime invalidates the reusable baseline',()=>repository(async f=>{
 writeFileSync(join(f.root,'app/runtime.ts'),'export const version=2;\n');f.setHead(f.commit());
 assert.equal((await select({event:f.event(),token:'fixture',api:f.api()})).full,true);
}));
test('a later main base cannot borrow successful checks from an earlier merge context',()=>repository(async f=>{
 const testedHead=f.event().pull_request.head.sha;f.g('checkout','--detach',f.base);
 writeFileSync(join(f.root,'app/runtime.ts'),'export const mainVersion=9;\n');const advancedBase=f.commit();f.g('checkout','--detach',testedHead);
 const event=f.event();event.pull_request.base.sha=advancedBase;
 assert.equal((await select({event,token:'fixture',api:f.api({currentBase:advancedBase})})).full,true);
}));
test('actual squash merge can reuse tested equivalent inputs without requiring false ancestry',()=>repository(async f=>{
 const tree=f.g('rev-parse','HEAD^{tree}');const merged=execFileSync('git',['commit-tree',tree,'-p',f.base],{cwd:f.root,encoding:'utf8',input:'Merge fixture\n'}).trim();f.g('reset','--hard',merged);f.setHead(merged);
 const event={repository:{full_name:'mcteer/turas'},before:f.base,after:merged};
 assert.equal((await select({event,token:'fixture',api:f.api({merged:true})})).full,false);
}));
test('merge reuse retains an earlier fully green head across verified CI-only follow-ups',()=>repository(async f=>{
 const finalPrHead=f.event().pull_request.head.sha,tree=f.g('rev-parse','HEAD^{tree}');const merged=execFileSync('git',['commit-tree',tree,'-p',f.base],{cwd:f.root,encoding:'utf8',input:'Merge fixture\n'}).trim();f.g('reset','--hard',merged);f.setHead(merged);
 const result=await select({event:{repository:{full_name:'mcteer/turas'},before:f.base,after:merged},token:'fixture',api:f.api({merged:true,finalPrHead})});assert.equal(result.mode,'none');assert.equal(result.provenance.sourceCommit,f.prior);
}));
test('existing client components and styles select browser/build checks without API reuse',()=>repository(async f=>{
 const base=f.event().pull_request.head.sha;
 writeFileSync(join(f.root,'app/_components/example.tsx'),'"use client";\nexport const Example=()=>"Changed";\n');writeFileSync(join(f.root,'app/style.css'),'body { color: blue; }\n');f.setHead(f.commit());
 const event=f.event();event.pull_request.base.sha=base;
 const result=await select({event,token:'fixture',api:async()=>{throw Error('UI scope needs no inherited proof');}});assert.equal(result.mode,'ui');
}));
test('server components cannot masquerade as client-only scope',()=>repository(async f=>{
 const base=f.event().pull_request.head.sha;
 writeFileSync(join(f.root,'app/_components/example.tsx'),'export const Example=()=>"Server";\n');f.setHead(f.commit());
 const event=f.event();event.pull_request.base.sha=base;
 assert.equal((await select({event,token:'fixture',api:f.api({available:false})})).mode,'full');
}));
test('a client-only follow-up to an earlier tested runtime change still runs fresh browser checks',()=>repository(async f=>{
 writeFileSync(join(f.root,'app/_components/example.tsx'),'"use client";\nexport const Example=()=>"New browser behavior";\n');f.setHead(f.commit());
 const result=await select({event:f.event(),token:'fixture',api:f.api()});assert.equal(result.mode,'ui');assert.equal(result.provenance.sourceCommit,f.prior);
 assert.equal((await select({event:f.event(),token:'fixture',api:f.api({job:'failure'})})).mode,'full');
}));
test('UI mode retains every browser project, core build and aggregate; native/catalog matrices are excluded',()=>{
 const plan=gatePlan('ui');assert.deepEqual(JSON.parse(plan.matrix_pilot_hardening),['webkit']);assert.equal(plan.run_verify,'true');
 assert.equal(plan.run_expansion,'false');assert.equal(plan.run_legacy_chat,'true');assert.equal(plan.run_execution_webkit_complete,'true');
 assert.equal(JSON.parse(plan.matrix_execution).length,4);assert.equal(JSON.parse(plan.matrix_expansion_webkit_projects).length,4);
 assert.deepEqual(JSON.parse(plan.matrix_legacy_chat),browserFlows['legacy-chat']);
 assert.deepEqual(JSON.parse(plan.matrix_acceptance),['webkit',...browserFlows.acceptance]);
 for(const [name,g]of Object.entries(gates))assert.ok(JSON.parse(plan['matrix_'+name.replaceAll('-','_')]).every(v=>v==='_not_selected'||v.startsWith('webkit')||browserFlows[name]?.includes(v)));
});
test('full mode preserves original matrices and none explicitly selects no runtime job',()=>{
 const full=gatePlan('full'),none=gatePlan('none');for(const [name,g]of Object.entries(gates)){const key=name.replaceAll('-','_');assert.deepEqual(JSON.parse(full['matrix_'+key]),g.all);assert.equal(full['run_'+key],'true');assert.equal(none['run_'+key],'false');}
 assert.throws(()=>gatePlan('unknown'));
});
test('checked-in workflows have no unmapped jobs or unsafely skipped UI build/setup steps',()=>{
 const root=new URL('../workflows/',import.meta.url);for(const name of ['ci.yml','legacy-backend-parity.yml']){
  const source=readFileSync(new URL(name,root),'utf8'),body=source.slice(source.indexOf('\njobs:\n')+7);
  for(const m of body.matchAll(/^  ([a-z][a-z0-9-]*):\s*$/gm))assert.ok(['scope','ci-result',...coreJobs,...Object.keys(gates)].includes(m[1]),'Unmapped '+m[1]);
  for(const block of body.split(/^      - /m).slice(1))if(block.includes("if: ${{ needs.scope.outputs.mode != 'ui' }}"))assert.match(block,/run: npm run test:(?:unit|integration|contracts|artifacts|retrieval|plans|staffing)\s*$/m);
 }
});
