import {AsyncLocalStorage} from 'node:async_hooks';
import type {Client} from 'pg';
import type {ServerConfig} from '../config';
import type {OwnedRestoreTarget} from './owned-restore-target';

const selected=new AsyncLocalStorage<{config:Readonly<ServerConfig>;signal:AbortSignal;active:boolean}>();
/** Read-only accessor; an environment label cannot enter this context. */
export function currentRecoveryServerConfig(){const context=selected.getStore();if(!context)return undefined;if(!context.active||context.signal.aborted)throw Error('Recovery configuration scope ended');return context.config;}
/** Scope canonical owner reads to an authenticated restored source without
 * changing process.env, the selected database, or another concurrent request.
 * This does not launch an application or grant runtime database access. */
export async function withOwnedRecoveryConfiguration<T>(target:OwnedRestoreTarget,scope:{environmentId:string;recoveryId:string;controlRevision:number},signal:AbortSignal,read:(owner:Client)=>Promise<T>){
 const input=Object.freeze({...scope});signal.throwIfAborted();
 // Resolve lazily: the normal configuration getter has no target/fixture graph.
 const {withOwnedRestoreTarget,requireOwnedRestoreConfigurationTarget}=await import('./owned-restore-target');
 const {parseServerConfig}=await import('../config');
 return withOwnedRestoreTarget(target,input,signal,async owner=>{
  const environment={...process.env,TURAS_ENVIRONMENT_ID:input.environmentId};
  const config=parseServerConfig(environment);
  requireOwnedRestoreConfigurationTarget(target,config.DATABASE_URL,config.DATABASE_URL_UNPOOLED);
  signal.throwIfAborted();const context={config:Object.freeze(config),signal,active:true};
  try{return await selected.run(context,()=>read(owner));}finally{context.active=false;}
 });
}
