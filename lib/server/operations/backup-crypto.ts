import {constants} from 'node:fs';
import {open,unlink,lstat,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
const magic=Buffer.from('TURAS016'),maximumBytes=1024**4;
async function privateFile(path:string,write=false){const parent=resolve(dirname(path)),stat=await lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Unsafe recovery directory');const file=await open(resolve(path),write?constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW:constants.O_RDONLY|constants.O_NOFOLLOW,0o600);const info=await file.stat();if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size>maximumBytes){await file.close();throw Error('Unsafe recovery file');}return file;}
function keyAndContext(key:Uint8Array,contextDigest:string){if(key.byteLength!==32||!/^[a-f0-9]{64}$/.test(contextDigest))throw Error('Separate recovery key and capture context required');return Buffer.from(contextDigest,'hex');}
async function writeBytes(file:Awaited<ReturnType<typeof privateFile>>,bytes:Buffer,position:number,signal:AbortSignal){for(let offset=0;offset<bytes.length;){signal.throwIfAborted();const written=await file.write(bytes,offset,bytes.length-offset,position+offset);if(!written.bytesWritten)throw Error('Incomplete recovery write');offset+=written.bytesWritten;}}
export async function encryptRecoveryFile(input:string,output:string,key:Uint8Array,contextDigest:string,signal:AbortSignal){
 const context=keyAndContext(key,contextDigest);signal.throwIfAborted();const source=await privateFile(input);let destination:Awaited<ReturnType<typeof privateFile>>|undefined,complete=false;
 try{destination=await privateFile(output,true);const originalSize=(await source.stat()).size;if(originalSize>maximumBytes-68)throw Error('Recovery input exceeds encrypted bound');const nonce=randomBytes(12),header=Buffer.concat([magic,nonce,context]),cipher=createCipheriv('aes-256-gcm',key,nonce),hash=createHash('sha256');cipher.setAAD(header);await writeBytes(destination,header,0,signal);hash.update(header);const buffer=Buffer.alloc(65536);let inputOffset=0,outputOffset=header.length;
  while(inputOffset<originalSize){signal.throwIfAborted();const {bytesRead}=await source.read(buffer,0,Math.min(buffer.length,originalSize-inputOffset),inputOffset);if(!bytesRead)throw Error('Recovery input changed');inputOffset+=bytesRead;const encrypted=cipher.update(buffer.subarray(0,bytesRead));await writeBytes(destination,encrypted,outputOffset,signal);outputOffset+=encrypted.length;hash.update(encrypted);}
  if((await source.stat()).size!==originalSize)throw Error('Recovery input changed');const final=cipher.final(),tag=cipher.getAuthTag();await writeBytes(destination,final,outputOffset,signal);outputOffset+=final.length;hash.update(final);await writeBytes(destination,tag,outputOffset,signal);hash.update(tag);await destination.sync();complete=true;return {digest:hash.digest('hex'),sizeBytes:outputOffset+tag.length};
 }finally{await source.close();await destination?.close();if(destination&&!complete)await unlink(output).catch(()=>undefined);}
}
export async function decryptRecoveryFile(input:string,output:string,key:Uint8Array,contextDigest:string,signal:AbortSignal){
 const context=keyAndContext(key,contextDigest);signal.throwIfAborted();const source=await privateFile(input);let destination:Awaited<ReturnType<typeof privateFile>>|undefined,complete=false;
 try{const stat=await source.stat();if(stat.size<68)throw Error('Incomplete encrypted recovery archive');const header=Buffer.alloc(52);await source.read(header,0,52,0);if(!header.subarray(0,8).equals(magic)||!header.subarray(20).equals(context))throw Error('Recovery encryption context differs');const tag=Buffer.alloc(16);await source.read(tag,0,16,stat.size-16);const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8,20));decipher.setAAD(header);decipher.setAuthTag(tag);destination=await privateFile(output,true);const buffer=Buffer.alloc(65536);let inputOffset=52,outputOffset=0;
  while(inputOffset<stat.size-16){signal.throwIfAborted();const {bytesRead}=await source.read(buffer,0,Math.min(buffer.length,stat.size-16-inputOffset),inputOffset);if(!bytesRead)throw Error('Recovery ciphertext changed');inputOffset+=bytesRead;const plain=decipher.update(buffer.subarray(0,bytesRead));await writeBytes(destination,plain,outputOffset,signal);outputOffset+=plain.length;}
  if((await source.stat()).size!==stat.size)throw Error('Recovery ciphertext changed');const final=decipher.final();await writeBytes(destination,final,outputOffset,signal);await destination.sync();complete=true;
 }finally{await source.close();await destination?.close();if(destination&&!complete)await unlink(output).catch(()=>undefined);}
}
export function verifyRecoveryKey(key:Uint8Array){keyAndContext(key,'0'.repeat(64));const nonce=randomBytes(12),plain=randomBytes(32),cipher=createCipheriv('aes-256-gcm',key,nonce),sealed=Buffer.concat([cipher.update(plain),cipher.final()]),decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(cipher.getAuthTag());if(!Buffer.concat([decipher.update(sealed),decipher.final()]).equals(plain))throw Error('Recovery key unavailable');return createHash('sha256').update(sealed).digest('hex');}

