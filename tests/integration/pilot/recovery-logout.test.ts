import {it,expect} from 'vitest';
import {Client} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {authenticateDemoPrincipal} from '../../../lib/server/auth/credentials';
import {issueSession,getCurrentSession,sessionCookieName,hashSessionToken} from '../../../lib/server/auth/sessions';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {requireOperationalOpen} from '../../../lib/server/operations/admission';
import {withTransaction} from '../../../lib/server/db/client';
import {POST as logout} from '../../../app/api/auth/logout/route';
async function fixture(run:(owner:Client,environmentId:string,token:string,request:()=>Request)=>Promise<void>){
 await withPilotEnvironment(async env=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   const identity=await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!);if(!identity)throw Error('Actual owned fixture login required');
   const {token}=await issueSession(identity);
   const request=()=>new Request(env.origin+'/api/auth/logout',{method:'POST',headers:{origin:env.origin,cookie:sessionCookieName()+'='+token,'x-csrf-token':csrfTokenForSession(token)}});
   await run(owner,env.environmentId,token,request);
  }finally{await owner.end();}
 },{postgresMajor:18,deadlineMs:120000});
}
it('revokes a real session while locked and never revives it after reopening',async()=>fixture(async(owner,environmentId,token,request)=>{
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[environmentId]);
 const response=await logout(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({data:{signedOut:true}});
 expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[hashSessionToken(token)])).rows[0].revoked_at).toBeInstanceOf(Date);
 await owner.query("UPDATE operations_control SET mode='open',revision=revision+1 WHERE environment_id=$1",[environmentId]);
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN+'/api/auth/session',{headers:{cookie:sessionCookieName()+'='+token}}))).toBeNull();
}),150000);
it('rejects invalid origin and CSRF without revoking a locked session',async()=>fixture(async(owner,environmentId,token,request)=>{
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[environmentId]);
 for(const patch of [{origin:'https://unrelated.example.invalid'},{'x-csrf-token':'0'.repeat(64)}]){
  const original=request(),headers=new Headers(original.headers);for(const [name,value] of Object.entries(patch))headers.set(name,value);
  expect((await logout(new Request(original.url,{method:'POST',headers}))).status).toBe(403);
 }
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[hashSessionToken(token)])).rows[0].revoked_at).toBeNull();
}),150000);
it('does not transfer logout authority to ordinary reads mutations or cancellation',async()=>fixture(async(owner,environmentId,token,request)=>{
 await owner.query("UPDATE operations_control SET mode='quiescing',revision=revision+1 WHERE environment_id=$1",[environmentId]);
 const actor=await getCurrentSession(request(),'session-revocation');expect(actor).not.toBeNull();
 expect(await getCurrentSession(request())).toBeNull();
 for(const [path,method] of [['/api/auth/logout','GET'],['/api/customers','POST'],['/api/operations/status','POST']])expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN+path,{method,headers:{cookie:sessionCookieName()+'='+token}}),'session-revocation')).toBeNull();
 expect(await getCurrentSession(request(),'cancellation')).toBeNull();
 await expect(withTransaction(db=>requireOperationalOpen(db,actor!))).rejects.toMatchObject({status:503});
 expect((await logout(request())).status).toBe(200);
}),150000);
it('retains exact revocation time on repeated logout during recovery',async()=>fixture(async(owner,environmentId,token,request)=>{
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[environmentId]);
 expect((await logout(request())).status).toBe(200);
 const first=(await owner.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[hashSessionToken(token)])).rows[0].revoked_at;
 expect((await logout(request())).status).toBe(200);
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[hashSessionToken(token)])).rows[0].revoked_at).toEqual(first);
}),150000);
