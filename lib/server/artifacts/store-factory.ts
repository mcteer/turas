import {privateBlobAuth} from '../storage/blob-auth';
import {privateObjectBackend} from '../storage/factory';
import {getServerConfig,parseArtifactStoreConfig} from '../config';
import {LocalArtifactStore} from './local-store';
import {BlobArtifactStore} from './blob-store';
import type {ArtifactStore} from './store';
export function createArtifactStore():ArtifactStore{
 return privateObjectBackend()==='blob'?new BlobArtifactStore(getServerConfig().TURAS_ENVIRONMENT_ID,privateBlobAuth()):new LocalArtifactStore(parseArtifactStoreConfig(process.env));
}
