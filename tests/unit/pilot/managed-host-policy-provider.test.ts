import {afterEach,it,expect,vi} from 'vitest';
import {readManagedHostPolicy} from '../../../lib/server/operations/managed-host-policy-provider';
const scope={projectId:'prj_original',teamId:'team_original',token:'controlled-token',approvedHosts:['current.vercel.app']};
const unavailable={error:{code:'forbidden',message:'Conditional bypass is unavailable for this team.'}};
const policy=()=>({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:'prj_original#active',id:'config_original',ips:[],changes:[],version:1,ownerId:'team_original',rules:[{id:'rule_original',name:'Current hosts',description:'Controlled host fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:scope.approvedHosts}]}],action:{mitigate:{action:'deny'}}}]});
function transport(overrides:Record<string,{status?:number;body:unknown}>={}){
 return vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);expect(url.origin).toBe('https://api.vercel.com');expect(request.method).toBe('GET');expect(request.redirect).toBe('error');expect(request.headers.get('authorization')).toBe('Bearer controlled-token');expect(request.headers.has('x-vercel-environment')).toBe(false);expect(url.searchParams.get('teamId')).toBe(scope.teamId);
  const defaults:Record<string,{status?:number;body:unknown}>={
   '/v9/projects/prj_original':{body:{id:scope.projectId,accountId:scope.teamId}},
   '/v1/security/firewall/config/active':{body:policy()},
   '/v1/security/firewall/bypass/rules':{status:403,body:unavailable},
   '/v1/security/firewall/bypass':{body:{result:[]}},
  };
  const response=overrides[url.pathname]??defaults[url.pathname];if(!response)throw Error('Unexpected fixed policy route');
  if(!url.pathname.startsWith('/v9/'))expect(url.searchParams.get('projectId')).toBe(scope.projectId);
  return Response.json(response.body,{status:response.status??200});
 });
}
afterEach(()=>vi.restoreAllMocks());
it('reads exact current project policy and explicit unavailable diagnostics without granting HTTP closure',async()=>{
 const fetch=transport();expect(await readManagedHostPolicy(scope,new AbortController().signal)).toMatchObject({contract:'pilot-managed-host-policy-read-v1',providerReadVerified:true,conditionalBypassFeatureUnavailable:true,systemBypassInventoryEmpty:true,httpAdmissionClosed:false,restorationReady:false});expect(fetch).toHaveBeenCalledTimes(4);
});
it('rejects foreign project and ineffective active policy before bypass observations',async()=>{
 transport({'/v9/projects/prj_original':{body:{id:'prj_foreign',accountId:scope.teamId}}});await expect(readManagedHostPolicy(scope,new AbortController().signal)).rejects.toThrow('binding');vi.restoreAllMocks();
 transport({'/v1/security/firewall/config/active':{body:{...policy(),firewallEnabled:false}}});await expect(readManagedHostPolicy(scope,new AbortController().signal)).rejects.toThrow();
});
it('does not interpret arbitrary denial or a newly enabled conditional feature as an empty inventory',async()=>{
 for(const response of [{status:403,body:{error:{code:'forbidden',message:'Access denied'}}},{status:200,body:{rules:[]}}]){transport({'/v1/security/firewall/bypass/rules':response});await expect(readManagedHostPolicy(scope,new AbortController().signal)).rejects.toThrow('Conditional bypass');vi.restoreAllMocks();}
});
it('rejects nonempty or paginated system exceptions and honors original cancellation',async()=>{
 for(const body of [{result:[{id:'exception'}]},{result:[],pagination:{next:'unread'}}]){transport({'/v1/security/firewall/bypass':{body}});await expect(readManagedHostPolicy(scope,new AbortController().signal)).rejects.toThrow('System bypass');vi.restoreAllMocks();}
 const fetch=transport(),controller=new AbortController();controller.abort();await expect(readManagedHostPolicy(scope,controller.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
