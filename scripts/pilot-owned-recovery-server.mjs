import {createServer} from 'node:http';
import next from 'next';
const milestone=value=>{try{process.stderr.write(value+'\n');}catch{/* Preserve the server's original control flow. */}};
milestone('OWNED_RECOVERY_SERVER_MODULE');

// This private maintenance child uses Next's documented programmatic server.
// Avoid the development CLI's extra server parent and detached shutdown telemetry.
const origin=new URL(process.env.TURAS_APP_ORIGIN??'');
if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port||origin.pathname!=='/')throw Error('Exact loopback recovery origin required');
const app=next({dev:true,webpack:true,turbopack:false,dir:process.cwd(),hostname:origin.hostname,port:Number(origin.port)});
const handle=app.getRequestHandler();
const server=createServer((request,response)=>{Promise.resolve(handle(request,response)).catch(()=>{if(!response.headersSent)response.writeHead(500);response.end();});});
let stopping=false;
async function stop(){
 if(stopping)return;stopping=true;
 milestone('OWNED_RECOVERY_SERVER_STOP');
 try{
  try{
   server.closeAllConnections();
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }finally{await app.close();}
  process.exitCode=0;
 }catch{process.exitCode=1;}
}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
milestone('OWNED_RECOVERY_SERVER_PREPARE_START');
await app.prepare();
milestone('OWNED_RECOVERY_SERVER_PREPARE_END');
if(stopping){await app.close();}else{
 milestone('OWNED_RECOVERY_SERVER_LISTEN_START');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port),origin.hostname,resolve);});
 console.log('Ready in owned recovery server');
}
