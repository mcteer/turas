import {spawn} from 'node:child_process';

/** Keep draining the separately supervised application's pipes while the UI
 * runner waits for HTTP. Synchronous waits can deadlock that application. */
export function captureUiChild(args:string[],options:{env:NodeJS.ProcessEnv;timeout:number;maximumBytes?:number;cwd?:string}):Promise<{status:number|null;stdout:string;stderr:string;error:boolean}>{
 const maximum=options.maximumBytes??10_000_000;
 if(!Number.isSafeInteger(options.timeout)||options.timeout<1||!Number.isSafeInteger(maximum)||maximum<1)throw Error('Finite UI child bounds required');
 return new Promise(resolve=>{
  const child=spawn(process.execPath,args,{env:options.env,cwd:options.cwd,stdio:['ignore','pipe','pipe'],detached:true});
  const stdout:Buffer[]=[],stderr:Buffer[]=[];
  let bytes=0,error=false,force:ReturnType<typeof setTimeout>|undefined;
  const signal=(value:NodeJS.Signals)=>{if(child.pid)try{process.kill(-child.pid,value);}catch(failure){if((failure as NodeJS.ErrnoException).code!=='ESRCH')throw failure;}};
  const stop=()=>{error=true;signal('SIGTERM');force??=setTimeout(()=>signal('SIGKILL'),1000);};
  const timer=setTimeout(stop,options.timeout);
  const capture=(chunk:Buffer,output:boolean)=>{
   if(error)return;
   bytes+=chunk.length;if(bytes>maximum){stop();return;}
   (output?stdout:stderr).push(chunk);
  };
  child.stdout.on('data',chunk=>capture(chunk,true));child.stderr.on('data',chunk=>capture(chunk,false));
  child.once('error',()=>{error=true;});
  child.once('close',status=>{clearTimeout(timer);if(force)clearTimeout(force);signal('SIGKILL');resolve({status,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString(),error});});
 });
}
