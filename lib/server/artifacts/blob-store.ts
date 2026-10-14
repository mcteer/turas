import {privateStoreObserver} from '../operations/store-observations';
import type {PrivateBlobAuth} from '../storage/blob-auth';
import {createHash,randomBytes} from 'node:crypto';
import {artifactMaxOriginalBytes} from '../../contracts/artifacts';
import {BlobPrivateObjects} from '../storage/blob-objects';
import {objectKey} from '../storage/private-objects';
import type {ArtifactStore} from './store';
export class BlobArtifactStore implements ArtifactStore {
 private objects:BlobPrivateObjects;
 constructor(private environmentId:string,token:string|PrivateBlobAuth){this.objects=new BlobPrivateObjects(environmentId,token,artifactMaxOriginalBytes,privateStoreObserver(environmentId));}
 private key(id:string,staging=false){return objectKey(this.environmentId,staging?'artifact-staging':'artifact',id);}
 async stage(source:AsyncIterable<Uint8Array>,expectedBytes:number){if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>artifactMaxOriginalBytes)throw Error('Invalid artifact size');let size=0;const chunks:Buffer[]=[];const hash=createHash('sha256');for await(const chunk of source){size+=chunk.length;if(size>expectedBytes)throw Error('Artifact exceeds declared size');const copy=Buffer.from(chunk);chunks.push(copy);hash.update(copy);}if(size!==expectedBytes)throw Error('Artifact size mismatch');const key=randomBytes(32).toString('hex'),digest=hash.digest('hex');await this.objects.put(this.key(key,true),(async function*(){yield Buffer.concat(chunks,size);})(),{sizeBytes:size,digest});return {key,digest,sizeBytes:size};}
 async finalize(stagedKey:string,expectedDigest:string){const target=createHash('sha256').update(`turas-object-v1:${stagedKey}`).digest('hex');const staged=await this.objects.stat(this.key(stagedKey,true));if(staged){if(staged.digest!==expectedDigest)throw Error('Artifact digest changed');await this.objects.put(this.key(target),await this.objects.stream(staged.key,staged),staged);await this.objects.delete(staged.key);}else{const existing=await this.objects.stat(this.key(target));if(!existing||existing.digest!==expectedDigest)throw Error('Artifact unavailable');}return target;}
 async read(objectId:string){return this.objects.stream(this.key(objectId));}
 async readPath(_objectId:string):Promise<string>{throw Error('Hosted objects require the governed executor');}
 async delete(objectId:string){await this.objects.delete(this.key(objectId));}
 async deleteStaged(objectId:string){await this.objects.delete(this.key(objectId,true));}
}
