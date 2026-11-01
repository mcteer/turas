import {Client} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runPrimaryRecoveryReadChecks} from '../../../scripts/pilot-hosted-http';
import {GET as status} from '../../../app/api/operations/status/route';
import {GET as gaps} from '../../../app/api/product-gaps/route';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment} from '../../../scripts/pilot-environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {POST as login} from '../../../app/api/auth/login/route';
import {POST as logout} from '../../../app/api/auth/logout/route';
import {GET as session} from '../../../app/api/auth/session/route';
import {GET as profile} from '../../../app/api/customers/[customerId]/profile/route';
import {GET as customers} from '../../../app/api/customers/route';
import {POST as createConversation} from '../../../app/api/conversations/route';
import {GET as readConversation} from '../../../app/api/conversations/[id]/route';

it('verifies normal primary role reads conversation privacy and exact logout',async()=>{
 await withPilotEnvironment(async env=>{
  let ownerConversation:string|undefined;
  for(const [username,password] of [['mcteer',process.env.TURAS_DEMO_PASSWORD],['panel',process.env.PANEL_PASSWORD],['partner',process.env.PARTNER_PASSWORD]]){
   const headers=new Headers({origin:env.origin,'content-type':'application/json'});
   const response=await login(new Request(env.origin+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({username,password})}));expect(response.status).toBe(200);
   const cookie=response.headers.getSetCookie()[0].split(';')[0];headers.set('cookie',cookie);
   const dto=(await response.json()).data;expect(dto.workspace).toMatchObject({id:DEMO_IDS.workspace,classification:'primary'});headers.set('x-csrf-token',dto.csrfToken);
   try{
    expect((await session(new Request(env.origin+'/api/auth/session',{headers}))).status).toBe(200);
    const listed=await customers(new Request(env.origin+'/api/customers',{headers}));expect(listed.status).toBe(200);const ids=(await listed.json()).data.items.map((x:any)=>x.id);expect(ids).toContain(DEMO_IDS.sharedCustomer);if(username==='partner')expect(ids).not.toContain(DEMO_IDS.deniedCustomer);
    if(username!=='partner'){const created=await createConversation(new Request(env.origin+'/api/conversations',{method:'POST',headers,body:JSON.stringify({requestKey:randomUUID(),title:'Owned primary privacy check'})}));expect(created.status).toBe(201);const id=(await created.json()).data.id;if(username==='mcteer')ownerConversation=id;}
    expect((await readConversation(new Request(env.origin+'/api/conversations/'+ownerConversation,{headers}),{params:Promise.resolve({id:ownerConversation!})})).status).toBe(username==='mcteer'?200:404);
   }finally{expect((await logout(new Request(env.origin+'/api/auth/logout',{method:'POST',headers}))).status).toBe(200);expect((await session(new Request(env.origin+'/api/auth/session',{headers}))).status).toBe(401);}
  }
  const db=new Client({connectionString:requireOwnedPilotDatabase()});await db.connect();
  const previousOrigin=process.env.TURAS_APP_ORIGIN;process.env.TURAS_APP_ORIGIN='https://recovery.example.test';
  const transport:typeof fetch=async(input,init)=>{
   const request=new Request(String(input),init),path=new URL(request.url).pathname;
   if(path==='/api/auth/login')return login(request);if(path==='/api/auth/logout')return logout(request);if(path==='/api/auth/session')return session(request);
   if(path==='/api/customers')return customers(request);if(path==='/api/operations/status')return status(request);if(path==='/api/product-gaps')return gaps(request);
   const customerMatch=/^\/api\/customers\/([a-f0-9-]+)\/profile$/.exec(path);if(customerMatch)return profile(request,{params:Promise.resolve({customerId:customerMatch[1]})});
   const match=/^\/api\/conversations\/([a-f0-9-]+)$/.exec(path);if(match)return readConversation(request,{params:Promise.resolve({id:match[1]})});
   throw Error('No external transport permitted');
  };
  try{
   const scope={contract:'pilot-hosted-scope-v1' as const,runId:randomUUID(),projectId:'prj_owned',teamId:'team_owned',deploymentId:'dpl_owned',origin:process.env.TURAS_APP_ORIGIN,environmentMarker:env.environmentId,workspaceId:DEMO_IDS.workspace,target:'production' as const,sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)};
   const proof=await runPrimaryRecoveryReadChecks(scope,db,AbortSignal.timeout(30000),transport);
   expect(proof).toMatchObject({sessionsRevoked:3,revokedCookieDenials:3,providerCalls:0,domainWritesPerformed:0});
   expect(proof.cases.filter(row=>row.id==='foreign-owner-conversation-denied')).toHaveLength(3);
   await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id IN(SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE p.login_name='partner') AND state='active'");
   const emptyPartner=await runPrimaryRecoveryReadChecks(scope,db,AbortSignal.timeout(30000),transport);
   expect(emptyPartner.cases.some(row=>row.id==='unassigned-customer-denied'&&row.role==='assigned-partner')).toBe(true);
   const leaking:typeof fetch=async(input,init)=>{const response=await transport(input,init);if(new URL(String(input)).pathname.startsWith('/api/conversations/'))return Response.json({data:{}},{headers:{'x-turas-code-version':scope.sourceCommit}});return response;};
   await expect(runPrimaryRecoveryReadChecks(scope,db,AbortSignal.timeout(30000),leaking)).rejects.toThrow('Foreign owner conversation was disclosed');
   expect((await db.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
  }finally{if(previousOrigin===undefined)delete process.env.TURAS_APP_ORIGIN;else process.env.TURAS_APP_ORIGIN=previousOrigin;await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);

it('denies a retired pilot selection before creating any login session',async()=>{
 await withPilotEnvironment(async env=>{for(const username of ['mcteer','panel','partner']){const response=await login(new Request(env.origin+'/api/auth/login',{method:'POST',headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify({username,password:'unused',workspace:'pilot'})}));expect(response.status).toBe(422);expect(response.headers.get('set-cookie')).toBeNull();}},{postgresMajor:18,deadlineMs:180000});
},210000);

it('denies invalid normal credentials without issuing a cookie',async()=>{
 await withPilotEnvironment(async env=>{const response=await login(new Request(env.origin+'/api/auth/login',{method:'POST',headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify({username:'mcteer',password:'invalid-password'})}));expect(response.status).toBe(401);expect(response.headers.get('set-cookie')).toBeNull();},{postgresMajor:18,deadlineMs:180000});
},210000);
