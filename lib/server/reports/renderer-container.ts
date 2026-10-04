import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute } from 'node:path';
import { lstat } from 'node:fs/promises';
const execute = promisify(execFile);
function mount(path: string, target: string, readonly: boolean): string {
 if (!isAbsolute(path) || /[\x00-\x1f,]/.test(path)) throw new Error('Invalid report renderer mount');
 return `type=bind,src=${path},dst=${target}${readonly?',readonly':''}`;
}
/** Only owned scratch directories and a content-addressed local image may enter this boundary. */
export async function runReportRenderer(input: {image:string;inputDirectory:string;outputDirectory:string;operation?:'render'|'office_check';signal?:AbortSignal}):Promise<void> {
 if(input.operation!==undefined && input.operation!=='render' && input.operation!=='office_check')throw new Error('Invalid renderer operation');
 if(!process.getuid || !process.getgid || process.getuid()===0)throw new Error('Report renderer requires a non-root owner');
 if(input.inputDirectory===input.outputDirectory)throw new Error('Separate renderer mounts required');
 if (!/^sha256:[a-f0-9]{64}$/.test(input.image)) throw new Error('Renderer requires an immutable image identifier');
 for (const path of [input.inputDirectory,input.outputDirectory]) {
  const info=await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)!==0 || info.uid!==process.getuid?.()) throw new Error('Renderer scratch ownership invalid');
 }
 const owner=randomUUID(),name=`turas-report-${owner}`;
 const args=['run','--rm','--name',name,'--label',`turas.report.owner=${owner}`,'--network','none','--ipc','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user',`${process.getuid?.()}:${process.getgid?.()}`,'--memory','2g','--memory-swap','2g','--cpus','2','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,size=512m','--env','HOME=/tmp/report-home','--mount',mount(input.inputDirectory,'/input',true),'--mount',mount(input.outputDirectory,'/output',false),...(input.operation==='office_check'?['--entrypoint','/usr/bin/python3']:[]),input.image,...(input.operation==='office_check'?['/app/report-renderer/office-check.py','/input/report.pptx','/output']:[])];
 try { await execute('docker',args,{timeout:120000,maxBuffer:65536,signal:input.signal}); }
 catch { throw new Error('Report renderer failed or exceeded its deadline'); }
 finally {
  // Killing the Docker client does not kill its container. Inspect the exact ownership label first.
  let label:string|undefined;
  try {
   const {stdout}=await execute('docker',['inspect','--format','{{index .Config.Labels "turas.report.owner"}}',name],{timeout:5000,maxBuffer:4096});
   label=stdout.trim();
  } catch(error) {
   if(!/No such (?:object|container)/i.test(String((error as {stderr?:string}).stderr)))throw new Error('Unable to verify renderer shutdown');
  }
  if(label!==undefined){
   if(label!==owner)throw new Error('Renderer container ownership changed');
   try{await execute('docker',['rm','--force',name],{timeout:10000,maxBuffer:4096});}catch{throw new Error('Renderer shutdown failed');}
  }
 }
}
