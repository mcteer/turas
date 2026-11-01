import {readFile,readdir,realpath,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const fields=['runId','stepId','waitId','status','workflowName','stepName','attempt','startedAt','createdAt','updatedAt','completedAt','resumeAt','retryAt','deploymentId','specVersion'];
/** Read-only, metadata-only diagnostics for an owned synthetic runtime. Never
 * retain step inputs/outputs, auth attributes, hook tokens or model contents. */
export async function captureOwnedWorkflowMetadata(appRoot:string,runIds:readonly string[],destination:string){
 const root=await realpath(appRoot),base=await realpath(resolve('local-artifacts/010'));
 if(!root.startsWith(base+'/eval-')||!root.endsWith('/app')||runIds.length>20)throw Error('Owned workflow diagnostics required');
 const data=await realpath(join(root,'.eve/.workflow-data'));
 if(!data.startsWith(root+'/.eve/'))throw Error('Indirect workflow state denied');
 const records:unknown[]=[];let remaining=64*1024*1024;
 async function read(path:string,kind:string){
  try{
   const info=await stat(path);if(!info.isFile()||info.size>remaining||info.size>32*1024*1024){records.push({kind,oversized:true});return;}
   remaining-=info.size;
   const value=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;
   const selected:Record<string,unknown>={kind};
   for(const key of fields){const item=value[key];if(typeof item==='string'&&item.length<=500||typeof item==='number'||typeof item==='boolean')selected[key]=item;}
   if(value.error&&typeof value.error==='object'){
    const error=value.error as Record<string,unknown>;selected.error=Object.fromEntries(['name','code'].flatMap(key=>typeof error[key]==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(error[key])?[[key,error[key]]]:[]));
   }
   selected.metadataKeys=Object.keys(value).filter(key=>!['input','output','attributes','executionContext'].includes(key));records.push(selected);
  }catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;records.push({kind,missing:true});}
 }
 for(const runId of runIds){
  if(!/^wrun_[A-Za-z0-9_-]+$/.test(runId))throw Error('Invalid owned run ID');
  await read(join(data,'runs',runId+'.json'),'run');
  const steps=join(data,'steps',runId);
  for(const file of (await readdir(steps).catch(()=>[])).slice(0,100)){
   if(!/^[A-Za-z0-9_.-]+\.json$/.test(file))continue;
   await read(join(steps,file),'step');
  }
 }
 await writeFile(destination,JSON.stringify({records},null,2),{mode:0o600});
}

/** Synthetic owned copies only: expose render identities for exact replay joins. */
export async function installOwnedChatIdentityDiagnostics(appRoot:string){
 const root=await realpath(appRoot),base=await realpath(resolve('local-artifacts'));
 if(!['008','010'].some(feature=>root.startsWith(base+'/'+feature+'/eval-'))||!root.endsWith('/app'))throw Error('Owned chat diagnostics required');
 const path=join(root,'app/_components/agent-chat.tsx');let source=await readFile(path,'utf8');
 source=source.replace("key={'retained:'+message.id}",`data-owned-kind="retained" data-owned-id={message.id} key={'retained:'+message.id}`)
  .replaceAll('key={message.id}>',`data-owned-kind="native" data-owned-id={message.id} key={message.id}>`);
 await writeFile(path,source,{mode:0o600});
}
