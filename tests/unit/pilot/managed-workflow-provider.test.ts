import {it,expect} from 'vitest';
import {bindManagedRunProvider} from '../../../lib/server/operations/managed-workflow-provider';
const scope={projectId:'prj_synthetic',teamId:'team_synthetic',token:'synthetic-operator-token',target:'production' as const};
function fixture(){
 const calls:{url:string;method:string}[]=[];
 const transport:typeof fetch=async(url,options)=>{
  const path=String(url),headers=new Headers(options?.headers);expect(headers.get('x-vercel-project-id')).toBe(scope.projectId);expect(headers.get('x-vercel-team-id')).toBe(scope.teamId);expect(options?.redirect).toBe('error');calls.push({url:path,method:String(options?.method)});
  return Response.json(path.includes('/v9/projects/')?{id:scope.projectId,accountId:scope.teamId}:{runId:'wrun_synthetic',deploymentId:'dpl_synthetic',workflowName:'workflow//eve//workflowEntry',status:options?.method==='PUT'?'cancelled':'running',input:{secret:'discarded'},output:{privateText:'discarded'}});
 };return {transport,calls};
}
it('binds the actual work project and uses lazy metadata reads and a single exact cancellation request',async()=>{
 const f=fixture(),api=await bindManagedRunProvider(scope,AbortSignal.timeout(1000),f.transport);
 await api.read('wrun_synthetic');expect((await api.cancel('wrun_synthetic')).status).toBe('cancelled');expect(f.calls).toHaveLength(3);expect(f.calls[1].url).toContain('remoteRefBehavior=lazy');expect(f.calls[2]).toMatchObject({method:'PUT'});expect(f.calls[2].url).toContain('/v1/workflow/v1/runs/wrun_synthetic/cancel?');
});
it('rejects an invalid run identity without dispatching another request',async()=>{
 const f=fixture(),api=await bindManagedRunProvider(scope,AbortSignal.timeout(1000),f.transport);await expect(api.read('../foreign')).rejects.toThrow();expect(f.calls).toHaveLength(1);
});
it('rejects a different project before any run operation',async()=>{
 let calls=0;await expect(bindManagedRunProvider(scope,AbortSignal.timeout(1000),async()=>{calls++;return Response.json({id:'prj_foreign',accountId:scope.teamId});})).rejects.toThrow('project differs');expect(calls).toBe(1);
});
it('does not retry an unavailable provider response',async()=>{
 let calls=0;await expect(bindManagedRunProvider(scope,AbortSignal.timeout(1000),async()=>{calls++;return new Response('Unavailable',{status:503,headers:{'retry-after':'1'}});})).rejects.toThrow('unavailable');expect(calls).toBe(1);
});
it('bounds the response body before accepting project metadata',async()=>{
 await expect(bindManagedRunProvider(scope,AbortSignal.timeout(1000),async()=>Response.json({id:scope.projectId,accountId:scope.teamId,noise:'a'.repeat(1048577)}))).rejects.toThrow('exceeds bound');
});
it('returns only run metadata and discards native input and output bodies',async()=>{
 const f=fixture(),api=await bindManagedRunProvider(scope,AbortSignal.timeout(1000),f.transport);const result=await api.read('wrun_synthetic');expect(Object.keys(result).sort()).toEqual(['deploymentId','runId','status','workflowName']);expect(JSON.stringify(result)).not.toContain('discarded');expect(JSON.stringify(result)).not.toContain(scope.token);
});

it('lists unfiltered lazy metadata in the explicitly selected provider environment',async()=>{
 let count=0;const api=await bindManagedRunProvider({...scope,target:'preview'},AbortSignal.timeout(1000),async(url,options)=>{
  expect(new Headers(options?.headers).get('x-vercel-environment')).toBe('preview');count++;
  if(count===1)return Response.json({id:scope.projectId,accountId:scope.teamId});
  const query=new URL(String(url)).searchParams;expect(query.get('remoteRefBehavior')).toBe('lazy');expect(query.get('cursor')).toBe('opaque + cursor');expect(query.has('workflowName')).toBe(false);expect(query.has('status')).toBe(false);
  return Response.json({data:[{runId:'wrun_synthetic',deploymentId:'dpl_synthetic',workflowName:'workflow//eve//taskRunWorkflow',status:'running',input:{private:'discarded'}}],cursor:null,hasMore:false,private:'discarded'});
 });
 const page=await api.list('opaque + cursor');expect(JSON.stringify(page)).not.toContain('discarded');expect(count).toBe(2);
});
