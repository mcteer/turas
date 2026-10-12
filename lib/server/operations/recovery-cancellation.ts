/** Operator commands settle owned resources on interruption instead of leaving
 * their Docker client disconnected from a still-running capture/restore process. */
export async function withRecoveryCancellation<T>(deadlineMs:number,run:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>900000)throw Error('Bounded recovery deadline required');
 const controller=new AbortController(),interrupt=()=>controller.abort(Error('Recovery interrupted')),timer=setTimeout(interrupt,deadlineMs);
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 try{const result=await run(controller.signal);controller.signal.throwIfAborted();return result;}
 finally{clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}
