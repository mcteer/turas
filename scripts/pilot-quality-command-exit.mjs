import {writeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Only the directly spawned stage can participate; inherited imports are inert.
if(String(process.ppid)===process.env.TURAS_QUALITY_CONTROL_PARENT&&process.env.TURAS_QUALITY_CONTROL_NONCE){
 const nonce=process.env.TURAS_QUALITY_CONTROL_NONCE;
 process.on('exit',()=>{
  try{
   writeSync(3,JSON.stringify({pid:process.pid,nonce})+'\n');
   // A synchronous pipe read can block past a JS clock check. The owned reader
   // instead has a kernel-enforced spawn timeout and inherits only the ACK FD.
   const reader=spawnSync(process.execPath,['-e',"const{readSync}=require('node:fs');const b=Buffer.alloc(256);let out=Buffer.alloc(0);while(out.length<=256){try{const n=readSync(3,b,0,b.length,null);if(!n)break;out=Buffer.concat([out,b.subarray(0,n)]);if(out.includes(10))break;}catch(e){if(e.code!=='EAGAIN'&&e.code!=='EWOULDBLOCK')throw e;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}if(out.length>256)process.exit(1);process.stdout.write(out);"],{env:{},stdio:['ignore','pipe','ignore',4],timeout:5000,killSignal:'SIGKILL',maxBuffer:256});
   if(reader.error||reader.signal||reader.status!==0||reader.stdout?.toString()!==nonce+'\n')process.exitCode=1;
  }catch{process.exitCode=1;}
 });
}
