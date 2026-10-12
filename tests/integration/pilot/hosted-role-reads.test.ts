import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {provisionPilotWorkspace} from '../../../scripts/provision-pilot-workspace';
import {pilotHostedScopeSchema,type PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {runHostedReadChecks} from '../../../scripts/pilot-hosted-http';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {POST as login} from '../../../app/api/auth/login/route';
import {POST as logout} from '../../../app/api/auth/logout/route';
import {GET as session} from '../../../app/api/auth/session/route';
import {GET as customers} from '../../../app/api/customers/route';
import {GET as status} from '../../../app/api/operations/status/route';
import {GET as gaps} from '../../../app/api/product-gaps/route';
const transport:typeof fetch=async(input,options)=>{
 const request=new Request(String(input),options),path=new URL(request.url).pathname;
 if(path==='/api/auth/login'&&request.method==='POST')return login(request);
 if(path==='/api/auth/logout'&&request.method==='POST')return logout(request);
 if(path==='/api/auth/session'&&request.method==='GET')return session(request);
 if(path==='/api/customers'&&request.method==='GET')return customers(request);
 if(path==='/api/operations/status'&&request.method==='GET')return status(request);
 if(path==='/api/product-gaps'&&request.method==='GET')return gaps(request);
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
