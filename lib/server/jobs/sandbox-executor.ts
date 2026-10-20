import {Sandbox} from '@vercel/sandbox';
import {z} from 'zod';
import {validateExecution,executionFailure,scannerSignatureHeader,fixedProgram,sha256,executionOutputNames,type JobExecutor,type ExecutionRequest,type ExecutionOutput} from './executor';
export type SandboxLease={creationTag:string;environmentDigest:string;verifyCurrent:()=>Promise<boolean>;bindProvider:(name:string)=>Promise<boolean>;creationUnknown:()=>Promise<void>;stopFailed:()=>Promise<void>};
export type SandboxCredentials={token:string;projectId:string;teamId:string};
/** No domain facts are published here. The admitted lease and domain source fence govern results. */
export class SandboxJobExecutor implements JobExecutor {
 constructor(private credentials:SandboxCredentials,private lease:SandboxLease){}
 async execute(request:ExecutionRequest):Promise<ExecutionOutput>{const maximum=validateExecution(request),started=Date.now();z.uuid().parse(this.lease.creationTag);if(!/^[a-f0-9]{64}$/.test(this.lease.environmentDigest)||!/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/.test(request.image)||!request.image.endsWith('@sha256:'+request.imageDigest)||!this.credentials.token||!this.credentials.projectId||!this.credentials.teamId)throw Error('Explicit pinned hosted execution required');
 if(!await this.lease.verifyCurrent())throw Error('Execution lease unavailable');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Date.parse(request.deadlineAt)-Date.now()));const abort=()=>controller.abort();request.signal?.addEventListener('abort',abort,{once:true});
 let sandbox:Sandbox|undefined;let programTimer:ReturnType<typeof setTimeout>|undefined;let programDeadline:number|undefined;let programActive=false;
 const current=async()=>{controller.signal.throwIfAborted();if(!await this.lease.verifyCurrent())throw Error('Execution lease lost');};
 try{
 try{sandbox=await Sandbox.create({...this.credentials,name:'turas-job-'+this.lease.creationTag,image:request.image,region:'iad1',persistent:false,ports:[],networkPolicy:'deny-all',env:{},resources:{vcpus:request.kind==='artifact-scan'?2:1},timeout:Math.max(1,Date.parse(request.deadlineAt)-Date.now()),tags:{turas_job:request.id,turas_creation:this.lease.creationTag,turas_environment:this.lease.environmentDigest},signal:controller.signal});}catch{await this.lease.creationUnknown();throw Error('Provider creation uncertain; reconciliation required');}
 if(sandbox.persistent||sandbox.routes.length||sandbox.networkPolicy!=='deny-all'||sandbox.tags?.turas_job!==request.id||sandbox.tags?.turas_creation!==this.lease.creationTag||sandbox.tags?.turas_environment!==this.lease.environmentDigest||!await this.lease.bindProvider(sandbox.name))throw Error('Hosted execution binding unavailable');
 await current();const single=request.inputs[0].name==='original',input=single?'/input':'/mnt/turas-input',output='/mnt/turas-output';
 // Pinned images provision these directories with their execution user's ownership.
 // The Sandbox mkdir API rejects existing paths; recreating them breaks real images.
 const source=request.inputs[0],path=single?input:input+'/'+source.name;
 await sandbox.writeFiles([{path,content:source.bytes,mode:0o400}],{signal:controller.signal});
 // Control-plane round trip verifies transfer before any scanner/parser/renderer runs.
 const transferred=await sandbox.readFile({path},{signal:controller.signal});if(!transferred)throw Error('Transferred input unavailable');let size=0;const parts:Buffer[]=[];for await(const piece of transferred){const b=Buffer.from(piece);size+=b.length;if(size>source.sizeBytes)throw Error('Transferred input exceeds limit');parts.push(b);}if(size!==source.sizeBytes||sha256(Buffer.concat(parts,size))!==source.digest)throw Error('Transferred input integrity mismatch');
 let scannerSignatureVersion:string|undefined;
 if(request.kind==='artifact-scan'){
  await current();const signature=await sandbox.readFile({path:'/signatures/daily.cvd'},{signal:controller.signal});if(!signature)throw Error('scan_unavailable');
  const header:Buffer[]=[];let length=0;for await(const part of signature){const b=Buffer.from(part).subarray(0,512-length);header.push(b);length+=b.length;if(length===512)break;}
  scannerSignatureVersion=scannerSignatureHeader(Buffer.concat(header,length));
 }
 await current();const program=fixedProgram(request,input,output),programTimeoutMs=Math.max(1,Math.min(maximum,Date.parse(request.deadlineAt)-Date.now()));programActive=true;programDeadline=Date.now()+programTimeoutMs;programTimer=setTimeout(()=>controller.abort(),programTimeoutMs);const command=await sandbox.runCommand({cmd:program.cmd,args:program.args,cwd:request.kind.startsWith('report')?'/app':request.kind==='artifact-scan'?'/':'/opt/artifact-extractor',env:request.kind.startsWith('report')?{HOME:'/tmp/report-home'}:{},sudo:false,detached:true,signal:controller.signal,timeoutMs:programTimeoutMs});
 let outBytes=0,errBytes=0;const stdout:Buffer[]=[],stderr:Buffer[]=[];const logs=command.logs({signal:controller.signal});const waiting=command.wait({signal:controller.signal});
 const capture=(async()=>{try{for await(const log of logs){const bytes=Buffer.from(log.data);if(log.stream==='stdout'){outBytes+=bytes.length;if(outBytes>(request.kind==='artifact-scan'?65536:52428800))throw Error('Execution output exceeds limit');stdout.push(bytes);}else{errBytes+=bytes.length;if(errBytes>65536)throw Error('Execution diagnostics exceed limit');stderr.push(bytes);}}}catch(error){controller.abort();throw error;}finally{logs.close();}})();
 const outcomes=await Promise.allSettled([waiting,capture]);if(outcomes.some(r=>r.status==='rejected'))throw Error('Hosted command interrupted or exceeded its limits');const result=(outcomes[0] as PromiseFulfilledResult<Awaited<typeof waiting>>).value;
 if(Date.now()>=programDeadline)throw Error('Execution program deadline exceeded');clearTimeout(programTimer);programActive=false;
 await current();const files:ExecutionOutput['files']={};if(!single&&result.exitCode===0)for(const filename of executionOutputNames){await current();const stream=await sandbox.readFile({path:output+'/'+filename},{signal:controller.signal});if(!stream)continue;let total=0;const chunks:Buffer[]=[];for await(const piece of stream){const b=Buffer.from(piece);total+=b.length;if(total>10485760)throw Error('Hosted file exceeds limit');chunks.push(b);}files[filename]=Buffer.concat(chunks,total);}
 await current();return {scannerSignatureVersion,safeFailure:executionFailure(Buffer.concat(stderr,errBytes)),exitCode:result.exitCode,stdout:Buffer.concat(stdout,outBytes),files,durationMs:Date.now()-started};
 }catch(error){if(programActive&&programDeadline!==undefined&&Date.now()>=programDeadline)throw Error('Execution program deadline exceeded');throw error;}finally{clearTimeout(timer);if(programTimer)clearTimeout(programTimer);request.signal?.removeEventListener('abort',abort);if(sandbox){try{const cleanupSignal=AbortSignal.timeout(30000);let stopped:Awaited<ReturnType<Sandbox['stop']>>;try{stopped=await sandbox.stop({signal:cleanupSignal});}finally{await sandbox.delete({deleteOrphanSnapshots:true,signal:cleanupSignal});}if(stopped.snapshot)throw Error('Unexpected persistent execution snapshot');}catch{await this.lease.stopFailed();throw Error('Owned hosted shutdown unverified');}}}
 }
}
