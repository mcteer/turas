import {randomUUID} from 'node:crypto';
import {it,expect,vi,afterEach} from 'vitest';
import {readManagedApprovedHostBindings} from '../../../lib/server/operations/managed-approved-host-bindings';
import {verifyManagedProtectionControls,isManagedProtectionChallenge} from '../../../lib/server/operations/managed-protection-controls';
vi.mock('../../../lib/server/operations/managed-edge-transport',()=>({managedEdgeRead:async(input:{host:string;headers:Record<string,string>;query?:string;signal:AbortSignal})=>{const response=await fetch('https://'+input.host+'/api/auth/session'+(input.query??''),{method:'GET',headers:input.headers,redirect:'manual',signal:input.signal});return {status:response.status,headers:response.headers,body:Buffer.from(await response.arrayBuffer())};},pinManagedControlEdge:()=>Object.freeze({contract:'controlled-edge-pin'})}));
const sha='a'.repeat(40),secret='controlled_current_bypass_secret',host='current.vercel.app',original='https://'+host+'/api/auth/session';
const scope={projectId:'prj_original',teamId:'team_original',token:'api-token',target:'production' as const,deploymentId:'dpl_current',sourceCommit:sha,approvedHosts:[host]};
async function fixture(mode='normal'){
 const admissions:string[]=[],observations:string[]=[];let applicationRequests=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);
  if(url.origin==='https://api.vercel.com'){
   if(url.pathname.startsWith('/v9/projects/'))return Response.json({id:scope.projectId,accountId:scope.teamId,targets:{production:{id:scope.deploymentId}}});
   return Response.json({id:scope.deploymentId,url:host,projectId:scope.projectId,ownerId:scope.teamId,readyState:'READY',target:'production',meta:{githubCommitSha:sha}});
  }
  applicationRequests++;expect(url.origin).toBe('https://'+host);expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');
  const protectedResponse=()=>new Response(null,{status:302,headers:{location:'https://vercel.com/sso-api?url='+encodeURIComponent(original)+'&nonce=controlled'}});
  const authenticated=request.headers.get('x-vercel-protection-bypass')===secret||url.searchParams.get('x-vercel-protection-bypass')===secret||request.headers.get('cookie')==='_vercel_jwt=controlled_provider_issued_cookie';
  if(!authenticated&&mode!=='unprotected')return protectedResponse();
  if(mode==='revoked'&&authenticated)return protectedResponse();
  if(request.headers.has('x-vercel-set-bypass-cookie'))return new Response(null,{status:307,headers:{location:mode==='foreign-cookie'?'https://foreign.example.com/':original,'set-cookie':'_vercel_jwt=controlled_provider_issued_cookie; Path=/; Secure; HttpOnly; SameSite=Lax'}});
  return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'x-turas-code-version':mode==='wrong-release'?'b'.repeat(40):sha}});
 });
 const bindings=await readManagedApprovedHostBindings(scope,new AbortController().signal);
 return {bindings,scope,host,secret,signal:new AbortController().signal,admit:async(kind:string)=>{admissions.push(kind);return randomUUID();},observe:async(kind:string)=>{observations.push(kind);},observations,admissions,applicationRequests:()=>applicationRequests};
}
afterEach(()=>vi.restoreAllMocks());
it('verifies actual protected negative header query and provider-issued cookie controls with per-request admission',async()=>{
 const input=await fixture(),proof=await verifyManagedProtectionControls(input);expect(proof).toMatchObject({validCurrentProtectionFormsVerified:true,forms:['header','query','issued-cookie'],requests:5,oldHostHttpAdmissionClosed:false,restorationReady:false});expect(input.applicationRequests()).toBe(5);expect(input.admissions).toHaveLength(5);expect(input.observations).toEqual(input.admissions);expect(JSON.stringify(proof)).not.toContain(secret);expect(JSON.stringify(proof)).not.toContain('controlled_provider_issued_cookie');
});
it('rejects unprotected hosts revoked tokens wrong releases and foreign bootstrap redirects',async()=>{
 for(const mode of ['unprotected','revoked','wrong-release','foreign-cookie']){const input=await fixture(mode);await expect(verifyManagedProtectionControls(input)).rejects.toThrow();vi.restoreAllMocks();}
});
it('rejects cloned bindings and never dispatches after admission denial or cancellation',async()=>{
 const input=await fixture();await expect(verifyManagedProtectionControls({...input,bindings:{...input.bindings}})).rejects.toThrow('Genuine fresh');expect(input.applicationRequests()).toBe(0);
 await expect(verifyManagedProtectionControls({...input,admit:async()=>{throw Error('Original finite request limit');}})).rejects.toThrow('finite request');expect(input.applicationRequests()).toBe(0);
 const controller=new AbortController();controller.abort();await expect(verifyManagedProtectionControls({...input,signal:controller.signal})).rejects.toThrow();expect(input.applicationRequests()).toBe(0);
 const duplicate=randomUUID();await expect(verifyManagedProtectionControls({...input,admit:async()=>duplicate})).rejects.toThrow('Distinct persistent');expect(input.applicationRequests()).toBe(1);
});
it('recognizes only fixed-provider challenges returning to the exact requested host and path',()=>{
 expect(isManagedProtectionChallenge(302,'https://vercel.com/sso-api?url='+encodeURIComponent(original),original)).toBe(true);
 for(const location of ['https://foreign.example.com/sso-api?url='+encodeURIComponent(original),'https://vercel.com/sso-api?url='+encodeURIComponent('https://other.vercel.app/api/auth/session'),'https://vercel.com/login?url='+encodeURIComponent(original)])expect(isManagedProtectionChallenge(302,location,original)).toBe(false);
 expect(isManagedProtectionChallenge(200,'https://vercel.com/sso-api?url='+encodeURIComponent(original),original)).toBe(false);
});
