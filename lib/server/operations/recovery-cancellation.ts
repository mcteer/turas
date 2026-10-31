/** Operator commands settle owned resources on interruption instead of leaving
 * their Docker client disconnected from a still-running capture/restore process. */
async function withBoundedCancellation<T>(deadlineMs:number,maximumMs:number,run:(signal:AbortSignal)=>Promise<T>,parentSignal?:AbortSignal):Promise<T>{
 if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>maximumMs)throw Error('Bounded operation deadline required');
 const controller=new AbortController(),interrupt=()=>controller.abort(Error('Recovery interrupted')),timer=setTimeout(interrupt,deadlineMs);
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 const signal=parentSignal?AbortSignal.any([controller.signal,parentSignal]):controller.signal;
 try{signal.throwIfAborted();const result=await run(signal);signal.throwIfAborted();return result;}
 finally{clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}

export function withRecoveryCancellation<T>(deadlineMs:number,run:(signal:AbortSignal)=>Promise<T>,parentSignal?:AbortSignal){return withBoundedCancellation(deadlineMs,900000,run,parentSignal);}
/** Outer fixed hosted catalog only. Every native/file job retains its own
 * existing deadline; infrastructure authority may shorten this batch bound. */
export function withHostedCatalogCancellation<T>(deadlineMs:number,run:(signal:AbortSignal)=>Promise<T>){return withBoundedCancellation(deadlineMs,7200000,run);}
