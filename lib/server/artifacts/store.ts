export type StagedArtifact = { key: string; digest: string; sizeBytes: number };

/** Only the domain service receives opaque keys; callers never receive paths. */
export interface ArtifactStore {
  stage(bytes: AsyncIterable<Uint8Array>, expectedBytes: number): Promise<StagedArtifact>;
  finalize(stagedKey: string, expectedDigest: string): Promise<string>;
  readPath(objectKey: string): Promise<string>;
  delete(objectKey: string): Promise<void>;
  deleteStaged(stagedKey: string): Promise<void>;
}
