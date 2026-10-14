import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {verifyRecoveryKey} from './backup-crypto';
/** Operator-only key material: never read by application requests, copied into an
 * archive or returned in a receipt. The callback must finish before zeroization. */
export async function withPrivateRecoveryKey<T>(input:{file:string;excludedRoots:readonly string[];signal:AbortSignal},run:(key:Buffer,probeDigest:string)=>Promise<T>):Promise<T>{
 input.signal.throwIfAborted();const target=resolve(input.file),parent=dirname(target);
 if(!input.excludedRoots.length)throw Error('Separate recovery-key boundary required');
 for(const root of input.excludedRoots){const relation=relative(resolve(root),target);if(!(relation==='..'||relation.startsWith('..'+sep)||isAbsolute(relation)))throw Error('Recovery key must be outside captured stores and archives');}
 const directory=await lstat(parent);if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o777)!==0o700||directory.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Private recovery-key directory required');
 const file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);let key:Buffer|undefined;
 try{const info=await file.stat();if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size!==32)throw Error('Private 32-byte recovery key required');key=await file.readFile();if(key.length!==32)throw Error('Recovery key changed');input.signal.throwIfAborted();const result=await run(key,verifyRecoveryKey(key));input.signal.throwIfAborted();return result;}
 finally{key?.fill(0);await file.close();}
}
