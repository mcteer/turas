import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withPilotEnvironment} from './pilot-environment';

function docker(args:string[]){
 const result=spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1048576});
 if(result.error||result.status!==0)throw Error('Sandbox cleanup check Docker '+args[0]+' failed');
 return result.stdout.trim();
}
const image=docker(['image','ls','--filter','reference=eve-sandbox-template:*','--format','{{.ID}}']).split('\n')[0];
if(!/^sha256:[a-f0-9]+$|^[a-f0-9]{12,64}$/.test(image))throw Error('An existing Eve sandbox template is required');
const created:string[]=[],foreignRun=randomUUID(),failure=Error('Controlled failed check');
const containers=(run:string)=>docker(['ps','--all','--quiet','--no-trunc','--filter','label=eve.sandbox=1','--filter',`label=eve.sandbox.tag.devRunId=${run}`]).split('\n').filter(Boolean);
let ownedRun='',sibling='',nonSandbox='';
function create(run:string,sandbox=true){
 const id=docker(['create','--network','none','--label',`eve.sandbox=${sandbox?'1':'0'}`,'--label',`eve.sandbox.tag.devRunId=${run}`,image,'sleep','120']);
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('Sandbox cleanup check container ID invalid');created.push(id);return id;
}
try{
 let observed:unknown;
 try{await withPilotEnvironment(async environment=>{
  await environment.startNative();
  const state=join(environment.appRoot,'.eve');
  const files=(await readdir(state)).filter(name=>/^dev-cleanup-intent\.[a-f0-9-]{36}\.json$/.test(name));
  if(files.length!==1)throw Error('Expected one real Eve development ownership record');
  ownedRun=JSON.parse(await readFile(join(state,files[0]),'utf8')).runId;
  if(!/^[a-f0-9-]{36}$/.test(ownedRun))throw Error('Real Eve ownership invalid');
  const stopped=create(ownedRun),running=create(ownedRun);sibling=create(foreignRun);nonSandbox=create(ownedRun,false);
  docker(['start',stopped,running]);docker(['stop','--time','1',stopped]);
  await environment.stop();
  const retained=containers(ownedRun);
  if(!retained.includes(stopped)||!retained.includes(running))throw Error('Intermediate stop removed restart state');
  // Exercise the actual failed-check finalizer, including the now-removed Eve
  // intent. No model calls, customer data or retained development state are used.
  throw failure;
 },{deadlineMs:180000});}catch(error){observed=error;}
 if(observed!==failure)throw observed??Error('Expected the controlled check failure');
 if(containers(ownedRun).length||!containers(foreignRun).includes(sibling))throw Error('Exact sandbox cleanup failed');
 docker(['inspect','--format','{{.Id}}',nonSandbox]);
 console.log('Real Eve shutdown and failed-check teardown passed: owned running/stopped containers deleted; foreign run and non-sandbox container preserved.');
}finally{
 // Test-only safety net: remove only full IDs returned by this invocation.
 // The success assertion above happens first, so this cannot hide a leak.
 for(const id of created)try{docker(['rm','--force',id]);}catch{/* Missing IDs are expected; require actual absence below. */}
 const remaining=docker(['ps','--all','--quiet','--no-trunc']).split('\n').filter(id=>created.includes(id));
 if(remaining.length)throw Error('Sandbox cleanup check left owned containers');
}
