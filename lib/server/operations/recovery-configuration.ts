import type {Client} from 'pg';
import {type OwnedRestoreTarget,withOwnedRestoreTarget,requireOwnedRestoreConfigurationTarget} from './owned-restore-target';
import {parseServerConfig} from '../config';
import {withRecoveryServerConfiguration} from './recovery-configuration-context';

/** Scope canonical owner reads to an authenticated restored source without
 * changing process.env, the selected database, or another concurrent request.
 * This does not launch an application or grant runtime database access. */
export async function withOwnedRecoveryConfiguration<T>(target:OwnedRestoreTarget,scope:{environmentId:string;recoveryId:string;controlRevision:number},signal:AbortSignal,read:(owner:Client)=>Promise<T>){
 const input=Object.freeze({...scope});signal.throwIfAborted();
 return withOwnedRestoreTarget(target,input,signal,async owner=>{
  const environment={...process.env,TURAS_ENVIRONMENT_ID:input.environmentId};
  const config=parseServerConfig(environment);
  requireOwnedRestoreConfigurationTarget(target,config.DATABASE_URL,config.DATABASE_URL_UNPOOLED);
  return withRecoveryServerConfiguration(config,signal,()=>read(owner));
 });
}
