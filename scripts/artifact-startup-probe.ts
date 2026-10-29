import {request,type ClientRequest} from 'node:http';
import type {Socket} from 'node:net';

export const artifactStartupSentinel = 'turas-owned-eval-startup-probe.txt';
const requestErrors = ['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ABORT_ERR'] as const;
type RequestError = typeof requestErrors[number] | 'none' | 'deadline' | 'invalid-port' | 'other';
export type ArtifactHttpObservation = {tcpConnected:boolean;headersReceived:boolean;status:number|null;elapsedMs:number;error:RequestError};
const validPort = (port:number)=>Number.isSafeInteger(port)&&port>0&&port<=65535;

/** Failure-only loopback observations. Fresh sockets bypass fetch's dispatcher;
 * no response body, URL, header, arbitrary message or application fact escapes. */
export function probeArtifactStartupHttp(port:number,path:'static'|'public-health'|'auth'):Promise<ArtifactHttpObservation>{
 if(!validPort(port))return Promise.resolve({tcpConnected:false,headersReceived:false,status:null,elapsedMs:0,error:'invalid-port'});
 const started=Date.now();
 return new Promise(resolve=>{
  let client:ClientRequest|undefined,socket:Socket|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  let tcpConnected=false,headersReceived=false,settled=false;
  const finish=(error:RequestError,status:number|null=null)=>{
   if(settled)return;settled=true;clearTimeout(timer);client?.destroy();socket?.destroy();
   resolve({tcpConnected,headersReceived,status,elapsedMs:Date.now()-started,error});
  };
  timer=setTimeout(()=>finish('deadline'),1000);
  try{
   client=request({host:'127.0.0.1',port,path:path==='static'?'/'+artifactStartupSentinel:path==='auth'?'/api/auth/session':'/eve/v1/health',method:'GET',agent:false,headers:{connection:'close'}},response=>{
    headersReceived=true;const status=response.statusCode;
    finish('none',typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?status:null);response.destroy();
   });
   client.once('socket',value=>{socket=value;value.once('connect',()=>{tcpConnected=true;});});
   client.once('error',error=>{const code=(error as NodeJS.ErrnoException).code;finish(requestErrors.includes(code as typeof requestErrors[number])?code as typeof requestErrors[number]:'other');});
   client.end();
  }catch{finish('other');}
 });
}

async function probeStartupFetch(port:number,path:'static'|'auth'){
 if(!validPort(port))return {status:null,transport:'unavailable',elapsedMs:0};
 const started=Date.now();
 try{
  const response=await fetch(`http://127.0.0.1:${port}${path==='static'?'/'+artifactStartupSentinel:'/api/auth/session'}`,{signal:AbortSignal.timeout(1000)});
  void response.body?.cancel().catch(()=>undefined);
  return {status:response.status,transport:'none',elapsedMs:Date.now()-started};
 }catch(error){const name=error instanceof Error?error.name:'';return {status:null,transport:['TimeoutError','AbortError','TypeError'].includes(name)?name:'other',elapsedMs:Date.now()-started};}
}

/** Called only after the original readiness window has failed. These results
 * cannot admit the fixture or extend its readiness/test/owned-runtime clocks. */
export async function probeArtifactStartupTransport(port:number){
 const [staticFetch,staticHttp,publicHealthHttp,authFetch,authHttp]=await Promise.all([
  probeStartupFetch(port,'static'),probeArtifactStartupHttp(port,'static'),probeArtifactStartupHttp(port,'public-health'),
  probeStartupFetch(port,'auth'),probeArtifactStartupHttp(port,'auth')]);
 return {staticFetch,staticHttp,publicHealthHttp,authFetch,authHttp};
}
