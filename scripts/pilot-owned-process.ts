import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
export type OwnedProcessRetirement=Readonly<{contract:'pilot-owned-process-retirement-v1'}>;
const retirements=new WeakMap<object,{retire:()=>Promise<void>;capture:()=>void}>();
export function requireOwnedProcessRetirement(value:OwnedProcessRetirement){if(!retirements.has(value))throw Error('Actual owned process retirement required');}
export function retireOwnedProcess(value:OwnedProcessRetirement){requireOwnedProcessRetirement(value);return retirements.get(value)!.retire();}
export function captureOwnedProcessDescendants(value:OwnedProcessRetirement){requireOwnedProcessRetirement(value);retirements.get(value)!.capture();}
export class OwnedProcessRetirementError extends Error{constructor(cause:unknown){super('Owned process group retirement unverified',{cause});}}
type ProcessIdentity={pid:number;ppid:number;pgid:number;uid:number;start:string};
function processInventory(){
 const text=execFileSync('ps',['-axo','pid=,ppid=,pgid=,uid=,lstart='],{encoding:'utf8',timeout:1000,maxBuffer:1048576,env:{...process.env,LC_ALL:'C',LANG:'C'}}),lines=text.trim().split('\n');
 if(lines.length>10000)throw Error('Owned process inventory exceeds its bound');
 const rows=new Map<number,ProcessIdentity>();
 for(const line of lines){const fields=line.trim().split(/\s+/);if(fields.length!==9||fields.slice(0,3).some(value=>!/^\d+$/.test(value))||!/^-?\d+$/.test(fields[3]))throw Error('Owned process inventory incomplete');
  const [pid,ppid,pgid,uid]=fields.slice(0,4).map(Number);if(![pid,ppid,pgid,uid].every(Number.isSafeInteger)||rows.has(pid))throw Error('Owned process inventory invalid');rows.set(pid,{pid,ppid,pgid,uid,start:fields.slice(4).join(' ')});
 }return rows;
}
function sameProcess(a:ProcessIdentity,b:ProcessIdentity){return a.pid===b.pid&&a.uid===b.uid&&a.start===b.start;}

/** Own a new Unix process group, including descendants that outlive its parent.
 * Caller supplies an explicit environment; no credentials are inherited. */
export function spawnOwnedProcess(input:{command:string;args:string[];cwd:string;environment:NodeJS.ProcessEnv;controlPipes?:boolean}){
 const child=spawn(input.command,input.args,{cwd:input.cwd,env:input.environment,detached:true,stdio:input.controlPipes?['ignore','pipe','pipe','pipe','pipe']:['ignore','pipe','pipe']});
 let closed=false;
 child.once('close',()=>{closed=true;});child.once('error',()=>{});
 // Drain both streams even if a caller only observes a bounded diagnostic tail.
 child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
 const group=child.pid;
 const detachedGroups=new Map<number,Map<number,ProcessIdentity>>();let rootIdentity:ProcessIdentity|undefined;
 function captureDescendants(){
  if(!group)return;const rows=processInventory(),root=rows.get(group);if(!root)return;
  if(rootIdentity&&!sameProcess(root,rootIdentity))throw Error('Owned process identity changed');
  if(!rootIdentity){if(closed||child.exitCode!==null||child.signalCode!==null)return;if(root.pgid!==group||root.uid!==process.getuid?.())throw Error('Owned process identity unavailable');rootIdentity=root;}
  const children=new Map<number,ProcessIdentity[]>();for(const row of rows.values()){const siblings=children.get(row.ppid)??[];siblings.push(row);children.set(row.ppid,siblings);}
  const owned=new Set([group]),queue=[group];for(let i=0;i<queue.length;i++)for(const row of children.get(queue[i])??[])if(!owned.has(row.pid)&&row.uid===root.uid){owned.add(row.pid);queue.push(row.pid);}
  for(const pid of owned){const row=rows.get(pid)!;if(row.pgid===group)continue;const leader=rows.get(row.pgid);
   if(!leader||!owned.has(leader.pid)||leader.pid!==leader.pgid||leader.uid!==root.uid)continue;
   let members=detachedGroups.get(leader.pid);if(!members){if(detachedGroups.size>=128)throw Error('Owned detached group limit exceeded');members=new Map();detachedGroups.set(leader.pid,members);}
   const prior=members.get(row.pid);if(prior&&!sameProcess(prior,row))throw Error('Owned descendant identity changed');if(!prior&&[...detachedGroups.values()].reduce((sum,value)=>sum+value.size,0)>=4096)throw Error('Owned descendant member limit exceeded');members.set(row.pid,row);
  }
 }
 // macOS may temporarily deny a probe while a child is exiting. Treat that
 // as still alive; only ESRCH plus child close can verify retirement.
 function alive(id=group){if(!id)return false;try{process.kill(-id,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;if((error as NodeJS.ErrnoException).code==='EPERM')return true;throw new Error('Owned group probe failed: '+(error as NodeJS.ErrnoException).code,{cause:error});}}
 function signal(value:NodeJS.Signals,id=group){if(!id)return;try{process.kill(-id,value);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw new Error('Owned group signal '+value+' failed: '+(error as NodeJS.ErrnoException).code,{cause:error});}}
 function signalAll(value:NodeJS.Signals,failures:unknown[]){
  let rows:Map<number,ProcessIdentity>|undefined;
  if(detachedGroups.size)try{rows=processInventory();}catch(error){failures.push(error);}
  for(const [id,members]of detachedGroups)try{if(!alive(id))continue;if(!rows)throw Error('Owned descendant inventory unavailable');const leader=rows.get(id),original=members.get(id);
   if(leader){if(!original||!sameProcess(leader,original))throw Error('Owned detached leader identity changed');}
   else if(![...members.values()].some(prior=>{const current=rows!.get(prior.pid);return current?.pgid===id&&sameProcess(current,prior);}))throw Error('Owned detached member identity unverified');
   signal(value,id);
  }catch(error){failures.push(error);}
  try{signal(value);}catch(error){failures.push(error);}
 }
 async function closeGroup(){
  const start=Date.now(),failures:unknown[]=[];let forced=false;
  try{captureDescendants();}catch(error){failures.push(error);}
  signalAll('SIGTERM',failures);
  while(alive()||[...detachedGroups.keys()].some(id=>alive(id))||!closed){
   const elapsed=Date.now()-start;if(elapsed>=5000&&!forced){signalAll('SIGKILL',failures);forced=true;}
   if(elapsed>=10000)throw Error('Owned process group retirement unverified: group='+group+', childClosed='+closed+', groupAlive='+alive());
   await new Promise<void>(done=>setTimeout(done,20));
  }
  if(failures.length)throw new AggregateError(failures,'Owned descendant retirement unverified');
 }
 let retirement:Promise<void>|undefined;
 const resource:OwnedProcessRetirement=Object.freeze({contract:'pilot-owned-process-retirement-v1'});
 const retire=()=>retirement??=(async()=>{try{await closeGroup();}catch(error){let snapshot='unavailable';if(group)try{snapshot=execFileSync('ps',['-g',String(group),'-o','pid=,ppid=,pgid=,uid=,stat=,comm='],{encoding:'utf8',timeout:1000,maxBuffer:8192}).trim();}catch{}throw new OwnedProcessRetirementError(new Error((error instanceof Error?error.message:'unknown')+'; group='+group+'; childClosed='+closed+'; ownedGroup='+snapshot,{cause:error}));}})();
 retirements.set(resource,{retire,capture:()=>{if(retirement)throw Error('Owned process retirement already started');captureDescendants();}});
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
