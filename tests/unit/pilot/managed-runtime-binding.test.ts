import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {databaseTargetDigest} from '../../../lib/server/operations/database-binding';
import {verifyManagedRuntimeBinding} from '../../../scripts/pilot-managed-runtime-binding';
const connection='postgres://owner:private-database-key@ep-synthetic.neon.tech/neondb?sslmode=verify-full';
const scope={contract:'pilot-hosted-scope-v1' as const,runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:'https://synthetic.vercel.app',environmentMarker:'synthetic-preview',workspaceId:randomUUID(),target:'production' as const,sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)};
const recoveryId=randomUUID(),controlRevision=2,token='synthetic-platform-token',session={contract:'pilot-hosted-operations-session-v1' as const,origin:scope.origin,cookie:'__Host-turas_session='+'s'.repeat(43)};
function observation(){return {contract:'pilot-operational-database-binding-v1',databaseBindingDigest:databaseTargetDigest(connection,scope.environmentMarker),environmentId:scope.environmentMarker,schemaVersion:CURRENT_SCHEMA_VERSION,codeVersion:scope.sourceCommit,mode:'locked',controlRevision,recoveryId,measuredAt:new Date().toISOString(),effectiveRuntimeRole:true,directRuntimeLogin:true};}
function fixture(patch:Record<string,unknown>={},deploymentPatch:Record<string,unknown>={}){
 const calls:{url:string;method:string}[]=[];let appCalls=0;
 const transport:typeof fetch=async(url,options)=>{
  const path=String(url),headers=new Headers(options?.headers);calls.push({url:path,method:String(options?.method)});expect(options?.redirect).toBe('error');
  if(path.startsWith('https://api.vercel.com/')){expect(headers.get('authorization')).toBe('Bearer '+token);expect(headers.has('cookie')).toBe(false);return Response.json({id:scope.deploymentId,projectId:scope.projectId,ownerId:scope.teamId,target:'production',readyState:'READY',meta:{githubCommitSha:scope.sourceCommit},...deploymentPatch});}
  expect(path).toBe(scope.origin+'/api/operations/status');expect(headers.get('cookie')).toBe(session.cookie);expect(headers.has('authorization')).toBe(false);appCalls++;
  return Response.json({data:{ready:false,connectionBinding:{...observation(),...patch}}},{headers:{'x-turas-code-version':scope.sourceCommit}});
 };return {transport,calls,appCalls:()=>appCalls};
}
const input=()=>({scope,session,sourceConnection:connection,recoveryId,controlRevision,token,signal:AbortSignal.timeout(1000)});
// Transport fixtures prove binding decisions only, never actual hosted proof.
it('binds the database endpoint independently of passwords pooling and role overrides',()=>{
 const hash=databaseTargetDigest(connection,'env');
 expect(databaseTargetDigest('postgres://runtime:other-secret@ep-synthetic-pooler.neon.tech/neondb?options=-c%20role%3Dturas_runtime','env')).toBe(hash);
 for(const changed of ['postgres://owner:private@other.neon.tech/neondb','postgres://owner:private@ep-synthetic.neon.tech/other','postgres://owner:private@ep-synthetic.neon.tech:6543/neondb'])expect(databaseTargetDigest(changed,'env')).not.toBe(hash);
 expect(databaseTargetDigest(connection,'other-env')).not.toBe(hash);
 expect(()=>databaseTargetDigest(connection,'env','wrong_database')).toThrow('Database target binding unavailable');
 expect(()=>databaseTargetDigest('not-a-url-private-key','env')).toThrow('Database target binding unavailable');
});
it('verifies platform deployment and alias before reading the authenticated locked binding',async()=>{
 const f=fixture(),result=await verifyManagedRuntimeBinding({...input(),transport:f.transport});
 expect(f.calls).toHaveLength(3);expect(f.calls[1].url).toBe('https://api.vercel.com/v13/deployments/synthetic.vercel.app?teamId=team_synthetic&withGitRepoInfo=true');expect(f.appCalls()).toBe(1);expect(f.calls.every(call=>call.method==='GET')).toBe(true);
 expect(result).toMatchObject({authenticatedStatusVerified:true,serviceOpened:false,restorationReady:false});
 for(const secret of [token,session.cookie,'private-database-key'])expect(JSON.stringify(result)).not.toContain(secret);
});
it('rejects stale foreign or role-overridden database observations',async()=>{
 for(const patch of [{databaseBindingDigest:'f'.repeat(64)},{environmentId:'foreign'},{schemaVersion:77},{schemaVersion:80},{schemaVersion:CURRENT_SCHEMA_VERSION+1},{codeVersion:'d'.repeat(40)},{mode:'open'},{controlRevision:3},{recoveryId:randomUUID()},{effectiveRuntimeRole:false},{directRuntimeLogin:false},{measuredAt:new Date(Date.now()-120000).toISOString()},{measuredAt:new Date(Date.now()+120000).toISOString()}]){
  const f=fixture(patch);await expect(verifyManagedRuntimeBinding({...input(),transport:f.transport})).rejects.toThrow();expect(f.calls.every(call=>call.method==='GET')).toBe(true);
 }
});
it('withholds application cookies on foreign deployment metadata and never follows redirects',async()=>{
 for(const patch of [{projectId:'prj_foreign'},{ownerId:'team_foreign'},{target:null},{meta:{githubCommitSha:'d'.repeat(40)}}]){const f=fixture({},patch);await expect(verifyManagedRuntimeBinding({...input(),transport:f.transport})).rejects.toThrow();expect(f.appCalls()).toBe(0);}
 const rebound=fixture();await expect(verifyManagedRuntimeBinding({...input(),transport:async(url,options)=>String(url).includes('/deployments/synthetic.vercel.app?')?Response.json({id:'dpl_foreign',projectId:scope.projectId,ownerId:scope.teamId,target:'production',readyState:'READY',meta:{githubCommitSha:scope.sourceCommit}}):rebound.transport(url,options)})).rejects.toThrow();expect(rebound.appCalls()).toBe(0);
 const f=fixture();await expect(verifyManagedRuntimeBinding({...input(),session:{...session,origin:'https://foreign.vercel.app'},transport:f.transport})).rejects.toThrow('session origin');expect(f.calls).toHaveLength(0);
 const redirected=fixture();await expect(verifyManagedRuntimeBinding({...input(),transport:async(url,options)=>String(url).startsWith(scope.origin)?new Response(null,{status:302,headers:{location:'https://foreign.vercel.app'}}):redirected.transport(url,options)})).rejects.toThrow('response unavailable');
});
