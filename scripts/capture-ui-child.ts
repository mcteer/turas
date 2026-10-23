import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserStepFailures} from './ci-browser-step-reporter';

export function observedUiChildArguments(args:string[]){
 if(!args[0]?.replace(/\\/g,'/').endsWith('node_modules/@playwright/test/cli.js')||args.includes('--list')||!args.includes('--reporter=json'))return args;
 const reporter=fileURLToPath(new URL('./ci-browser-step-reporter.ts',import.meta.url));
 return args.map(arg=>arg==='--reporter=json'?'--reporter=json,'+reporter:arg);
}

/** Keep draining the separately supervised application's pipes while the UI
 * runner waits for HTTP. Synchronous waits can deadlock that application. */
export function captureUiChild(args:string[],options:{env:NodeJS.ProcessEnv;timeout:number;maximumBytes?:number;cwd?:string}):Promise<{status:number|null;stdout:string;stderr:string;error:boolean}>{
 const maximum=options.maximumBytes??10_000_000;
 if(!Number.isSafeInteger(options.timeout)||options.timeout<1||!Number.isSafeInteger(maximum)||maximum<1)throw Error('Finite UI child bounds required');
 return new Promise(resolve=>{
  const child=spawn(process.execPath,observedUiChildArguments(args),{env:options.env,cwd:options.cwd,stdio:['ignore','pipe','pipe'],detached:true});
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
  child.once('close',status=>{clearTimeout(timer);if(force)clearTimeout(force);signal('SIGKILL');const output=Buffer.concat(stdout).toString(),diagnostic=Buffer.concat(stderr).toString();if(status!==0||error)try{for(const value of browserStepFailures(diagnostic))process.stderr.write(JSON.stringify(value)+'\n');}catch{/* Preserve the original child result. */}resolve({status,stdout:output,stderr:diagnostic,error});});
 });
}
