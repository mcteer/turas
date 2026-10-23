import {createServer,type Server,type RequestListener} from 'node:http';
import {it,expect} from 'vitest';
import {probeArtifactStartupHttp,probeArtifactStartupTransport} from '../../scripts/artifact-startup-probe';
import {processFailureMetadata} from '../../scripts/ci-process-diagnostics';

async function withServer(handler:RequestListener,run:(port:number,closed:Promise<void>)=>Promise<void>){
 const server:Server=createServer(handler);let closeConnection:()=>void=()=>{};
 const closed=new Promise<void>(resolve=>{closeConnection=resolve;});
 server.on('connection',socket=>socket.once('close',closeConnection));
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{const address=server.address();if(!address||typeof address==='string')throw Error('Owned loopback listener required');await run(address.port,closed);}
 finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

it('records fresh TCP and response headers while retiring a never-ending response without exposing its body',async()=>{
 await withServer((_request,response)=>{response.writeHead(200,{'x-private':'PRIVATE_HEADER'});response.write('PRIVATE_RESPONSE_BODY');},async(port,closed)=>{
  const result=await probeArtifactStartupHttp(port,'static');
  expect(result).toMatchObject({tcpConnected:true,headersReceived:true,status:200,error:'none'});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');await closed;
 });
 const paths:string[]=[],retired:Promise<void>[]=[];
 await withServer((request,response)=>{paths.push(request.url??'');retired.push(new Promise<void>(resolve=>request.socket.once('close',()=>resolve())));response.writeHead(request.url==='/api/auth/session'?401:200,{'x-private':'PRIVATE_HEADER'});response.write('PRIVATE_RESPONSE_BODY');},async(port)=>{
  const result=await probeArtifactStartupTransport(port);
  expect(result.authHttp).toMatchObject({tcpConnected:true,headersReceived:true,status:401,error:'none'});
  expect(result.authFetch).toMatchObject({status:401,transport:'none'});
  expect(result.staticHttp.status).toBe(200);expect(result.staticFetch.status).toBe(200);expect(result.publicHealthHttp.status).toBe(200);
  expect(paths.sort()).toEqual(['/api/auth/session','/api/auth/session','/eve/v1/health','/turas-owned-eval-startup-probe.txt','/turas-owned-eval-startup-probe.txt'].sort());
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([Promise.all(retired),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Observation sockets did not retire')),1000);})]);}finally{clearTimeout(timer);}
 });
});

it('distinguishes a connected socket without headers and closes it at the fixed deadline',async()=>{
 await withServer(()=>{},async(port,closed)=>{
  const result=await probeArtifactStartupHttp(port,'public-health');
  expect(result).toMatchObject({tcpConnected:true,headersReceived:false,status:null,error:'deadline'});
  expect(result.elapsedMs).toBeGreaterThanOrEqual(900);await closed;
 });
});

it('publishes only fixed transport metadata and rejects private or malformed nested values',()=>{
 const raw={kind:'artifact_eval_startup_failure',staticHttp:{tcpConnected:true,headersReceived:false,status:null,elapsedMs:1001,error:'deadline',url:'PRIVATE_URL',body:'PRIVATE_BODY'},publicHealthHttp:{tcpConnected:'PRIVATE_BOOLEAN',headersReceived:{private:'PRIVATE_DATA'},status:999,elapsedMs:Infinity,error:'PRIVATE_ERROR'},staticFetch:{status:200,transport:'none',elapsedMs:12,headers:'PRIVATE_HEADER'},transportDiagnosticUnavailable:'PRIVATE_BOOLEAN',authHttp:{tcpConnected:true,headersReceived:true,status:401,elapsedMs:15,error:'none',url:'PRIVATE_AUTH_URL'},authFetch:{status:401,transport:'none',elapsedMs:16,body:'PRIVATE_AUTH_BODY'},private:'PRIVATE_PROSE'};
 const result=processFailureMetadata({stderrTail:JSON.stringify(raw)}).artifactStartup;
 expect(result).toMatchObject({staticHttp:{tcpConnected:true,headersReceived:false,status:null,elapsedMs:1001,error:'deadline'},publicHealthHttp:{status:null,elapsedMs:null,error:'other'},staticFetch:{status:200,transport:'none',elapsedMs:12}});
 expect(result?.publicHealthHttp).not.toHaveProperty('tcpConnected');expect(result?.publicHealthHttp).not.toHaveProperty('headersReceived');
 expect(result).toMatchObject({authHttp:{tcpConnected:true,headersReceived:true,status:401,elapsedMs:15,error:'none'},authFetch:{status:401,transport:'none',elapsedMs:16}});
 expect(result).not.toHaveProperty('transportDiagnosticUnavailable');expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});
