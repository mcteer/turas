import {AsyncLocalStorage} from 'node:async_hooks';
import type {ServerConfig} from '../config';

// Keep this accessor separate from the operator constructor. Normal app/agent
// configuration must not import restoration tools or create authored bundle chunks.
const selected=new AsyncLocalStorage<{config:Readonly<ServerConfig>;signal:AbortSignal;active:boolean}>();
export function currentRecoveryServerConfig(){const context=selected.getStore();if(!context)return undefined;if(!context.active||context.signal.aborted)throw Error('Recovery configuration scope ended');return context.config;}
/** Internal context plumbing; the owned recovery constructor authenticates the
 * target before calling this. Never expose this setter through an HTTP/tool API. */
export async function withRecoveryServerConfiguration<T>(config:ServerConfig,signal:AbortSignal,read:()=>Promise<T>){
 signal.throwIfAborted();const context={config:Object.freeze(config),signal,active:true};
 try{return await selected.run(context,read);}finally{context.active=false;}
}
