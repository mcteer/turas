import {createServer,type RequestListener} from 'node:http';
import {it,expect,vi} from 'vitest';
import {probePlanReadiness} from '../../scripts/plan-readiness-probe';

async function withServer(handler:RequestListener,run:(origin:string)=>Promise<void>){
 const server=createServer(handler);
 await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 try{const address=server.address();if(!address||typeof address==='string')throw Error('Owned listener required');await run('http://127.0.0.1:'+address.port);}
 finally{server.closeAllConnections();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
}

it('retains and retires the completed response when the sibling readiness probe times out',async()=>{
 let closed!:()=>void;const retired=new Promise<void>(done=>{closed=done;});
 let authSignal:AbortSignal|null|undefined,abortedAtRetirement:boolean|undefined;
 const actualFetch=globalThis.fetch,spy=vi.spyOn(globalThis,'fetch').mockImplementation((input,init)=>{
  if(String(input).endsWith('/api/auth/session'))authSignal=init?.signal;
  return actualFetch(input,init);
 });
 try{await withServer((request,response)=>{
  if(request.url==='/api/auth/session'){response.once('close',()=>{abortedAtRetirement=authSignal?.aborted;closed();});response.writeHead(401,{'x-private':'PRIVATE_HEADER'});response.write('PRIVATE_BODY');}
 },async origin=>{
  const deadline=Date.now()+2_000;let siblingSettled=false;
  const authPromise=probePlanReadiness(origin,'/api/auth/session',deadline);
  const evePromise=probePlanReadiness(origin,'/eve/v1/health',deadline).then(result=>{siblingSettled=true;return result;});
  const auth=await authPromise;expect(auth).toEqual({status:401,transport:'none'});
  await Promise.race([retired,evePromise.then(()=>{throw Error('Sibling completed before response retirement');})]);
  expect(siblingSettled).toBe(false);expect(abortedAtRetirement).toBe(false);
  const eve=await evePromise;expect(eve.status).toBeNull();expect(['TimeoutError','AbortError']).toContain(eve.transport);
  expect(JSON.stringify({auth,eve})).not.toContain('PRIVATE_');
 });}finally{spy.mockRestore();}
});

it('requires both original same-iteration statuses and cannot admit an expired readiness probe',async()=>{
 let requests=0;
 await withServer((request,response)=>{requests++;response.writeHead(request.url==='/api/auth/session'?401:200);response.end();},async origin=>{
  const deadline=Date.now()+2_000;
  const [auth,eve]=await Promise.all([probePlanReadiness(origin,'/api/auth/session',deadline),probePlanReadiness(origin,'/eve/v1/health',deadline)]);
  expect([auth.status,eve.status]).toEqual([401,200]);expect(requests).toBe(2);
  expect(await probePlanReadiness(origin,'/api/auth/session',Date.now()-1)).toEqual({status:null,transport:'other'});expect(requests).toBe(2);
 });
});
