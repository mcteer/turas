import {privateStoreObserver} from '../operations/store-observations';
import {privateBlobAuth} from './blob-auth';
import {BlobPrivateObjects} from './blob-objects';
import {LocalPrivateObjects} from './local-objects';
import type {PrivateObjects} from './private-objects';
export function privateObjectBackend(env:NodeJS.ProcessEnv=process.env):'local'|'blob'{
 if(env.VERCEL==='1'&&env.TURAS_PRIVATE_OBJECT_BACKEND!=='blob')throw Error('Hosted private storage requires explicit Blob configuration');
 const backend=env.TURAS_PRIVATE_OBJECT_BACKEND??'local';
 if(backend!=='local'&&backend!=='blob')throw Error('Unknown private object backend');
 if(backend==='blob')privateBlobAuth(env);
 return backend;
}
/** No provider failure or missing configuration falls back to local storage. */
export function createPrivateObjects(input:{environmentId:string;localRoot:string;maximumBytes:number},env:NodeJS.ProcessEnv=process.env):PrivateObjects{
 return privateObjectBackend(env)==='blob'?new BlobPrivateObjects(input.environmentId,privateBlobAuth(env),input.maximumBytes,privateStoreObserver(input.environmentId,env)):new LocalPrivateObjects(input.localRoot,input.environmentId,input.maximumBytes);
}
