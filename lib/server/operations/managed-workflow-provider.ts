import {z} from 'zod';
import {managedRunMetadataSchema,managedRunPageSchema} from './managed-workflow-inventory';
const scopeSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),token:z.string().min(1).max(8192),target:z.enum(['preview','production'])});
/** Explicit operator API binding. Reads lazy metadata only. No retry, redirect,
 * resolved run body, model dispatch, cost settlement or source-store write. */
export async function bindManagedRunProvider(raw:z.infer<typeof scopeSchema>,signal:AbortSignal,transport:typeof fetch=fetch){
 const scope=scopeSchema.parse(raw),headers=new Headers({authorization:'Bearer '+scope.token,'x-vercel-project-id':scope.projectId,'x-vercel-team-id':scope.teamId,'x-vercel-environment':scope.target});
 async function call(path:string,method:'GET'|'PUT'){
  signal.throwIfAborted();const response=await transport('https://api.vercel.com'+path,{method,headers,redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Managed provider response unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('Managed metadata body unavailable');const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1048576)throw Error('Managed metadata exceeds bound');chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString());}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 }
 const actual=z.object({id:z.string(),accountId:z.string()}).parse(await call('/v9/projects/'+scope.projectId+'?teamId='+scope.teamId,'GET'));
 if(actual.id!==scope.projectId||actual.accountId!==scope.teamId)throw Error('Managed work project differs');
 const runId=(id:string)=>z.string().regex(/^wrun_[A-Za-z0-9_-]{1,240}$/).parse(id);
 const metadata=managedRunMetadataSchema;
 return {
  list:async(cursor:string|null)=>{
   const query=new URLSearchParams({remoteRefBehavior:'lazy',teamId:scope.teamId,limit:'100',sortOrder:'asc'});
   if(cursor!==null)query.set('cursor',z.string().min(1).max(8192).parse(cursor));
   return managedRunPageSchema.parse(await call('/v1/workflow/v2/runs?'+query.toString(),'GET'));
  },
  read:async(id:string)=>metadata.parse(await call('/v1/workflow/v2/runs/'+encodeURIComponent(runId(id))+'?remoteRefBehavior=lazy&teamId='+scope.teamId,'GET')),
  cancel:async(id:string)=>metadata.parse(await call('/v1/workflow/v1/runs/'+encodeURIComponent(runId(id))+'/cancel?remoteRefBehavior=lazy&teamId='+scope.teamId,'PUT')),
 };
}
