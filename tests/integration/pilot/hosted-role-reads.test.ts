import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment} from '../../../scripts/pilot-environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {POST as login} from '../../../app/api/auth/login/route';
import {POST as logout} from '../../../app/api/auth/logout/route';
import {GET as session} from '../../../app/api/auth/session/route';
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
    if(username==='mcteer'){const created=await createConversation(new Request(env.origin+'/api/conversations',{method:'POST',headers,body:JSON.stringify({requestKey:randomUUID(),title:'Owned primary privacy check'})}));expect(created.status).toBe(201);ownerConversation=(await created.json()).data.id;}
    expect((await readConversation(new Request(env.origin+'/api/conversations/'+ownerConversation,{headers}),{params:Promise.resolve({id:ownerConversation!})})).status).toBe(username==='mcteer'?200:404);
   }finally{expect((await logout(new Request(env.origin+'/api/auth/logout',{method:'POST',headers}))).status).toBe(200);expect((await session(new Request(env.origin+'/api/auth/session',{headers}))).status).toBe(401);}
  }
 },{postgresMajor:18,deadlineMs:180000});
},210000);

it('denies a retired pilot selection before creating any login session',async()=>{
 await withPilotEnvironment(async env=>{for(const username of ['mcteer','panel','partner']){const response=await login(new Request(env.origin+'/api/auth/login',{method:'POST',headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify({username,password:'unused',workspace:'pilot'})}));expect(response.status).toBe(422);expect(response.headers.get('set-cookie')).toBeNull();}},{postgresMajor:18,deadlineMs:180000});
},210000);

it('denies invalid normal credentials without issuing a cookie',async()=>{
 await withPilotEnvironment(async env=>{const response=await login(new Request(env.origin+'/api/auth/login',{method:'POST',headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify({username:'mcteer',password:'invalid-password'})}));expect(response.status).toBe(401);expect(response.headers.get('set-cookie')).toBeNull();},{postgresMajor:18,deadlineMs:180000});
},210000);
