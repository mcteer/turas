import {it,expect,vi,afterEach} from 'vitest';
import {managedEdgeRead,pinManagedControlEdge} from '../../../lib/server/operations/managed-edge-transport';
const state=vi.hoisted(()=>({authorized:true,certificateValid:true,wrongPeer:false,flushes:0,customDnsConsulted:0,options:[] as any[],agentOptions:[] as any[],beforeSecure:null as null|(()=>void),largeBody:false}));
vi.mock('node:tls',async original=>({...await original<typeof import('node:tls')>(),checkServerIdentity:(host:string,cert:{host:string})=>state.certificateValid&&host===cert.host?undefined:Error('Certificate mismatch')}));
vi.mock('node:https',async()=>{
 const {EventEmitter}=await import('node:events');
 return {Agent:class{constructor(options:unknown){state.agentOptions.push(options);}destroy(){}},request:(options:any,respond:(response:any)=>void)=>{
  state.options.push(options);const req=new EventEmitter() as any;req.reusedSocket=false;req.destroy=()=>{queueMicrotask(()=>req.emit('error',Error('Destroyed')));};
  req.end=()=>{state.flushes++;const response=new EventEmitter() as any;response.complete=true;response.statusCode=401;response.rawHeaders=['content-type','application/json','x-turas-code-version','a'.repeat(40)];response.destroy=()=>{};respond(response);queueMicrotask(()=>{response.emit('data',state.largeBody?Buffer.alloc(65537):Buffer.from(JSON.stringify({error:{code:'authentication_required'}})));response.emit('end');});};
  options.signal.addEventListener('abort',()=>req.emit('error',Error('Aborted')),{once:true});
  queueMicrotask(()=>{
   let address='::ffff:76.76.21.21';if(options.lookup)options.lookup(options.hostname,{all:false},(_error:unknown,pinned:string)=>{address=state.wrongPeer?'198.51.100.77':pinned;});else if(!options.hostname.endsWith('.vercel.app')){state.customDnsConsulted++;address='198.51.100.77';}
   const socket=new EventEmitter() as any;socket.authorized=state.authorized;socket.remoteAddress=address;socket.getPeerCertificate=()=>({host:options.servername});req.emit('socket',socket);state.beforeSecure?.();socket.emit('secureConnect');
  });return req;
 }};
});
const host='immutable.vercel.app',sha='a'.repeat(40),read=()=>managedEdgeRead({host,headers:{'x-vercel-protection-bypass':'controlled_secret'},signal:new AbortController().signal});
afterEach(()=>{vi.useRealTimers();Object.assign(state,{authorized:true,certificateValid:true,wrongPeer:false,flushes:0,customDnsConsulted:0,options:[],agentOptions:[],beforeSecure:null,largeBody:false});});
it('mints an edge pin only from genuine version-bound authenticated provider transport',async()=>{
 const response=await read(),pin=pinManagedControlEdge(response,{host,sourceCommit:sha});expect(pin).toMatchObject({controlHost:host,projectAuthorityVerified:false});expect(state.flushes).toBe(1);expect(()=>pinManagedControlEdge({...response},{host,sourceCommit:sha})).toThrow('Genuine');
 response.headers.set('x-turas-code-version','b'.repeat(40));expect(()=>pinManagedControlEdge(response,{host,sourceCommit:'b'.repeat(40)})).toThrow('Genuine');
 expect(state.agentOptions[0]).toEqual({keepAlive:false,maxCachedSessions:0,proxyEnv:{NODE_ENV:'production'},autoSelectFamily:false});
});
it('pins custom-domain connections without consulting moved DNS and retains exact host SNI and certificate checks',async()=>{
 const response=await read(),pin=pinManagedControlEdge(response,{host,sourceCommit:sha});await managedEdgeRead({host:'custom.example.com',headers:{'x-vercel-protection-bypass':'controlled_secret'},signal:new AbortController().signal,pin});
 expect(state.customDnsConsulted).toBe(0);expect(state.options[1]).toMatchObject({hostname:'custom.example.com',servername:'custom.example.com',rejectUnauthorized:true,family:4,method:'GET',path:'/api/auth/session'});expect(state.options[1].headers).not.toHaveProperty('host');expect(state.options[1].lookup).toBeTypeOf('function');expect(state.flushes).toBe(2);
});
it('never flushes secrets when the TLS certificate authorization or actual pinned peer fails',async()=>{
 const response=await read(),pin=pinManagedControlEdge(response,{host,sourceCommit:sha});
 for(const change of [{authorized:false},{certificateValid:false},{wrongPeer:true}]){Object.assign(state,{authorized:true,certificateValid:true,wrongPeer:false,flushes:0},change);await expect(managedEdgeRead({host:'custom.example.com',headers:{cookie:'controlled_cookie'},signal:new AbortController().signal,pin})).rejects.toThrow('Authenticated edge');expect(state.flushes).toBe(0);}
});
it('rejects copied or expired pins cancellation during connection and oversized bodies',async()=>{
 const response=await read(),pin=pinManagedControlEdge(response,{host,sourceCommit:sha});state.flushes=0;
 await expect(managedEdgeRead({host:'custom.example.com',headers:{},signal:new AbortController().signal,pin:{...pin}})).rejects.toThrow('Genuine');expect(state.flushes).toBe(0);
 vi.useFakeTimers({toFake:['Date']});state.beforeSecure=()=>vi.setSystemTime(Date.now()+300001);await expect(managedEdgeRead({host:'custom.example.com',headers:{cookie:'controlled_cookie'},signal:new AbortController().signal,pin})).rejects.toThrow('Authenticated edge');expect(state.flushes).toBe(0);vi.useRealTimers();state.beforeSecure=null;
 const controller=new AbortController();state.beforeSecure=()=>controller.abort();await expect(managedEdgeRead({host,headers:{cookie:'controlled_cookie'},signal:controller.signal})).rejects.toThrow();expect(state.flushes).toBe(0);state.beforeSecure=null;
 state.largeBody=true;await expect(read()).rejects.toThrow('Authenticated edge');state.largeBody=false;
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+300001);await expect(managedEdgeRead({host:'custom.example.com',headers:{},signal:new AbortController().signal,pin})).rejects.toThrow('deadline');
});
it('refuses unpinned custom hosts caller routing headers and nonfixed paths before creating a connection',async()=>{
 await expect(managedEdgeRead({host:'custom.example.com',headers:{},signal:new AbortController().signal})).rejects.toThrow('Genuine');
 await expect(managedEdgeRead({host,headers:{host:'foreign.example.com'},signal:new AbortController().signal})).rejects.toThrow('headers');
 await expect(managedEdgeRead({host,headers:{},query:'?other=unsupported',signal:new AbortController().signal})).rejects.toThrow('path');for(const query of ['?x-vercel-protection-bypass='+('a'.repeat(8193)),'?x-vercel-set-bypass-cookie=true&x-vercel-set-bypass-cookie=true'])await expect(managedEdgeRead({host,headers:{},query,signal:new AbortController().signal})).rejects.toThrow('query');expect(state.options).toHaveLength(0);
});
