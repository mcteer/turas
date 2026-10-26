export const ordinaryNativeFileFixtureMaximumMs=420000;

/** Keep the simulated generation available while the caller prepares a correction,
 * within the owning fixture's original absolute deadline. */
export function waitForNativeFileFixtureCorrection(signal:AbortSignal,deadlineAt:number):Promise<never>{
 const remaining=deadlineAt-Date.now();
 if(!Number.isSafeInteger(deadlineAt)||remaining<=0||remaining>ordinaryNativeFileFixtureMaximumMs)throw Error('Finite owned native-file fixture deadline required');
 return new Promise((_,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Generation aborted','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);reject(Error('Steering fixture did not receive a correction before its owned deadline'));},remaining);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
