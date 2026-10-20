import {AsyncLocalStorage} from 'node:async_hooks';
import {prepareBoundRecoveryMeasurementDenials,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import type {Client} from 'pg';
import type {RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';

type Lane={identity:string;signal:AbortSignal;claimed:boolean;retired:boolean;slots:number;group:Group;publish:(()=>void)[]};
type Group={abort:AbortController;lanes:Lane[];slots:number;ready:Promise<void>;release:()=>void;retained?:RetainedWorkDenials;preparation?:Promise<void>;prepared?:RetainedWorkDenials};
const current=new AsyncLocalStorage<Lane>();
let active:Group|undefined;
let transports=0;
let quarantined=false;
const identity=(input:LockedWorkRecoveryInput)=>JSON.stringify([input.sourceFile,input.hostedScope,input.scope,input.runtimeConnection,input.deadline]);

/** Private operator composition. Each lane owns one genuine constructor and at
 * most eight lifetime reservations. Retired/failed reservations are never reused.
 * The group shares the existing 32-slot bound, not 32 slots per connection. */
export async function withWorkRecoveryMeasurementGroup<T>(input:LockedWorkRecoveryInput,reads:readonly ((target:LockedWorkRecoveryInput)=>Promise<T>)[],retained?:RetainedWorkDenials):Promise<readonly T[]>{
 if(quarantined||active||transports||current.getStore()||reads.length<2||reads.length>4||reads.some(read=>typeof read!=='function')||input.deadline<=Date.now()||input.deadline>Date.now()+290000)throw Error('Finite independent recovery measurement group required');
 input.signal.throwIfAborted();
 const abort=new AbortController(),signal=AbortSignal.any([input.signal,abort.signal,AbortSignal.timeout(input.deadline-Date.now())]);
 let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve;});
 const group:Group={abort,lanes:[],slots:0,ready,release,retained};
 group.lanes=reads.map(()=>({identity:identity(input),signal,claimed:false,retired:false,slots:0,group,publish:[]}));active=group;
 let observedAbort!:()=>void;const cancelled=new Promise<void>(done=>{observedAbort=done;});
 const interrupt=()=>{abort.abort(signal.reason);release();observedAbort();};signal.addEventListener('abort',interrupt,{once:true});if(signal.aborted)interrupt();
 try{
  const pending=Promise.allSettled(reads.map((read,index)=>current.run(group.lanes[index],async()=>{
   try{signal.throwIfAborted();const value=await read({...input,signal});if(!group.lanes[index].claimed||!group.lanes[index].retired)throw Error('One retired genuine target per measurement lane required');return value;}
   catch(error){abort.abort(error);release();throw error;}
  })));
  const outcome=await Promise.race([pending.then(results=>({results})),cancelled.then(()=>({cancelled:true as const}))]);
  let settled:PromiseSettledResult<T>[];
  if('results'in outcome)settled=outcome.results;
  else{
   // Work ends at the original shared deadline. Allow only a separate bounded
   // drain for existing writer destruction/10s callbacks/20s independent deny
   // cleanup; never leave an unclaimed or non-cooperative lane hanging forever.
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{const drained=await Promise.race([pending,new Promise<null>(done=>{timer=setTimeout(()=>done(null),40000);})]);
    if(!drained){quarantined=true;throw Error('Recovery measurement group did not drain; writer quarantined');}settled=drained;
   }finally{if(timer)clearTimeout(timer);}
  }
  const failed=settled.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
  signal.throwIfAborted();
  // Publication consists only of the producer's private WeakMap registrations.
  // No callback result or measurement brand is returned before every constructor
  // has passed its final live platform checks and independent cleanup.
  for(const lane of group.lanes)for(const publish of lane.publish)publish();
  return Object.freeze(settled.map(result=>(result as PromiseFulfilledResult<T>).value));
 }finally{signal.removeEventListener('abort',interrupt);active=undefined;}
}

/** Constructor/issuer plumbing only; never accepted from a request or JSON. */
export function claimRecoveryMeasurementLane(input:LockedWorkRecoveryInput,decision:boolean){
 const lane=current.getStore();
 if(quarantined)throw Error('Recovery measurement writer quarantined');
 if(!lane){if(active)throw Error('Ungrouped recovery writer during measurement group');return undefined;}
 if(active!==lane.group||decision||lane.claimed||lane.identity!==identity(input)||input.signal!==lane.signal)throw Error('Exact unused recovery measurement lane required');
 lane.signal.throwIfAborted();lane.claimed=true;return lane;
}
export async function withRecoveryMeasurementTransport<T>(input:LockedWorkRecoveryInput,decision:boolean,run:(lane:ReturnType<typeof claimRecoveryMeasurementLane>)=>Promise<T>){
 const lane=claimRecoveryMeasurementLane(input,decision);transports++;
 try{return await run(lane);}finally{transports--;}
}
export function remainingRecoveryMeasurementSlots(lane:Lane|undefined){return lane?Math.min(8-lane.slots,32-lane.group.slots):32;}
export function failRecoveryMeasurementLane(lane:Lane|undefined,error:unknown){if(lane){lane.group.abort.abort(error);lane.group.release();}}
/** All actual constructors await the same successful owner reconciliation before
 * any callback can issue a probe. Only the first genuine constructor performs
 * that transaction; a failed preparation aborts the entire group. */
export async function prepareRecoveryMeasurementLane(lane:Lane|undefined,db:Client,target:LockedWorkRecoveryTarget){
 if(!lane?.group.retained)return;
 const group=lane.group;
 if(!group.preparation)group.preparation=Promise.resolve().then(async()=>{lane.signal.throwIfAborted();await prepareBoundRecoveryMeasurementDenials(db,target,lane,group.retained!);lane.signal.throwIfAborted();group.prepared=group.retained;});
 await group.preparation;lane.signal.throwIfAborted();
}
export function preparedRecoveryMeasurementDenials(lane:Lane|undefined){return lane?.group.prepared;}
export function reserveRecoveryMeasurementSlot(lane:Lane|undefined){
 if(!lane)return;
 if(active!==lane.group||!lane.claimed||lane.retired||remainingRecoveryMeasurementSlots(lane)<=0)throw Error('Shared recovery measurement probe allowance exhausted');
 lane.signal.throwIfAborted();lane.slots++;lane.group.slots++;
}
export async function retireRecoveryMeasurementLane(lane:Lane|undefined){
 if(!lane)return;
 lane.signal.throwIfAborted();if(lane.retired)throw Error('Recovery measurement lane already retired');lane.retired=true;
 if(lane.group.lanes.every(value=>value.retired))lane.group.release();
 await lane.group.ready;lane.signal.throwIfAborted();
}
export function publishRecoveryMeasurement(publish:()=>void){
 const lane=current.getStore();if(!lane){publish();return;}
 if(active!==lane.group||!lane.retired)throw Error('Retired recovery measurement producer required');lane.signal.throwIfAborted();lane.publish.push(publish);
}
