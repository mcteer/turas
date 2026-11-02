import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {z} from 'zod';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,rm,unlink} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
const magic=Buffer.from('T016ARCH'),maxHeader=32*1024*1024,maxBytes=1024**4;
const name=z.string().max(1024).regex(/^(?:database\.dump|objects\/(?:artifact|artifact-staging|workforce|workforce-staging|report|gap-report)\/(?:[a-f0-9]{64}|[a-f0-9-]{36})|workflow\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199})$/);
export const archiveProvenanceSchema=z.strictObject({recoveryId:z.uuid(),controlRevision:z.number().int().positive(),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),schemaVersion:z.union([z.literal(79),z.literal(80),z.literal(81),z.literal(82),z.literal(83),z.literal(84),z.literal(CURRENT_SCHEMA_VERSION)]),ledgerDigest:z.string().regex(/^[a-f0-9]{64}$/),runtimeGrantsDigest:z.string().regex(/^[a-f0-9]{64}$/),configurationDigest:z.string().regex(/^[a-f0-9]{64}$/),acceptedContentDigest:z.string().regex(/^[a-f0-9]{64}$/),keyReference:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),keyVersion:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/)});
export const backupArchiveHeader=z.strictObject({provenance:archiveProvenanceSchema,contract:z.literal('pilot-archive-v1'),checkpointId:z.uuid(),environmentId:z.string().min(1).max(256),capturedAt:z.iso.datetime({offset:true}),entries:z.array(z.strictObject({name,sizeBytes:z.number().int().nonnegative().max(maxBytes),digest:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(100001)}).superRefine((header,ctx)=>{if(header.entries.filter(entry=>entry.name==='database.dump').length!==1||new Set(header.entries.map(entry=>entry.name.toLowerCase())).size!==header.entries.length||header.entries.reduce((total,entry)=>total+entry.sizeBytes,0)>maxBytes-maxHeader-12-68)ctx.addIssue({code:'custom',message:'Archive inventory differs'});});
export type BackupArchiveHeader=z.infer<typeof backupArchiveHeader>;
export type OwnedBackupArchiveRoot = Readonly<{root:string}>;
const ownedRoots=new WeakMap<OwnedBackupArchiveRoot,{ino:number;dev:number}>();
/** Mint authority only by creating a new, exclusive temporary directory. */
export async function createOwnedBackupArchiveRoot(parent:string):Promise<OwnedBackupArchiveRoot>{
 parent=resolve(parent);await directory(parent);const root=join(parent,'capture-work');await mkdir(root,{mode:0o700});const stat=await lstat(root),capability=Object.freeze({root});ownedRoots.set(capability,{ino:stat.ino,dev:stat.dev});return capability;
}

/** Pack only explicitly owned temporary files. Removing a consumed entry keeps
 * serverless scratch bounded; the authoritative database and objects survive. */
export async function* ownedBackupArchiveChunks(input:{header:BackupArchiveHeader;files:ReadonlyMap<string,string>;ownership:OwnedBackupArchiveRoot;signal:AbortSignal}):AsyncGenerator<Buffer>{
 const header=backupArchiveHeader.parse(input.header),bytes=Buffer.from(JSON.stringify(header));
 if(bytes.length>maxHeader||input.files.size!==header.entries.length)throw Error('Archive header exceeds bound');
 const identity=ownedRoots.get(input.ownership);if(!identity)throw Error('Owned archive capability required');const root=resolve(input.ownership.root),requireRoot=async()=>{await directory(root);const stat=await lstat(root);if(stat.ino!==identity.ino||stat.dev!==identity.dev)throw Error('Owned archive root changed');};await requireRoot();const prefix=Buffer.alloc(12);magic.copy(prefix);prefix.writeUInt32BE(bytes.length,8);yield prefix;yield bytes;
 for(const entry of header.entries){
  input.signal.throwIfAborted();await requireRoot();const path=input.files.get(entry.name);if(!path)throw Error('Archive source missing');
  const owned=await realpath(path),within=relative(root,owned);if(!within||within==='..'||within.startsWith('..'+sep)||owned!==resolve(path))throw Error('Owned archive temporary source required');
  const source=await file(owned),before=await source.stat(),hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
  try{if(before.size!==entry.sizeBytes)throw Error('Archive source size differs');while(position<entry.sizeBytes){input.signal.throwIfAborted();const part=await source.read(buffer,0,Math.min(buffer.length,entry.sizeBytes-position),position);if(!part.bytesRead)throw Error('Archive source truncated');position+=part.bytesRead;const chunk=buffer.subarray(0,part.bytesRead);hash.update(chunk);yield chunk;}
   const after=await source.stat();if(hash.digest('hex')!==entry.digest||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Archive source digest differs');
  }finally{await source.close();}
  await requireRoot();const current=await lstat(owned);if(current.ino!==before.ino||current.dev!==before.dev||current.nlink!==1||!current.isFile()||current.size!==before.size||current.mtimeMs!==before.mtimeMs||current.ctimeMs!==before.ctimeMs)throw Error('Owned archive source changed');await unlink(owned);
 }
}

/** Hash every authenticated entry without making a second plaintext archive or
 * extracted tree. EOF consumes the decryptor's final authentication tag. */
export async function verifyBackupArchiveChunks(input:{chunks:AsyncIterable<Uint8Array>;expectedHeaderDigest:string;environmentId:string;checkpointId:string;signal:AbortSignal}){
 const iterator=input.chunks[Symbol.asyncIterator]();let pending=Buffer.alloc(0),offset=0,ended=false;
 const readBytes=async(length:number)=>{const result=Buffer.alloc(length);let written=0;while(written<length){input.signal.throwIfAborted();if(offset===pending.length){const next=await iterator.next();if(next.done){ended=true;throw Error('Archive truncated');}pending=Buffer.from(next.value);offset=0;if(!pending.length)continue;}const count=Math.min(length-written,pending.length-offset);pending.copy(result,written,offset,offset+count);offset+=count;written+=count;}return result;};
 try{
  const prefix=await readBytes(12);if(!prefix.subarray(0,8).equals(magic))throw Error('Archive contract differs');const length=prefix.readUInt32BE(8);if(length<1||length>maxHeader)throw Error('Archive header exceeds bound');const bytes=await readBytes(length);if(createHash('sha256').update(bytes).digest('hex')!==input.expectedHeaderDigest)throw Error('Archive header differs');
  const header=backupArchiveHeader.parse(JSON.parse(bytes.toString()));if(header.environmentId!==input.environmentId||header.checkpointId!==input.checkpointId)throw Error('Archive target differs');
  for(const entry of header.entries){const hash=createHash('sha256');for(let position=0;position<entry.sizeBytes;){const part=await readBytes(Math.min(65536,entry.sizeBytes-position));hash.update(part);position+=part.length;}if(hash.digest('hex')!==entry.digest)throw Error('Archive bytes differ');}
  if(offset!==pending.length)throw Error('Archive byte inventory differs');
  for(;;){const next=await iterator.next();if(next.done){ended=true;break;}if(next.value.byteLength)throw Error('Archive byte inventory differs');}
  input.signal.throwIfAborted();return header;
 }finally{if(!ended)await iterator.return?.();}
}
async function directory(root:string){const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid?.()||await realpath(root)!==root)throw Error('Private archive directory required');}
async function file(path:string,write=false){path=resolve(path);await directory(dirname(path));const handle=await open(path,(write?constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY:constants.O_RDONLY)|constants.O_NOFOLLOW,0o600);const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid?.()||stat.size>maxBytes){await handle.close();throw Error('Private archive file required');}return handle;}
async function write(handle:Awaited<ReturnType<typeof file>>,bytes:Buffer,position:number,signal:AbortSignal){for(let offset=0;offset<bytes.length;){signal.throwIfAborted();const result=await handle.write(bytes,offset,bytes.length-offset,position+offset);if(!result.bytesWritten)throw Error('Archive write incomplete');offset+=result.bytesWritten;}}
async function read(handle:Awaited<ReturnType<typeof file>>,bytes:Buffer,position:number,signal:AbortSignal){for(let offset=0;offset<bytes.length;){signal.throwIfAborted();const result=await handle.read(bytes,offset,bytes.length-offset,position+offset);if(!result.bytesRead)throw Error('Archive truncated');offset+=result.bytesRead;}}
export async function packBackupArchive(input:{header:BackupArchiveHeader;files:ReadonlyMap<string,string>;output:string;signal:AbortSignal}){
 input.signal.throwIfAborted();const header=backupArchiveHeader.parse(input.header),bytes=Buffer.from(JSON.stringify(header));if(bytes.length>maxHeader||input.files.size!==header.entries.length||header.entries.some(entry=>!input.files.has(entry.name)))throw Error('Exact archive files required');
 const output=await file(input.output,true);let complete=false;try{const prefix=Buffer.alloc(12);magic.copy(prefix);prefix.writeUInt32BE(bytes.length,8);await write(output,prefix,0,input.signal);await write(output,bytes,12,input.signal);let position=12+bytes.length;
  for(const entry of header.entries){const source=await file(input.files.get(entry.name)!);try{if((await source.stat()).size!==entry.sizeBytes)throw Error('Archive source size differs');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);for(let offset=0;offset<entry.sizeBytes;){const length=Math.min(buffer.length,entry.sizeBytes-offset),part=buffer.subarray(0,length);await read(source,part,offset,input.signal);hash.update(part);await write(output,part,position,input.signal);offset+=length;position+=length;}if(hash.digest('hex')!==entry.digest||(await source.stat()).size!==entry.sizeBytes)throw Error('Archive source digest differs');}finally{await source.close();}}
  await output.sync();complete=true;return {headerDigest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:position};
 }finally{await output.close();if(!complete)await rm(input.output,{force:true});}
}
/** Extracts only the exact authenticated index into a new private owned root.
 * Never invokes a shell/archive extractor or overwrites an existing target. */
export async function unpackBackupArchive(input:{archive:string;target:string;expectedHeaderDigest:string;environmentId:string;checkpointId:string;signal:AbortSignal}){
 if(!/^[a-f0-9]{64}$/.test(input.expectedHeaderDigest))throw Error('Archive header digest required');input.signal.throwIfAborted();const target=resolve(input.target);await directory(dirname(target));const source=await file(input.archive);let created=false,complete=false;
 try{const prefix=Buffer.alloc(12);await read(source,prefix,0,input.signal);if(!prefix.subarray(0,8).equals(magic))throw Error('Archive contract differs');const length=prefix.readUInt32BE(8);if(length<1||length>maxHeader)throw Error('Archive header exceeds bound');const bytes=Buffer.alloc(length);await read(source,bytes,12,input.signal);if(createHash('sha256').update(bytes).digest('hex')!==input.expectedHeaderDigest)throw Error('Archive header differs');const header=backupArchiveHeader.parse(JSON.parse(bytes.toString()));if(header.environmentId!==input.environmentId||header.checkpointId!==input.checkpointId)throw Error('Archive target differs');if((await source.stat()).size!==12+length+header.entries.reduce((total,entry)=>total+entry.sizeBytes,0))throw Error('Archive byte inventory differs');await mkdir(target,{mode:0o700});created=true;let position=12+length;
  for(const entry of header.entries){input.signal.throwIfAborted();const path=join(target,entry.name);await mkdir(dirname(path),{recursive:true,mode:0o700});await directory(dirname(path));const output=await file(path,true);try{const hash=createHash('sha256'),buffer=Buffer.alloc(65536);for(let offset=0;offset<entry.sizeBytes;){const part=buffer.subarray(0,Math.min(buffer.length,entry.sizeBytes-offset));await read(source,part,position,input.signal);hash.update(part);await write(output,part,offset,input.signal);offset+=part.length;position+=part.length;}if(hash.digest('hex')!==entry.digest)throw Error('Archive bytes differ');await output.sync();}finally{await output.close();}}
  complete=true;return header;
 }finally{await source.close();if(created&&!complete)await rm(target,{recursive:true,force:true});}
}
