import {createHash} from 'node:crypto';
export const objectNamespaces=['artifact','artifact-staging','workforce','workforce-staging','report','gap-report','backup'] as const;
export type ObjectNamespace=typeof objectNamespaces[number];
export type ObjectDescriptor={key:string;sizeBytes:number;digest:string};
export interface PrivateObjects {
 put(key:string,bytes:AsyncIterable<Uint8Array>,expected:Omit<ObjectDescriptor,'key'>,signal?:AbortSignal):Promise<ObjectDescriptor>;
 stream(key:string,expected?:Omit<ObjectDescriptor,'key'>,signal?:AbortSignal):Promise<AsyncIterable<Uint8Array>>;
 stat(key:string,signal?:AbortSignal):Promise<ObjectDescriptor|null>;
 delete(key:string):Promise<void>;
 list(namespace:ObjectNamespace,cursor?:string,limit?:number,signal?:AbortSignal):Promise<{objects:(ObjectDescriptor & {createdAt:string})[];cursor?:string}>;
}
export function environmentObjectId(environmentId:string){if(!environmentId||environmentId.length>256)throw Error('Invalid object environment');return createHash('sha256').update(environmentId).digest('hex');}
export function objectKey(environmentId:string,namespace:ObjectNamespace,id:string){const key=`e_${environmentObjectId(environmentId)}/${namespace}/${id}`;validateObjectKey(key,environmentObjectId(environmentId));return key;}
export function validateObjectKey(key:string,environmentDigest:string){const match=/^e_([a-f0-9]{64})\/(artifact|artifact-staging|workforce|workforce-staging|report|gap-report|backup)\/([a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.exec(key);if(!match||match[1]!==environmentDigest)throw Error('Invalid private object identity');return match[2] as ObjectNamespace;}
export function validateExpected(expected:Omit<ObjectDescriptor,'key'>,maximum:number){if(!Number.isSafeInteger(expected.sizeBytes)||expected.sizeBytes<0||expected.sizeBytes>maximum||!/^[a-f0-9]{64}$/.test(expected.digest))throw Error('Invalid private object expectation');}
export async function verifiedBytes(bytes:AsyncIterable<Uint8Array>,expected:Omit<ObjectDescriptor,'key'>,maximum:number){validateExpected(expected,maximum);const parts:Buffer[]=[];let size=0;const hash=createHash('sha256');for await(const chunk of bytes){size+=chunk.byteLength;if(size>expected.sizeBytes||size>maximum)throw Error('Private object size mismatch');const part=Buffer.from(chunk);hash.update(part);parts.push(part);}if(size!==expected.sizeBytes||hash.digest('hex')!==expected.digest)throw Error('Private object integrity mismatch');return Buffer.concat(parts,size);}
export function sameObject(a:ObjectDescriptor,b:Omit<ObjectDescriptor,'key'>){return a.sizeBytes===b.sizeBytes&&a.digest===b.digest;}
