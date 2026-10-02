import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, link, unlink, opendir } from "node:fs/promises";
import type { Dir } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { HttpFailure } from "../../contracts/http";
import { STAFFING_LIMITS, staffingIdSchema } from "../../contracts/staffing";
import { getServerConfig } from "../config";

const sweepDirectories = new Map<string, Dir>();
/** Separate personnel store. No artifact/RAG cleanup owns these objects. */
export class WorkforceStore {
  constructor(readonly root = process.env.TURAS_WORKFORCE_STORE_ROOT ?? "",
    readonly environmentId = getServerConfig().TURAS_ENVIRONMENT_ID) {}
  private async directory(kind: "staged" | "objects") {
    if (!this.root || !isAbsolute(this.root) || resolve(this.root) !== this.root ||
      /[\x00-\x1f,]/.test(this.root)) throw new HttpFailure(503, "dependency_unavailable", "Workforce store unavailable");
    const root = await lstat(this.root);
    if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077) || await realpath(this.root) !== this.root) {
      throw new HttpFailure(503, "dependency_unavailable", "Workforce store unavailable");
    }
    const markerPath = join(this.root, ".turas-workforce-store.json"), markerStat = await lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || (markerStat.mode & 0o077)) {
      throw new HttpFailure(503, "dependency_unavailable", "Workforce store unavailable");
    }
    const marker: unknown = JSON.parse(await readFile(markerPath, "utf8"));
    if (!marker || typeof marker !== "object" || !("environmentId" in marker) || marker.environmentId !== this.environmentId) {
      throw new HttpFailure(503, "dependency_unavailable", "Workforce store unavailable");
    }
    const directory = join(this.root, kind);
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || await realpath(directory) !== directory) {
      throw new HttpFailure(503, "dependency_unavailable", "Workforce store unavailable");
    }
    return directory;
  }
  /** Bounded scans retain their directory position across healthy worker ticks.
   * Only old private UUID files can be nominated; DB ownership is checked later. */
  async sweepCandidates(kind: "staged" | "objects", now = Date.now()) {
    const directory = await this.directory(kind), key = `${this.environmentId}:${directory}`;
    let walk = sweepDirectories.get(key);
    if (!walk) { walk = await opendir(directory); sweepDirectories.set(key, walk); }
    const candidates: string[] = [];
    for (let inspected = 0; inspected < 100 && candidates.length < 20; inspected++) {
      const entry = await walk.read();
      if (!entry) { await walk.close(); sweepDirectories.delete(key); break; }
      if (!entry.isFile() || !staffingIdSchema.safeParse(entry.name).success) continue;
      try {
        const stat = await lstat(join(directory, entry.name));
        if (stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && stat.mtimeMs <= now - 86_400_000) candidates.push(entry.name);
      } catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
    }
    return candidates;
  }
  async closeSweep() {
    for (const kind of ["staged", "objects"] as const) {
      const key = `${this.environmentId}:${join(this.root, kind)}`, walk = sweepDirectories.get(key);
      if (walk) { sweepDirectories.delete(key); await walk.close(); }
    }
  }
  async assertReady() { await this.directory("objects"); }
  private async path(kind: "staged" | "objects", key: string) {
    if (!staffingIdSchema.safeParse(key).success) throw new Error("Invalid workforce object identity");
    return join(await this.directory(kind), key);
  }
  async stage(bytes: AsyncIterable<Uint8Array>, expectedBytes: number) {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > STAFFING_LIMITS.importBytes) {
      throw new HttpFailure(413, "too_large", "Workforce original exceeds limit");
    }
    const key = randomUUID(), path = await this.path("staged", key);
    const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    let size = 0; const hash = createHash("sha256");
    try {
      for await (const chunk of bytes) {
        size += chunk.byteLength;
        if (size > expectedBytes || size > STAFFING_LIMITS.importBytes) throw new HttpFailure(413, "too_large", "Workforce original exceeds declared size");
        hash.update(chunk); await file.writeFile(chunk);
      }
      if (size !== expectedBytes) throw new HttpFailure(422, "invalid_input", "Original size differs from declaration");
      await file.sync();
      return { key, byteSize: size, contentDigest: hash.digest("hex") };
    } catch (error) { await unlink(path).catch(() => undefined); throw error; }
    finally { await file.close(); }
  }
  async read(key: string, kind: "staged" | "objects" = "objects") {
    const file = await open(await this.path(kind, key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o077) || stat.size < 1 || stat.size > STAFFING_LIMITS.importBytes) throw new Error("Invalid workforce object");
      return await file.readFile();
    } finally { await file.close(); }
  }
  async finalize(stagedKey: string, objectKey: string, expectedDigest: string) {
    const bytes = await this.read(stagedKey, "staged");
    if (createHash("sha256").update(bytes).digest("hex") !== expectedDigest) throw new HttpFailure(409, "source_changed", "Original changed");
    const source = await this.path("staged", stagedKey), target = await this.path("objects", objectKey);
    await link(source, target).catch(error => { if (error.code !== "EEXIST") throw error; });
    if (createHash("sha256").update(await this.read(objectKey)).digest("hex") !== expectedDigest) {
      throw new HttpFailure(409, "source_changed", "Original changed");
    }
    return objectKey;
  }
  async readPath(key: string) {
    // Verify an immutable private object before handing its path to the isolated worker.
    await this.read(key); return this.path("objects", key);
  }
  async remove(key: string, kind: "staged" | "objects" = "objects") {
    const path = await this.path(kind, key);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid workforce object");
      await unlink(path);
    } catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
  }
}
