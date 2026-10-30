import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {RecoveryServiceTransport} from '../../../lib/server/operations/service-recovery-transport';
// Real loopback HTTP exercises cancellation/cleanup, not hosted authentication
// or recovery acceptance. All credentials and records are disposable fixtures.
async function fixture(run:(value:Awaited<ReturnType<typeof start>>)=>Promise<void>){const value=await start();try{await run(value);}finally{value.server.closeAllConnections();await new Promise<void>((resolve,reject)=>value.server.close(error=>error?reject(error):resolve()));}}
async function start(){
 const token=randomBytes(32).toString('base64url'),oldToken=randomBytes(32).toString('base64url'),oldId=randomUUID(),created=new Map<string,{id:string;cookieHash:string;active:boolean}>(),received:string[]=[];
 let active=false,loseLoginResponse=false;
 const cookie='__Host-turas_session='+token,oldCookie='__Host-turas_session='+oldToken;
 const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
 const server=createServer(async(req,res)=>{
  const path=req.url!;received.push(req.method+' '+path);const chunks=[];for await(const bytes of req)chunks.push(Buffer.from(bytes));const raw=Buffer.concat(chunks).toString(),body=raw?JSON.parse(raw):{};
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(path==='/api/auth/login'){active=true;if(loseLoginResponse){req.socket.destroy();return;}res.setHeader('set-cookie',cookie+'; Secure; HttpOnly; SameSite=Lax');json(200,{data:{}});return;}
  if(path==='/api/auth/logout'){active=false;json(200,{data:{}});return;}
  if(path==='/api/auth/session'){json(active?200:401,{data:{}});return;}
  if(path==='/api/mcp/connections'&&req.method==='POST'){const row={id:randomUUID(),cookieHash:digest(token),active:true};created.set(body.requestKey,row);json(200,{data:{connection:{id:row.id}}});return;}
  const lookup=/^\/api\/mcp\/connections\/requests\/(.+)$/.exec(path);if(lookup){json(200,{data:{confirmed:created.has(lookup[1]),connection:created.get(lookup[1])??null}});return;}
  const revoke=/^\/api\/mcp\/connections\/(.+)\/revoke$/.exec(path);if(revoke){const row=[...created.values()].find(row=>row.id===revoke[1]);if(row)row.active=false;json(row?200:404,{data:{}});return;}
  json(200,{data:{}});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Owned loopback listener required');
 const origin='http://127.0.0.1:'+address.port,abort=new AbortController(),transport=new RecoveryServiceTransport({origin,signal:abort.signal,oldSessionHashes:[digest(oldToken)],oldConnectionIds:[oldId],createdConnection:async input=>input.requestKeys.some(key=>{const row=created.get(key);return row?.id===input.connectionId&&row.cookieHash===input.cookieHash;})});
 const call=async(path:string,method='GET',body?:unknown,selectedCookie=cookie)=>{const response=await transport.fetch(origin+path,{method,headers:{cookie:selectedCookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});await response.arrayBuffer();return response.status;};
 return {server,origin,abort,transport,call,created,received,cookie,oldCookie,oldId,isActive:()=>active,loseLogin:()=>{loseLoginResponse=true;}};
}
it('retires only observed probe credentials after parent cancellation',async()=>fixture(async f=>{
 await f.call('/api/auth/login','POST',{});const requestKey=randomUUID();await f.call('/api/mcp/connections','POST',{requestKey});const connection=f.created.get(requestKey)!;f.abort.abort();
 const before=f.received.length;await expect(f.call('/api/ping')).rejects.toThrow();await expect(f.call('/api/auth/logout','POST',undefined,f.oldCookie)).rejects.toThrow();await expect(f.call('/api/mcp/connections/'+f.oldId+'/revoke','POST',{})).rejects.toThrow();expect(f.received.length).toBe(before);
 expect(await f.call('/api/mcp/connections/requests/'+requestKey)).toBe(200);expect(await f.call('/api/mcp/connections/'+connection.id+'/revoke','POST',{expectedConnectionId:connection.id})).toBe(200);expect(connection.active).toBe(false);
 expect(await f.call('/api/auth/logout','POST')).toBe(200);expect(await f.call('/api/auth/session')).toBe(401);expect(f.isActive()).toBe(false);expect(f.received.filter(value=>value==='POST /api/mcp/connections')).toHaveLength(1);expect(f.transport.snapshot().cleanupRequests).toBe(4);
}));
it('reserves finite cleanup capacity after the ordinary request cap is exhausted',async()=>fixture(async f=>{
 await f.call('/api/auth/login','POST',{});const requestKey=randomUUID();await f.call('/api/mcp/connections','POST',{requestKey});for(let index=2;index<512;index++)await f.call('/api/ping');
 await expect(f.call('/api/ping')).rejects.toThrow('Bounded');expect(f.transport.snapshot().ordinaryRequests).toBe(512);const connection=f.created.get(requestKey)!;
 await f.call('/api/mcp/connections/'+connection.id+'/revoke','POST',{});await f.call('/api/auth/logout','POST');expect(connection.active).toBe(false);expect(f.isActive()).toBe(false);
 for(let index=2;index<32;index++)await f.call('/api/auth/session');await expect(f.call('/api/auth/session')).rejects.toThrow('Bounded');expect(f.transport.snapshot().cleanupRequests).toBe(32);
}),15000);
it('retains uncertainty after a lost login acknowledgment and denies guessed cleanup',async()=>fixture(async f=>{
 f.loseLogin();await expect(f.call('/api/auth/login','POST',{})).rejects.toThrow();expect(f.transport.snapshot()).toMatchObject({unknownLoginAcknowledgement:true,sessionHashes:[]});f.abort.abort();const before=f.received.length;
 await expect(f.call('/api/auth/logout','POST')).rejects.toThrow();await expect(f.call('/api/mcp/connections/requests/'+randomUUID())).rejects.toThrow();await expect(f.transport.fetch('https://foreign.example/api/auth/logout',{method:'POST',signal:f.abort.signal})).rejects.toThrow();expect(f.received.length).toBe(before);expect(f.isActive()).toBe(true);
}));
