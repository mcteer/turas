import {constants} from 'node:fs';
import {open,lstat,realpath,readdir,mkdir,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {BackupArchiveHeader} from './backup-archive';
const maximumFiles=100000,maximumFileBytes=100*1024*1024,maximumTotalBytes=1024**4;
type Entry={name:string;sizeBytes:number;digest:string;mtimeNs:string;ctimeNs:string;inode:string;device:string};
async function privateRoot(root:string){const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700||await realpath(root)!==root)throw Error('Private direct workflow root required');}
async function scan(root:string,signal:AbortSignal){
 const entries:Entry[]=[];let total=0;const names=new Set<string>();
 async function visit(relative:string,depth:number){signal.throwIfAborted();if(depth>32)throw Error('Workflow depth exceeds bound');const path=join(root,relative),stat=await lstat(path,{bigint:true});
  if(stat.isSymbolicLink()||Number(stat.uid)!==process.getuid?.()||(Number(stat.mode)&0o022)!==0||await realpath(path)!==path)throw Error('Unsafe workflow checkpoint entry');
  if(stat.isDirectory()){for(const name of (await readdir(path)).sort()){if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(name))throw Error('Unsupported workflow checkpoint name');await visit(relative?relative+'/'+name:name,depth+1);}return;}
  if(!stat.isFile()||stat.nlink!==1n||stat.size>BigInt(maximumFileBytes)||entries.length>=maximumFiles||relative.length>1015||names.has(relative.toLowerCase()))throw Error('Workflow checkpoint inventory exceeds bound or aliases');
  names.add(relative.toLowerCase());total+=Number(stat.size);if(total>maximumTotalBytes)throw Error('Workflow checkpoint byte bound exceeded');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await handle.stat({bigint:true});if(before.ino!==stat.ino||before.dev!==stat.dev||before.size!==stat.size)throw Error('Workflow checkpoint entry changed');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
   while(position<Number(stat.size)){signal.throwIfAborted();const read=await handle.read(buffer,0,Math.min(buffer.length,Number(stat.size)-position),position);if(!read.bytesRead)throw Error('Workflow checkpoint truncated');hash.update(buffer.subarray(0,read.bytesRead));position+=read.bytesRead;}
   const after=await handle.stat({bigint:true});if(after.size!==stat.size||after.mtimeNs!==stat.mtimeNs||after.ctimeNs!==stat.ctimeNs)throw Error('Workflow checkpoint entry changed');
   entries.push({name:'workflow/'+relative,sizeBytes:Number(stat.size),digest:hash.digest('hex'),mtimeNs:stat.mtimeNs.toString(),ctimeNs:stat.ctimeNs.toString(),inode:stat.ino.toString(),device:stat.dev.toString()});
  }finally{await handle.close();}
 }
 await visit('',0);return entries;
}
/** Stable private byte inventory only. The caller must separately prove stopped
 * native processes and the owner database capture fence before claiming a matched
 * checkpoint. This helper never starts/resumes a native run or accesses a provider. */
export async function captureOwnedWorkflow(input:{source:string;target:string;signal:AbortSignal}){
 input.signal.throwIfAborted();const source=resolve(input.source),target=resolve(input.target);
 if(source===target||target.startsWith(source+'/')||source.startsWith(target+'/'))throw Error('Separate workflow capture root required');
 await privateRoot(source);await privateRoot(dirname(target));const before=await scan(source,input.signal);await mkdir(target,{mode:0o700});let complete=false;
 try{const files=new Map<string,string>(),entries:BackupArchiveHeader['entries']=[];
  for(const row of before){input.signal.throwIfAborted();const relative=row.name.slice(9),path=join(target,relative);await mkdir(dirname(path),{recursive:true,mode:0o700});const original=await open(join(source,relative),constants.O_RDONLY|constants.O_NOFOLLOW);let copy:Awaited<ReturnType<typeof open>>|undefined;
   try{copy=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);const info=await original.stat({bigint:true});if(info.ino.toString()!==row.inode||info.dev.toString()!==row.device||info.nlink!==1n||Number(info.size)!==row.sizeBytes||info.mtimeNs.toString()!==row.mtimeNs||info.ctimeNs.toString()!==row.ctimeNs)throw Error('Workflow source changed');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
    while(position<row.sizeBytes){input.signal.throwIfAborted();const read=await original.read(buffer,0,Math.min(buffer.length,row.sizeBytes-position),position);if(!read.bytesRead)throw Error('Workflow source truncated');const part=buffer.subarray(0,read.bytesRead);hash.update(part);for(let offset=0;offset<part.length;){const wrote=await copy.write(part,offset,part.length-offset);if(!wrote.bytesWritten)throw Error('Workflow copy incomplete');offset+=wrote.bytesWritten;}position+=part.length;}
    if(hash.digest('hex')!==row.digest)throw Error('Workflow source digest changed');await copy.sync();
   }finally{try{await copy?.close();}finally{await original.close();}}
   entries.push({name:row.name,sizeBytes:row.sizeBytes,digest:row.digest});files.set(row.name,path);
  }
  if(JSON.stringify(await scan(source,input.signal))!==JSON.stringify(before))throw Error('Workflow source inventory changed');input.signal.throwIfAborted();complete=true;
  return {entries,files,inventoryDigest:createHash('sha256').update(JSON.stringify(entries)).digest('hex'),originalsRetained:true as const,workflowRuntimeStoppedVerified:false as const,matchedCheckpointVerified:false as const};
 }finally{if(!complete)await rm(target,{recursive:true,force:true});}
}
