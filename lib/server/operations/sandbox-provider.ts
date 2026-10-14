import {Sandbox,APIError} from '@vercel/sandbox';
import {createHash} from 'node:crypto';
import type {SandboxCredentials} from '../jobs/sandbox-executor';
import type {JobHandle,ProviderReconciler} from './hosted-jobs';

/** Exact project credentials remain in the control plane. Lookup never resumes compute. */
export function sandboxProvider(credentials:SandboxCredentials,handle:JobHandle):ProviderReconciler{
 const expected={turas_job:handle.id,turas_creation:handle.creationTag,turas_environment:createHash('sha256').update(handle.environmentId).digest('hex')};
 const owned=(tags:Record<string,string>|undefined)=>Object.entries(expected).every(([key,value])=>tags?.[key]===value);
 const absent=(error:unknown)=>error instanceof APIError&&error.response.status===404&&
  ((error.json as {error?:{code?:string}}|undefined)?.error?.code==='not_found');
 const lookup=async(name:string,signal:AbortSignal)=>{try{return await Sandbox.get({...credentials,name,resume:false,signal});}catch(error){if(absent(error))return undefined;throw Error('Provider lookup unverified');}};
 return {
  async findByCreationTag(tag,signal){if(tag!==handle.creationTag)throw Error('Exact creation tag required');
   const page=await Sandbox.list({...credentials,tags:{turas_creation:tag},signal});signal.throwIfAborted();
   if(page.sandboxes.length>100)return {items:[],complete:false};
   return {complete:page.pagination.next===null,items:page.sandboxes.map(item=>({id:item.name,persistent:item.persistent,tags:item.tags??{}}))};
  },
  async stopAndDelete(id,signal){if(!/^[a-zA-Z0-9_-]{1,256}$/.test(id))throw Error('Exact provider identity required');
   const sandbox=await lookup(id,signal);if(!sandbox)return;
   if(sandbox.persistent||!owned(sandbox.tags))throw Error('Provider ownership changed');
   try{if(!['stopped','failed','aborted'].includes(sandbox.status))await sandbox.stop({signal});}
   finally{await sandbox.delete({deleteOrphanSnapshots:true,signal});}
   if(await lookup(id,signal))throw Error('Owned provider deletion unverified');
  }
 };
}
