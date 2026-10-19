import {it,expect,vi,afterEach} from 'vitest';
import {readManagedApprovedHostBindings,requireManagedApprovedHostBindings} from '../../../lib/server/operations/managed-approved-host-bindings';
const sha='a'.repeat(40),scope={projectId:'prj_original',teamId:'team_original',token:'controlled-token',target:'preview' as const,deploymentId:'dpl_preview',sourceCommit:sha,approvedHosts:['preview.vercel.app','app.example.com']};
function transport(mode='normal'){
 let projectReads=0;
 return vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);expect(url.origin).toBe('https://api.vercel.com');expect(request.method).toBe('GET');expect(request.redirect).toBe('error');expect(request.headers.get('authorization')).toBe('Bearer controlled-token');expect(url.searchParams.get('teamId')).toBe(scope.teamId);
  if(url.pathname==='/v9/projects/prj_original'){projectReads++;return Response.json({id:mode==='foreign'?'prj_foreign':scope.projectId,accountId:scope.teamId,targets:{production:{id:mode==='project-drift'&&projectReads>1?'dpl_other':'dpl_production'}}});}
  const identity=decodeURIComponent(url.pathname.split('/').at(-1)!);let id=identity.includes('.')?(identity==='preview.vercel.app'?'dpl_preview':'dpl_production'):identity;
  if(mode==='old'&&identity==='app.example.com')id='dpl_old';
  return Response.json({id,projectId:scope.projectId,ownerId:scope.teamId,readyState:'READY',target:id==='dpl_production'?'production':null,meta:{githubCommitSha:(mode==='wrong-source'&&id==='dpl_preview'||mode==='host-source-drift'&&identity==='app.example.com')?'b'.repeat(40):sha}});
 });
}
afterEach(()=>vi.restoreAllMocks());
it('binds each allowed host to the selected Preview or current Production baseline',async()=>{
 const fetch=transport();const proof=await readManagedApprovedHostBindings(scope,new AbortController().signal);expect(proof.rows.map(row=>[row.host,row.deploymentId])).toEqual([['app.example.com','dpl_production'],['preview.vercel.app','dpl_preview']]);expect(proof).toMatchObject({providerReadVerified:true,protectionCredentialsVerified:false,httpAdmissionClosed:false,restorationReady:false});expect(fetch).toHaveBeenCalledTimes(6);expect(requireManagedApprovedHostBindings(proof,scope)).toBe(proof);expect(()=>requireManagedApprovedHostBindings({...proof},scope)).toThrow('Genuine fresh');expect(()=>requireManagedApprovedHostBindings(proof,{...scope,sourceCommit:'b'.repeat(40)})).toThrow('exact');
});
it('rejects old foreign mismatched-source and changing Production bindings',async()=>{
 for(const mode of ['old','foreign','wrong-source','project-drift','host-source-drift']){transport(mode);await expect(readManagedApprovedHostBindings(scope,new AbortController().signal)).rejects.toThrow();vi.restoreAllMocks();}
});
it('requires an approved selected host and exact canonical unique hostnames',async()=>{
 transport();await expect(readManagedApprovedHostBindings({...scope,approvedHosts:['app.example.com']},new AbortController().signal)).rejects.toThrow('no approved host');
 for(const approvedHosts of [['APP.example.com'],['app.example.com','app.example.com'],['https://app.example.com']])await expect(readManagedApprovedHostBindings({...scope,approvedHosts},new AbortController().signal)).rejects.toThrow();
});
it('requires the selected Production deployment to be the actual current baseline and honors cancellation',async()=>{
 transport();await expect(readManagedApprovedHostBindings({...scope,target:'production'},new AbortController().signal)).rejects.toThrow('Production baseline');vi.restoreAllMocks();
 const fetch=transport(),controller=new AbortController();controller.abort();await expect(readManagedApprovedHostBindings(scope,controller.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
