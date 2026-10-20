import {GET as customerProfile} from '../../../app/api/customers/[customerId]/profile/route';
import {runHostedMembershipBoundary} from '../../../scripts/pilot-hosted-membership';
import {PATCH as membershipPatch} from '../../../app/api/admin/memberships/[id]/route';
import {issueSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {provisionPilotWorkspace} from '../../../scripts/provision-pilot-workspace';
import {pilotHostedScopeSchema,type PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {runHostedReadChecks} from '../../../scripts/pilot-hosted-http';
import {runHostedConversationBoundary} from '../../../scripts/pilot-hosted-conversations';
import {readHostedConfiguration} from '../../../lib/server/operations/hosted-configuration';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {POST as login} from '../../../app/api/auth/login/route';
import {POST as logout} from '../../../app/api/auth/logout/route';
import {GET as session} from '../../../app/api/auth/session/route';
import {GET as customers} from '../../../app/api/customers/route';
import {GET as status} from '../../../app/api/operations/status/route';
import {GET as gaps} from '../../../app/api/product-gaps/route';
import {POST as createConversation} from '../../../app/api/conversations/route';
import {GET as readConversation,PATCH as archiveConversation} from '../../../app/api/conversations/[id]/route';
const transport:typeof fetch=async(input,options)=>{
 const request=new Request(String(input),options),path=new URL(request.url).pathname;
 if(path==='/api/auth/login'&&request.method==='POST')return login(request);
 if(path==='/api/auth/logout'&&request.method==='POST')return logout(request);
 if(path==='/api/auth/session'&&request.method==='GET')return session(request);
 if(path==='/api/customers'&&request.method==='GET')return customers(request);
 if(path==='/api/operations/status'&&request.method==='GET')return status(request);
 if(path==='/api/product-gaps'&&request.method==='GET')return gaps(request);
 if(path==='/api/conversations'&&request.method==='POST')return createConversation(request);
 const profile=/^\/api\/customers\/([a-f0-9-]+)\/profile$/.exec(path);if(profile&&request.method==='GET')return customerProfile(request,{params:Promise.resolve({customerId:profile[1]})});
 const member=/^\/api\/admin\/memberships\/([a-f0-9-]+)$/.exec(path);if(member&&request.method==='PATCH')return membershipPatch(request,{params:Promise.resolve({id:member[1]})});
 const conversation=/^\/api\/conversations\/([a-f0-9-]+)$/.exec(path);
 if(conversation&&request.method==='GET')return readConversation(request,{params:Promise.resolve({id:conversation[1]})});
 if(conversation&&request.method==='PATCH')return archiveConversation(request,{params:Promise.resolve({id:conversation[1]})});
 throw Error('No unregistered transport or external provider is allowed');
};
async function fixture(run:(scope:PilotHostedScope,runtime:Client,owner:Client)=>Promise<void>){
 await withPilotEnvironment(async env=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});
  await owner.connect();await runtime.connect();
  try{
   const workspaceId=randomUUID(),customerIds=[randomUUID(),randomUUID()],memberships=[{principalId:DEMO_IDS.mcteer,membershipId:randomUUID(),kind:'internal',role:'admin'},{principalId:DEMO_IDS.panel,membershipId:randomUUID(),kind:'internal',role:'member'},{principalId:DEMO_IDS.partner,membershipId:randomUUID(),kind:'partner',role:'member',partnerOrganizationId:randomUUID()}];
   await provisionPilotWorkspace(owner as unknown as PoolClient,{version:'pilot-provision-v1',environmentId:env.environmentId,workspaceId,provisioningId:randomUUID(),memberships,customers:customerIds.map((id,index)=>({id,label:'Read Probe '+index})),grants:[{id:randomUUID(),membershipId:memberships[2].membershipId,customerId:customerIds[0]}]});
   process.env.TURAS_APP_ORIGIN='https://synthetic.vercel.app';
   Object.assign(process.env,{TURAS_PILOT_HOSTED_ADMIN_PASSWORD:process.env.TURAS_DEMO_PASSWORD,TURAS_PILOT_HOSTED_MEMBER_PASSWORD:process.env.PANEL_PASSWORD,TURAS_PILOT_HOSTED_PARTNER_PASSWORD:process.env.PARTNER_PASSWORD});
   const scope=pilotHostedScopeSchema.parse({contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:process.env.TURAS_APP_ORIGIN,environmentMarker:env.environmentId,workspaceId,target:'production',sourceCommit:process.env.TURAS_CODE_VERSION,sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)});
   await run(scope,runtime,owner);
  }finally{await runtime.end();await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
it('proves actual bound roles positive partner listing denied gaps and exact session cleanup',async()=>fixture(async(scope,runtime,owner)=>{
 const result=await runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport);
 expect(result).toMatchObject({passedCases:15,sessionsRevoked:3,customerReferencesVerified:2,providerCalls:0,domainWritesPerformed:0,acceptedJourneysVerified:false,fullHostedCatalogVerified:false});
 expect(result.cases.filter(row=>row.role==='assigned-partner')).toContainEqual({id:'product-gaps-read-boundary',role:'assigned-partner',state:'pass',status:404});
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
 expect((await owner.query('SELECT count(*)::int AS n FROM profile_revisions WHERE workspace_id=$1',[scope.workspaceId])).rows[0].n).toBe(0);
 for(const key of ['TURAS_PILOT_HOSTED_ADMIN_PASSWORD','TURAS_PILOT_HOSTED_MEMBER_PASSWORD','TURAS_PILOT_HOSTED_PARTNER_PASSWORD'])expect(JSON.stringify(result)).not.toContain(process.env[key]);
 const root=await realpath(await mkdtemp(join(tmpdir(),'turas-membership-owned-')));try{const boundary=await runHostedMembershipBoundary({scope,db:runtime,signal:AbortSignal.timeout(30000),transport,evidenceDirectory:root});expect(boundary).toMatchObject({inactiveCookieDenied:true,inactiveLoginDenied:true,originalCookieDeniedAfterRestore:true,freshLoginVerified:true,normalMembershipCommands:2,sessionsRevoked:3,providerCalls:0});expect((await owner.query('SELECT active FROM memberships WHERE id=$1',[boundary.membershipId])).rows[0].active).toBe(true);}finally{await rm(root,{recursive:true,force:true});}
}),210000);
it('refuses missing role credentials before creating sessions or making HTTP calls',async()=>fixture(async(scope,runtime,owner)=>{
 const env={...process.env};delete env.TURAS_PILOT_HOSTED_PARTNER_PASSWORD;let calls=0;
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),async()=>{calls++;throw Error('No HTTP allowed');},env)).rejects.toThrow('explicit hosted role credentials');
 expect(calls).toBe(0);expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('rejects cross workspace customer disclosure and revokes its exact test session on failure',async()=>fixture(async(scope,runtime,owner)=>{
 const leaking:typeof fetch=async(input,options)=>{
  const response=await transport(input,options);
  if(new URL(String(input)).pathname==='/api/customers'){
   const body=await response.json();body.data.items.push({id:DEMO_IDS.sharedCustomer,synthetic:true});return Response.json(body,{headers:response.headers});
  }
  return response;
 };
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),leaking)).rejects.toThrow('scope leaked');
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('rejects a changed serving release and revokes the exact session before failing',async()=>fixture(async(scope,runtime,owner)=>{
 const stale:typeof fetch=async(input,options)=>{
  const response=await transport(input,options);
  if(new URL(String(input)).pathname==='/api/product-gaps')response.headers.set('x-turas-code-version','d'.repeat(40));
  return response;
 };
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),stale)).rejects.toThrow('release version differs');
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('revokes a created session after a malformed login response without logging in again',async()=>fixture(async(scope,runtime,owner)=>{
 let logins=0;
 const malformed:typeof fetch=async(input,options)=>{
  const response=await transport(input,options);
  if(new URL(String(input)).pathname==='/api/auth/login'){
   logins++;await response.body?.cancel();
   return new Response('{invalid',{status:200,headers:response.headers});
  }
  return response;
 };
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),malformed)).rejects.toThrow();
 expect(logins).toBe(1);
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1',[scope.workspaceId])).rows[0].n).toBe(1);
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('revokes the exact newly created session when its parent run is cancelled',async()=>fixture(async(scope,runtime,owner)=>{
 const controller=new AbortController();let logins=0,logouts=0;
 const cancelled:typeof fetch=async(input,options)=>{
  const path=new URL(String(input)).pathname;
  if(path==='/api/auth/logout')logouts++;
  const response=await transport(input,options);
  if(path==='/api/auth/login'){logins++;controller.abort(new Error('Synthetic parent cancellation'));}
  return response;
 };
 await expect(runHostedReadChecks(scope,runtime,controller.signal,cancelled)).rejects.toThrow('Synthetic parent cancellation');
 expect(logins).toBe(1);expect(logouts).toBe(1);
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('cleans its exact bound session when a trusted journey callback fails',async()=>fixture(async(scope,runtime,owner)=>{
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport,process.env,async context=>{
  expect(context.role).toBe('internal-admin');expect(context.customerIds).toHaveLength(2);expect(context.allCustomerIds).toHaveLength(2);
  context.headers.set('cookie','tampered-copy');throw Error('Synthetic journey interruption');
 })).rejects.toThrow('Synthetic journey interruption');
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('exercises actual parked conversation replay ownership archive and restore without native dispatch',async()=>fixture(async(scope,runtime,owner)=>{
 const conversations:string[]=[],proofs:Awaited<ReturnType<typeof runHostedConversationBoundary>>[]=[];
 await runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport,process.env,async context=>{
  const proof=await runHostedConversationBoundary({scope,db:runtime,headers:context.headers,customerId:context.partnerCustomerIds[0],signal:AbortSignal.timeout(30000),transport,foreignConversationIds:conversations});
  proofs.push(proof);conversations.push(proof.conversationId);
 });
 expect(proofs.map(row=>row.foreignOwnerDenials)).toEqual([0,1,2]);
 expect(proofs.every(row=>row.parkedOnly&&row.providerCalls===0&&!row.streamResumeStopVerified&&!row.fullHostedCatalogVerified)).toBe(true);
 const rows=(await owner.query('SELECT customer_id,archived_at,binding_state,eve_session_id FROM conversations WHERE id=ANY($1::uuid[])',[conversations])).rows;
 expect(rows).toHaveLength(3);expect(rows.every(row=>row.archived_at&&row.binding_state==='unbound'&&row.eve_session_id===null)).toBe(true);
 expect(new Set(rows.map(row=>row.customer_id)).size).toBe(1);
 expect((await owner.query('SELECT count(*)::int AS n FROM submitted_messages WHERE conversation_id=ANY($1::uuid[])',[conversations])).rows[0].n).toBe(0);
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('archives the original parked conversation after an uncertain creation response without replacement or native work',async()=>fixture(async(scope,runtime,owner)=>{
 let creates=0,cleanup=0;
 const damaged:typeof fetch=async(input,options)=>{
  const response=await transport(input,options),path=new URL(String(input)).pathname;
  if(path==='/api/conversations'&&options?.method==='POST'){creates++;await response.body?.cancel();return new Response('{invalid',{status:response.status,headers:response.headers});}
  if(path.startsWith('/api/conversations/')&&options?.method==='PATCH')cleanup++;
  return response;
 };
 await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport,process.env,async context=>{
  await runHostedConversationBoundary({scope,db:runtime,headers:context.headers,customerId:context.customerIds[0],signal:AbortSignal.timeout(30000),transport:damaged});
 })).rejects.toThrow();
 expect(creates).toBe(1);expect(cleanup).toBe(1);
 const rows=(await owner.query('SELECT archived_at,binding_state,eve_session_id FROM conversations WHERE workspace_id=$1',[scope.workspaceId])).rows;
 expect(rows).toHaveLength(1);expect(rows[0].archived_at).not.toBeNull();expect(rows[0].binding_state).toBe('unbound');expect(rows[0].eve_session_id).toBeNull();
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
}),210000);
it('blocks journey writes on actual mismatched configuration and revokes the original session',async()=>fixture(async(scope,runtime,owner)=>{
 const pinned='vcr.vercel.com/synthetic/turas/image@sha256:'+'a'.repeat(64);
 const values={TURAS_ENVIRONMENT_ID:scope.environmentMarker,VERCEL_PROJECT_ID:scope.projectId,VERCEL_TEAM_ID:scope.teamId,BLOB_STORE_ID:'store_synthetic',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob',TURAS_JOB_EXECUTOR:'sandbox',TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',TURAS_PILOT_SCANNER_IMAGE:pinned,TURAS_PILOT_PARSER_IMAGE:pinned,TURAS_PILOT_RENDERER_IMAGE:pinned,TURAS_PILOT_JOB_COST_JSON:"{\"maximumDispatches\":32,\"budgetId\":\"00000000-0000-4000-8000-000000000001\",\"scopeDigest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"pricingDigest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}"};
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));let journeyCalls=0;
 try{
  Object.assign(process.env,values);const expected=readHostedConfiguration(values)!;
  const matched=await runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport,process.env,async()=>{journeyCalls++;},expected);
  expect(matched).toMatchObject({sessionsRevoked:3,fullHostedCatalogVerified:false,providerCalls:0});expect(journeyCalls).toBe(3);journeyCalls=0;
  await expect(runHostedReadChecks(scope,runtime,AbortSignal.timeout(60000),transport,process.env,async()=>{journeyCalls++;},{...expected,storeId:'another-store'})).rejects.toThrow('runtime configuration differs');
  expect(journeyCalls).toBe(0);
  expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n).toBe(0);
  expect((await owner.query('SELECT count(*)::int AS n FROM conversations WHERE workspace_id=$1',[scope.workspaceId])).rows[0].n).toBe(0);
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}),210000);

it('refuses a raced unrelated session before scoped membership disable and preserves its access',async()=>fixture(async(scope,runtime,owner)=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'turas-membership-race-')));let extra:Headers|undefined,inserted=false;
 const racing:typeof fetch=async(input,options)=>{if(options?.method==='PATCH'&&JSON.parse(String(options.body)).active===false&&!inserted){inserted=true;const member=(await owner.query('SELECT id FROM memberships WHERE workspace_id=$1 AND principal_id=$2',[scope.workspaceId,DEMO_IDS.panel])).rows[0];const session=await issueSession({principalId:DEMO_IDS.panel,loginName:'panel',displayName:'panel',membershipId:member.id,workspaceId:scope.workspaceId,kind:'internal',role:'member'});extra=new Headers({origin:scope.origin,cookie:sessionCookieName()+'='+session.token,'content-type':'application/json','x-csrf-token':csrfTokenForSession(session.token)});}return transport(input,options);};
 try{await expect(runHostedMembershipBoundary({scope,db:runtime,signal:AbortSignal.timeout(30000),transport:racing,evidenceDirectory:root})).rejects.toMatchObject({errorCode:'session_fence_changed'});expect(inserted).toBe(true);const target=(await owner.query('SELECT active,revision FROM memberships WHERE workspace_id=$1 AND principal_id=$2',[scope.workspaceId,DEMO_IDS.panel])).rows[0];expect(target.active).toBe(true);expect(Number(target.revision)).toBe(0);const current=await transport(scope.origin+'/api/auth/session',{headers:extra});expect(current.status).toBe(200);await current.body?.cancel();}finally{if(extra){const response=await transport(scope.origin+'/api/auth/logout',{method:'POST',headers:extra});expect(response.status).toBe(200);await response.body?.cancel();}await rm(root,{recursive:true,force:true});}
}),210000);
