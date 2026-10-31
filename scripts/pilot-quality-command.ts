import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnOwnedProcess,retireOwnedProcess,captureOwnedProcessDescendants,type OwnedProcessRetirement} from './pilot-owned-process';

/** Supervise only the genuine stage spawned here; interruption never adopts PIDs. */
export async function runPilotQualityCommand(input:{command:string;args:string[];cwd:string;environment:NodeJS.ProcessEnv;deadline:number;signal?:AbortSignal;onOutput?:(bytes:Buffer)=>void}){
 if(!Number.isSafeInteger(input.deadline)||input.deadline<=Date.now())throw Error('Finite original quality command deadline required');
 let resource:OwnedProcessRetirement|undefined,group:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 let interruption:Error|undefined,deadlineCaptureFailure:{error:unknown}|undefined,expired=false,rejectInterrupted!:(error:Error)=>void;
 const interrupted=new Promise<never>((_,reject)=>{rejectInterrupted=reject;});interrupted.catch(()=>{});
 const interrupt=()=>{if(interruption)return;interruption=Error('Owned quality command interrupted');rejectInterrupted(interruption);if(resource)void retireOwnedProcess(resource).catch(()=>{/* Awaited below; retain retirement failures. */});};
 // Install before spawn, then recheck immediately after synchronous registration.
 process.on('SIGTERM',interrupt);process.on('SIGINT',interrupt);input.signal?.addEventListener('abort',interrupt,{once:true});
 let result:{code:number|null;signal:NodeJS.Signals|null}|undefined,failure:{error:unknown}|undefined;
 try{
  if(input.signal?.aborted)interrupt();if(interruption)throw interruption;
  const nonce=randomBytes(24).toString('hex');let exitCaptured=false,controlText='';
  const owned=spawnOwnedProcess({...input,args:['--import',fileURLToPath(new URL('./pilot-quality-command-exit.mjs',import.meta.url)),...input.args],environment:{...input.environment,TURAS_QUALITY_CONTROL_PARENT:String(process.pid),TURAS_QUALITY_CONTROL_NONCE:nonce},controlPipes:true});resource=owned.retirement;group=owned.child.pid;
  const control=owned.child.stdio[3],ack=owned.child.stdio[4];
  control?.on('data',(bytes:Buffer)=>{try{
   controlText+=bytes.toString();if(controlText.length>256||exitCaptured)throw Error('Owned quality exit control invalid');
   if(!controlText.includes('\n'))return;
   const message=JSON.parse(controlText);if(controlText.indexOf('\n')!==controlText.length-1||message.pid!==group||message.nonce!==nonce)throw Error('Owned quality exit identity invalid');
   captureOwnedProcessDescendants(resource!);exitCaptured=true;
   if(ack&&'write'in ack)ack.write(nonce+'\n');
  }catch(error){rejectInterrupted(Error('Owned quality exit capture failed',{cause:error}));}});
  ack?.on('error',()=>{});control?.on('error',()=>{});
  const outcome=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{owned.child.once('error',reject);owned.child.once('close',(code,signal)=>resolve({code,signal}));});outcome.catch(()=>{});
  for(const stream of [owned.child.stdout,owned.child.stderr])stream?.on('data',bytes=>input.onOutput?.(bytes));
  if(interruption)void retireOwnedProcess(resource).catch(()=>{});
  timer=setTimeout(()=>{expired=true;try{captureOwnedProcessDescendants(resource!);}catch(error){deadlineCaptureFailure={error};}finally{if(group)try{process.kill(-group,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')rejectInterrupted(Error('Owned quality command deadline retirement failed',{cause:error}));}}},Math.max(1,input.deadline-Date.now()));
  result=await Promise.race([outcome,interrupted]);if(interruption)throw interruption;if(result.code===0&&!expired&&!exitCaptured)throw Error('Owned quality normal exit capture unverified');
 }catch(error){failure={error};}
 finally{
  clearTimeout(timer);
  try{if(resource)await retireOwnedProcess(resource);}catch(error){failure={error:failure?new AggregateError([failure.error,error],'Owned quality command and retirement failed'):error};}
  finally{process.removeListener('SIGTERM',interrupt);process.removeListener('SIGINT',interrupt);input.signal?.removeEventListener('abort',interrupt);}
 }
 if(interruption&&failure?.error!==interruption&&!(failure?.error instanceof AggregateError&&failure.error.errors.includes(interruption)))failure={error:failure?new AggregateError([failure.error,interruption],'Owned quality command interrupted during retirement'):interruption};
 if(deadlineCaptureFailure)failure={error:failure?new AggregateError([failure.error,deadlineCaptureFailure.error],'Owned quality deadline capture and retirement failed'):deadlineCaptureFailure.error};
 if(failure)throw failure.error;
 if(!result)throw Error('Owned quality command outcome unavailable');
 return {...result,deadlineExpired:expired};
}
