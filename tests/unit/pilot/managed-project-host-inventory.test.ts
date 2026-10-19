import {afterEach,it,expect,vi} from 'vitest';
import {readManagedProjectHostInventory,requireManagedProjectHostInventory} from '../../../lib/server/operations/managed-project-host-inventory';
const scope={projectId:'prj_original',teamId:'team_original',token:'controlled-token',target:'preview' as const};
function transport(mode='normal'){
 let aliasReads=0;
 return vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);expect(url.origin).toBe('https://api.vercel.com');expect(request.method).toBe('GET');expect(request.redirect).toBe('error');expect(request.headers.get('authorization')).toBe('Bearer controlled-token');
  if(url.pathname==='/v9/projects/prj_original')return Response.json({id:mode==='foreign'?'prj_foreign':scope.projectId,accountId:scope.teamId});
  expect(request.headers.has('x-vercel-environment')).toBe(false);expect(url.searchParams.has('target')).toBe(false);
  if(url.pathname==='/v6/deployments')return Response.json({deployments:[{uid:'dpl_original',projectId:scope.projectId,created:1000,url:'immutable.vercel.app',target:null,readyState:'READY'}],pagination:{next:null}});
  if(url.pathname==='/v4/aliases'){aliasReads++;return Response.json({aliases:[{uid:'alias_original',alias:mode==='alias-drift'&&aliasReads>1?'changed.example.com':'app.example.com',created:'2026-10-19',createdAt:1000,updatedAt:1000,creator:{},deletedAt:null,deploymentId:'dpl_original',deployment:{id:'dpl_original',url:'immutable.vercel.app'},projectId:scope.projectId,redirect:mode==='redirect'?'https://foreign.example.com':null,redirectStatusCode:null}],pagination:{count:1,next:null,prev:null}});}
  throw Error('Unexpected fixed host-inventory route');
 });
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('privately registers the complete repeated all-target deployment and alias host union',async()=>{
 const fetch=transport(),proof=await readManagedProjectHostInventory(scope,new AbortController().signal);expect(proof.rows.map(row=>row.host)).toEqual(['app.example.com','immutable.vercel.app']);expect(proof).toMatchObject({providerReadVerified:true,httpAdmissionClosed:false,restorationReady:false});expect(fetch).toHaveBeenCalledTimes(6);expect(requireManagedProjectHostInventory(proof,scope)).toBe(proof);expect(Object.isFrozen(proof.rows[0].sources)).toBe(true);
});
it('rejects copied foreign-scope and stale inventories before credential-bearing probes',async()=>{
 transport();const proof=await readManagedProjectHostInventory(scope,new AbortController().signal);expect(()=>requireManagedProjectHostInventory({...proof},scope)).toThrow('Genuine fresh');expect(()=>requireManagedProjectHostInventory(proof,{...scope,projectId:'prj_foreign'})).toThrow('Genuine fresh');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+300001);expect(()=>requireManagedProjectHostInventory(proof,scope)).toThrow('Genuine fresh');
});
it('rejects foreign project changed alias inventories and unsupported redirects',async()=>{
 for(const mode of ['foreign','alias-drift','redirect']){transport(mode);await expect(readManagedProjectHostInventory(scope,new AbortController().signal)).rejects.toThrow();vi.restoreAllMocks();}
});
it('honors original cancellation without issuing metadata requests',async()=>{
 const fetch=transport(),controller=new AbortController();controller.abort();await expect(readManagedProjectHostInventory(scope,controller.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
