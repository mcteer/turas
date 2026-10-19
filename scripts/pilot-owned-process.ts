import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
export type OwnedProcessRetirement=Readonly<{contract:'pilot-owned-process-retirement-v1'}>;
const retirements=new WeakMap<object,()=>Promise<void>>();
export function requireOwnedProcessRetirement(value:OwnedProcessRetirement){if(!retirements.has(value))throw Error('Actual owned process retirement required');}
export function retireOwnedProcess(value:OwnedProcessRetirement){requireOwnedProcessRetirement(value);return retirements.get(value)!();}
export class OwnedProcessRetirementError extends Error{constructor(cause:unknown){super('Owned process group retirement unverified',{cause});}}

/** Own a new Unix process group, including descendants that outlive its parent.
 * Caller supplies an explicit environment; no credentials are inherited. */
export function spawnOwnedProcess(input:{command:string;args:string[];cwd:string;environment:NodeJS.ProcessEnv}){
 const child=spawn(input.command,input.args,{cwd:input.cwd,env:input.environment,detached:true,stdio:['ignore','pipe','pipe']});
 let closed=false;
 child.once('close',()=>{closed=true;});child.once('error',()=>{});
 // Drain both streams even if a caller only observes a bounded diagnostic tail.
 child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
 const group=child.pid;
 // macOS may temporarily deny a probe while a child is exiting. Treat that
 // as still alive; only ESRCH plus child close can verify retirement.
 function alive(){if(!group)return false;try{process.kill(-group,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;if((error as NodeJS.ErrnoException).code==='EPERM')return true;throw new Error('Owned group probe failed: '+(error as NodeJS.ErrnoException).code,{cause:error});}}
 function signal(value:NodeJS.Signals){if(!group)return;try{process.kill(-group,value);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw new Error('Owned group signal '+value+' failed: '+(error as NodeJS.ErrnoException).code,{cause:error});}}
 async function closeGroup(){
  signal('SIGTERM');const start=Date.now();let forced=false;
  while(alive()||!closed){
   const elapsed=Date.now()-start;if(elapsed>=5000&&!forced){signal('SIGKILL');forced=true;}
   if(elapsed>=10000)throw Error('Owned process group retirement unverified: group='+group+', childClosed='+closed+', groupAlive='+alive());
   await new Promise<void>(done=>setTimeout(done,20));
  }
 }
 let retirement:Promise<void>|undefined;
 const resource:OwnedProcessRetirement=Object.freeze({contract:'pilot-owned-process-retirement-v1'});
 const retire=()=>retirement??=(async()=>{try{await closeGroup();}catch(error){let snapshot='unavailable';if(group)try{snapshot=execFileSync('ps',['-g',String(group),'-o','pid=,ppid=,pgid=,uid=,stat=,comm='],{encoding:'utf8',timeout:1000,maxBuffer:8192}).trim();}catch{}throw new OwnedProcessRetirementError(new Error((error instanceof Error?error.message:'unknown')+'; group='+group+'; childClosed='+closed+'; ownedGroup='+snapshot));}})();
 retirements.set(resource,retire);
 return {child,retirement:resource};
}
export async function withOwnedProcess<T>(input:{command:string;args:string[];cwd:string;environment:NodeJS.ProcessEnv;signal:AbortSignal;deadline:number;onProcess?:(process:OwnedProcessRetirement)=>void},run:(child:ChildProcess)=>Promise<T>){
 input.signal.throwIfAborted();if(!Number.isSafeInteger(input.deadline)||input.deadline<=Date.now()||input.deadline>Date.now()+900000)throw Error('Finite original owned process deadline required');
 const deadline=AbortSignal.any([input.signal,AbortSignal.timeout(Math.max(1,input.deadline-Date.now()))]);
 const {child,retirement:resource}=spawnOwnedProcess(input);let failed=false;child.once('error',()=>{failed=true;});
 let interrupted!:()=>void;
 const cancelled=new Promise<never>((_,reject)=>{interrupted=()=>reject(deadline.reason??Error('Owned process interrupted'));deadline.addEventListener('abort',interrupted,{once:true});if(deadline.aborted)interrupted();});
 try{
  input.onProcess?.(resource);
  const result=await Promise.race([run(child),cancelled]);deadline.throwIfAborted();if(failed)throw Error('Owned process could not start');return result;
 }finally{deadline.removeEventListener('abort',interrupted);await retireOwnedProcess(resource);}
}
