import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync,readdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Only for a newly created disposable app, never the retained development app.
 * Keep custody outside .eve: Eve removes its own intent on successful shutdown. */
export function ownedEveSandboxes(appRoot:string,environment:NodeJS.ProcessEnv){
 const app=resolve(appRoot),root=dirname(app),eve=join(app,'.eve');
 if(app===process.cwd()||!/^app$/.test(app.slice(root.length+1)))throw Error('Disposable Eve app required');
 const ledger=join(root,'eve-sandbox-runs.json'),runId=randomUUID(),runs=new Set<string>([runId]);
 let retired=false,captureFailure:unknown;
 function save(){
  writeFileSync(ledger+'.tmp',JSON.stringify({version:1,appRoot:app,runIds:[...runs]}),{mode:0o600});
  renameSync(ledger+'.tmp',ledger);
 }
 // The caller has just made this exclusive fixture root with mkdtemp.
 if(existsSync(ledger))throw Error('Disposable Eve custody already exists');
 save();
 function capture(){
  try{
   if(!existsSync(eve))return;
   if(!lstatSync(eve).isDirectory()||lstatSync(eve).isSymbolicLink())throw Error('Disposable Eve state directory changed');
   for(const name of readdirSync(eve)){
    if(!name.startsWith('dev-cleanup-intent.')||!name.endsWith('.json'))continue;
    const id=name.slice('dev-cleanup-intent.'.length,-'.json'.length),file=join(eve,name),stat=lstatSync(file);
    if(!uuid.test(id)||!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('Disposable Eve ownership invalid');
    let record:{runId?:unknown;ownerPid?:unknown};
    try{record=JSON.parse(readFileSync(file,'utf8'));}catch{throw Error('Disposable Eve ownership unreadable');}
    if(!record||record.runId!==id||!Number.isSafeInteger(record.ownerPid)||Number(record.ownerPid)<=0)throw Error('Disposable Eve ownership invalid');
    if(!runs.has(id)){runs.add(id);if(runs.size>256)throw Error('Disposable Eve run limit exceeded');save();}
   }
  }catch(error){captureFailure=error;throw error;}
 }
 function docker(args:string[],deadline:number){
  if(Date.now()>=deadline)throw Error('Disposable Eve cleanup deadline exceeded');
  const result=spawnSync('docker',args,{env:environment,encoding:'utf8',timeout:Math.min(10000,deadline-Date.now()),maxBuffer:1048576});
  if(result.error||result.status!==0)throw Error('Disposable Eve Docker '+args[0]+' failed; custody retained');
  return result.stdout.trim();
 }
 return {
  // Direct local production servers need a run tag too. Eve dev creates its own
  // generation ID, captured from its intent instead of assuming this is reused.
  environment(){retired=false;return {EVE_DEVELOPMENT_SANDBOX_RUN_ID:runId};},
  capture,
  async retire(stopProcesses:()=>Promise<void>){
   retired=false;const failures:unknown[]=[];
   try{capture();}catch(error){failures.push(error);}
   // A capture failure must never prevent process retirement.
   try{await stopProcesses();}catch(error){failures.push(error);}
   try{capture();}catch(error){failures.push(error);}
   if(captureFailure&&!failures.includes(captureFailure))failures.push(captureFailure);
   if(failures.length)throw new AggregateError(failures,'Disposable Eve retirement or custody unverified');
   retired=true;
  },
  remove(){
   if(!retired||captureFailure)throw Error('Disposable Eve process retirement required');
   const deadline=Date.now()+60000,failures:unknown[]=[];
   for(const id of runs)try{
    const filters=['--filter','label=eve.sandbox=1','--filter',`label=eve.sandbox.tag.devRunId=${id}`];
    const list=()=>{
     const text=docker(['ps','--all','--quiet','--no-trunc',...filters],deadline),ids=text?text.split(/\s+/):[];
     if(ids.length>1024||ids.some(value=>!/[a-f0-9]{64}/.test(value)||value.length!==64))throw Error('Disposable Eve inventory invalid');
     return ids;
    };
    const ids=list();
    // Labels cannot be changed on an existing container. Full IDs avoid name
    // reuse; never prune globally or remove any volumes, networks or images.
    for(let offset=0;offset<ids.length;offset+=64)docker(['rm','--force',...ids.slice(offset,offset+64)],deadline);
    if(list().length)throw Error('Disposable Eve sandbox removal unverified');
   }catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'Disposable Eve cleanup failed; custody retained');
  },
 };
}