/** Same authenticated wire format as encryptRecoveryFile, without a packed
 * plaintext file. The producer must finish before a tag or receipt is issued. */
export async function encryptRecoveryStream(input:AsyncIterable<Uint8Array>,output:string,key:Uint8Array,contextDigest:string,maximumPlainBytes:number,signal:AbortSignal){
 const context=keyAndContext(key,contextDigest);
 if(!Number.isSafeInteger(maximumPlainBytes)||maximumPlainBytes<1||maximumPlainBytes>maximumBytes-68)throw Error('Bounded recovery stream required');
 const destination=await privateFile(output,true);let complete=false;
 try{
  const nonce=randomBytes(12),header=Buffer.concat([magic,nonce,context]),cipher=createCipheriv('aes-256-gcm',key,nonce),hash=createHash('sha256');
  cipher.setAAD(header);await writeBytes(destination,header,0,signal);hash.update(header);let position=header.length,plainBytes=0;
  for await(const chunk of input){signal.throwIfAborted();plainBytes+=chunk.byteLength;if(plainBytes>maximumPlainBytes)throw Error('Recovery stream exceeds bound');const bytes=cipher.update(chunk);await writeBytes(destination,bytes,position,signal);position+=bytes.length;hash.update(bytes);}
  const final=cipher.final(),tag=cipher.getAuthTag();await writeBytes(destination,final,position,signal);position+=final.length;hash.update(final);await writeBytes(destination,tag,position,signal);hash.update(tag);await destination.sync();complete=true;
  return {digest:hash.digest('hex'),sizeBytes:position+tag.length};
 }finally{await destination.close();if(!complete)await unlink(output).catch(()=>undefined);}
}

/** Plaintext is provisional until iteration reaches the authenticated end.
 * Consumers may hash it, but must not publish a result before final() succeeds. */
export async function* decryptRecoveryChunks(input:string,key:Uint8Array,contextDigest:string,signal:AbortSignal,expectedCiphertextDigest?:string):AsyncGenerator<Buffer>{
 if(expectedCiphertextDigest!==undefined&&!/^[a-f0-9]{64}$/.test(expectedCiphertextDigest))throw Error('Expected encrypted digest required');const context=keyAndContext(key,contextDigest),source=await privateFile(input);
 try{
  const before=await source.stat();if(before.size<68)throw Error('Incomplete encrypted recovery archive');
  const header=Buffer.alloc(52),tag=Buffer.alloc(16);if((await source.read(header,0,52,0)).bytesRead!==52||(await source.read(tag,0,16,before.size-16)).bytesRead!==16)throw Error('Recovery ciphertext truncated');
  if(!header.subarray(0,8).equals(magic)||!header.subarray(20).equals(context))throw Error('Recovery encryption context differs');
  const encryptedHash=createHash('sha256');encryptedHash.update(header);const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8,20));decipher.setAAD(header);decipher.setAuthTag(tag);const buffer=Buffer.alloc(65536);let position=52;
  while(position<before.size-16){signal.throwIfAborted();const part=await source.read(buffer,0,Math.min(buffer.length,before.size-16-position),position);if(!part.bytesRead)throw Error('Recovery ciphertext changed');position+=part.bytesRead;encryptedHash.update(buffer.subarray(0,part.bytesRead));yield decipher.update(buffer.subarray(0,part.bytesRead));}
  encryptedHash.update(tag);const final=decipher.final();if(final.length)yield final;if(expectedCiphertextDigest!==undefined&&encryptedHash.digest('hex')!==expectedCiphertextDigest)throw Error('Candidate encrypted digest differs');
  const after=await source.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Recovery ciphertext changed');signal.throwIfAborted();
 }finally{await source.close();}
}
