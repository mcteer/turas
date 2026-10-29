export const ordinaryNativeFileFixtureMaximumMs=420000;
export const ordinaryNativeFileResponseMaximumMs=30000;

function fixtureRemaining(deadlineAt:number){
 const remaining=deadlineAt-Date.now();
 if(!Number.isSafeInteger(deadlineAt)||remaining<=0||remaining>ordinaryNativeFileFixtureMaximumMs)throw Error('Finite owned native-file fixture deadline required');
 return remaining;
}

async function within<T>(work:Promise<T>,milliseconds:number,message:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);})]);}
 finally{clearTimeout(timer);}
}

/** Upload preparation remains inside the original fixture deadline. Start the
 * response bound only when the exact correction request has been observed. */
export async function waitForNativeFileFixtureResponse<T>(request:Promise<{response():Promise<T|null>}>,deadlineAt:number):Promise<T|null>{
 const observed=await within(request,fixtureRemaining(deadlineAt),'Native correction request was not issued before the owned deadline');
 const remaining=Math.min(ordinaryNativeFileResponseMaximumMs,fixtureRemaining(deadlineAt));
 return within(observed.response(),remaining,'Native correction response deadline exceeded');
}

/** Keep the simulated generation available while the caller prepares a correction,
 * within the owning fixture's original absolute deadline. */
export function waitForNativeFileFixtureCorrection(signal:AbortSignal,deadlineAt:number):Promise<never>{
 const remaining=fixtureRemaining(deadlineAt);
 return new Promise((_,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Generation aborted','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);reject(Error('Steering fixture did not receive a correction before its owned deadline'));},remaining);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
