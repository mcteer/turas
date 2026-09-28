import { createHash, randomBytes } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { lstat, link, mkdir, open, realpath, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArtifactStoreConfig, type ArtifactStoreConfig } from "../config";
import { artifactMaxOriginalBytes } from "../../contracts/artifacts";
import type { ArtifactStore, StagedArtifact } from "./store";

const keyPattern = /^[a-f0-9]{64}$/;

export class LocalArtifactStore implements ArtifactStore {
  private readonly root: string;
  constructor(config: ArtifactStoreConfig) {
    this.root = parseArtifactStoreConfig({ TURAS_ARTIFACT_STORE_ROOT: config.root,
      TURAS_ENVIRONMENT_ID: config.environmentId }).root;
  }

  private path(kind: "staged" | "objects", key: string): string {
    if (!keyPattern.test(key)) throw new Error("Invalid artifact object key");
    const path = resolve(this.root, kind, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Invalid artifact path");
    return path;
  }

  private async directory(kind: "staged" | "objects"): Promise<void> {
    const path = join(this.root, kind);
    await mkdir(path, { mode: 0o700 }).catch((error: unknown) => {
      if (typeof error !== "object" || !error || !("code" in error) || error.code !== "EEXIST") throw error;
    });
    if (await realpath(path) !== path || !(await lstat(path)).isDirectory()) {
      throw new Error("Artifact directory is not private");
    }
    if (((await lstat(path)).mode & 0o077) !== 0) throw new Error("Artifact directory permissions are too broad");
  }

  async stage(bytes: AsyncIterable<Uint8Array>, expectedBytes: number): Promise<StagedArtifact> {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > artifactMaxOriginalBytes) {
      throw new Error("Invalid expected artifact size");
    }
    await this.directory("staged");
    const key = randomBytes(32).toString("hex");
    const path = this.path("staged", key);
    const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    try {
      for await (const chunk of bytes) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > expectedBytes || sizeBytes > artifactMaxOriginalBytes) throw new Error("Artifact bytes exceed expectation");
        hash.update(chunk);
        await file.writeFile(chunk);
      }
      if (sizeBytes !== expectedBytes) throw new Error("Artifact size differs from expectation");
      await file.sync();
      return { key, digest: hash.digest("hex"), sizeBytes };
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    } finally {
      await file.close();
    }
  }

  private async checkedPath(kind: "staged" | "objects", key: string): Promise<string> {
    await this.directory(kind);
    const path = this.path(kind, key);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
      throw new Error("Artifact object is unsafe");
    }
    return path;
  }

  async finalize(stagedKey: string, expectedDigest: string): Promise<string> {
    if (!keyPattern.test(expectedDigest)) throw new Error("Invalid expected artifact digest");
    await this.directory("objects");
    const objectKey = createHash("sha256").update(`turas-object-v1:${stagedKey}`).digest("hex");
    const destination = this.path("objects", objectKey);
    let source: string | undefined;
    try { source = await this.checkedPath("staged", stagedKey); }
    catch (error) {
      if (typeof error !== "object" || !error || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    const path = source ?? await this.checkedPath("objects", objectKey);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest("hex") !== expectedDigest) throw new Error("Artifact digest changed");
    if (source) {
      await link(source, destination).catch((error: unknown) => {
        if (typeof error !== "object" || !error || !("code" in error) ||
            !["EEXIST", "ENOENT"].includes(String(error.code))) throw error;
      });
      await this.checkedPath("objects", objectKey);
      await unlink(source).catch((error: unknown) => {
        if (typeof error !== "object" || !error || !("code" in error) || error.code !== "ENOENT") throw error;
      });
    }
    return objectKey;
  }

  async readPath(objectKey: string): Promise<string> {
    return this.checkedPath("objects", objectKey);
  }

  private async remove(kind: "staged" | "objects", key: string): Promise<void> {
    await this.directory(kind);
    const path = this.path(kind, key);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Artifact object is unsafe");
      await unlink(path);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }

  delete(key: string): Promise<void> { return this.remove("objects", key); }
  deleteStaged(key: string): Promise<void> { return this.remove("staged", key); }
}
