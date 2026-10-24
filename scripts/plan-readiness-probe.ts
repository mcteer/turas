import {ownedEvalTimeout} from './eval-deadline';

/** Observe each existing readiness request independently. A sibling rejection
 * must not discard a received status or leave its response body unretired. */
export async function probePlanReadiness(origin:string,path:'/api/auth/session'|'/eve/v1/health',deadlineAt:number){
 try{
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(ownedEvalTimeout(deadlineAt,2_000))});
  // Request cancellation without waiting on an application-controlled stream.
  void response.body?.cancel().catch(()=>undefined);
  return {status:response.status,transport:'none' as const};
 }catch(error){
  const name=error instanceof Error?error.name:'';
  return {status:null,transport:['TimeoutError','AbortError','TypeError'].includes(name)?name:'other'};
 }
}
