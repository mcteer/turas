import {it,expect} from 'vitest';
import {inventoryManagedDeployments} from '../../../lib/server/operations/managed-deployment-inventory';
import {bindManagedRunProvider} from '../../../lib/server/operations/managed-workflow-provider';

const scope={projectId:'prj_synthetic',teamId:'team_synthetic',cutoff:1000,
 maximumDeployments:10000,maximumPages:100,referencedDeploymentIds:['dpl_a','dpl_unlisted']};
const row=(uid='dpl_a',created=900)=>({uid,created,url:'synthetic.vercel.app',readyState:'READY',target:'production',
 meta:{githubCommitSha:'a'.repeat(40),privateValue:'discarded'},env:{secret:'discarded'}});
const page=(deployments:unknown[],next:number|null=null)=>({deployments,pagination:{next}});
function read(list:(until:number)=>Promise<unknown>,patch:Partial<typeof scope>={},signal=AbortSignal.timeout(1000)){
 return inventoryManagedDeployments({...scope,...patch,list,signal});
}

it('repeats every project deployment page without dropping provider-only or other-target identities',async()=>{
 const calls:number[]=[];
 const result=await read(async until=>{calls.push(until);return until===1000?page([row()],800):page([{...row('dpl_b',700),target:null}]);});
 expect(calls).toEqual([1000,800,1000,800]);expect(result.pages).toEqual([2,2]);
 expect(result.rows.map(r=>r.id)).toEqual(['dpl_a','dpl_b']);
 expect(result.unlistedReferencedDeploymentIds).toEqual(['dpl_unlisted']);
 expect(result).toMatchObject({allProjectTargetsRequested:true,repeatedTraversalVerified:true,providerSnapshotVerified:false,
  deploymentProtectionVerified:false,retirementAuthorized:false,oldDeploymentsClosed:false,providerWrites:0,restorationReady:false});
 expect(JSON.stringify(result)).not.toMatch(/discarded|secret|privateValue/);
});

it('binds project and team but removes workflow target filtering for the deployment collection',async()=>{
 const calls:Array<{url:URL;method:string}>=[];
 const provider=await bindManagedRunProvider({projectId:scope.projectId,teamId:scope.teamId,token:'synthetic-token',target:'production'},AbortSignal.timeout(1000),async(url,options)=>{
  const parsed=new URL(String(url));calls.push({url:parsed,method:options?.method??'GET'});
  if(parsed.pathname.startsWith('/v9/projects/'))return Response.json({id:scope.projectId,accountId:scope.teamId});
  expect(new Headers(options?.headers).has('x-vercel-environment')).toBe(false);
  expect(parsed.searchParams.get('projectId')).toBe(scope.projectId);expect(parsed.searchParams.get('teamId')).toBe(scope.teamId);
  expect(parsed.searchParams.get('until')).toBe('1000');expect(parsed.searchParams.get('limit')).toBe('100');
  for(const key of ['target','state','status','branch','workflowName'])expect(parsed.searchParams.has(key)).toBe(false);
  expect(options?.redirect).toBe('error');return Response.json(parsed.pathname==='/v4/aliases'?{aliases:[],pagination:{count:0,next:null,prev:null}}:page([row()]));
 });
 await provider.listProjectDeployments(1000);await provider.listProjectAliases(1000);expect(calls.map(c=>c.method)).toEqual(['GET','GET','GET']);
 expect(calls[1].url.pathname).toBe('/v6/deployments');expect(calls[2].url.pathname).toBe('/v4/aliases');
});

it('rejects changed metadata between complete traversals',async()=>{
 let calls=0;await expect(read(async()=>page([{...row(),readyState:++calls===1?'READY':'ERROR'}]))).rejects.toThrow('changed between traversals');
 expect(calls).toBe(2);
});

it('rejects duplicate identities and nonadvancing or empty continuation pages',async()=>{
 await expect(read(async()=>page([row(),row()]))).rejects.toThrow('Duplicate');
 for(const next of [1000,1001])await expect(read(async()=>page([row()],next))).rejects.toThrow('cursor');
 await expect(read(async()=>page([],800))).rejects.toThrow('cursor');
 let calls=0;await expect(read(async()=>++calls===1?page([row()],800):page([row('dpl_b',700)],800))).rejects.toThrow('cursor');
});

it('bounds deployment counts pages and retained metadata bytes',async()=>{
 await expect(read(async()=>page([row(),row('dpl_b')]),{maximumDeployments:1})).rejects.toThrow('count bound');
 await expect(read(async()=>page([row()],800),{maximumPages:1})).rejects.toThrow('page bound');
 let call=0;
 await expect(read(async()=>{const index=call++,created=1000-index;
  return page(Array.from({length:100},(_,i)=>({...row('dpl_'+'a'.repeat(230)+String(index*100+i),created),url:'a'.repeat(242)+'.vercel.app'})),created-1);
 },{},AbortSignal.timeout(10000))).rejects.toThrow('metadata byte bound');
});

it('rejects foreign malformed or future metadata and invalid input before further reads',async()=>{
 for(const value of [{...row(),projectId:'prj_foreign'},{...row(),id:'dpl_different'},{...row(),created:1001},
  {...row(),url:'https://foreign.example/private'},{...row(),created:1.5},{...row(),uid:'../foreign'}]){
  await expect(read(async()=>page([value]))).rejects.toThrow();
 }
 let calls=0;await expect(read(async()=>{calls++;return page([]);},{referencedDeploymentIds:['dpl_a','dpl_a']})).rejects.toThrow('Unique');
 expect(calls).toBe(0);
});

it('honors cancellation before requests and after a metadata response',async()=>{
 const cancelled=new AbortController();cancelled.abort();let calls=0;
 await expect(read(async()=>{calls++;return page([]);},{},cancelled.signal)).rejects.toThrow();expect(calls).toBe(0);
 const during=new AbortController();await expect(read(async()=>{calls++;during.abort();return page([]);},{},during.signal)).rejects.toThrow();expect(calls).toBe(1);
});
