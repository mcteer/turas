import {HttpFailure} from '../../../lib/contracts/http';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
/** Safe only for the transactional, receipt-bound domain commands used by these
 * fixtures. Never wrap model, embedding, provider launch or external delivery. */
export function pilotFixtureQuotaWait(signal:AbortSignal){
 let quotaWaitMs=0;
 return {get elapsedMs(){return quotaWaitMs;},async run<T>(operation:()=>Promise<T>):Promise<T>{
  requireOwnedPilotDatabase();
  for(;;){signal.throwIfAborted();try{return await operation();}catch(error){
   if(!(error instanceof HttpFailure)||error.status!==429||!Number.isFinite(error.retryAfterSeconds)||error.retryAfterSeconds!<1||error.retryAfterSeconds!>60)throw error;
   const started=performance.now();await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Owned fixture quota wait interrupted'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.min(60000,error.retryAfterSeconds!*1000+20));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});quotaWaitMs+=performance.now()-started;
  }}
 }};
}
