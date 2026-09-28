import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalArtifactStore } from "../../lib/server/artifacts/local-store";

const roots: string[] = [];
async function store() {
  const root = await mkdtemp(join(tmpdir(), "turas-artifact-store-"));
  roots.push(root);
  await chmod(root, 0o700);
  await writeFile(join(root, ".turas-artifact-store.json"), JSON.stringify({ environmentId: "test-004" }), { mode: 0o600 });
  return { root, store: new LocalArtifactStore({ root, environmentId: "test-004" }) };
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("private artifact store", () => {
  it("stages a bounded stream, computes its digest and finalizes once under opaque keys", async () => {
    const { store: artifacts } = await store();
    const bytes = Buffer.from("synthetic source");
    const staged = await artifacts.stage((async function* () { yield bytes.subarray(0, 4); yield bytes.subarray(4); })(), bytes.length);
    expect(staged.sizeBytes).toBe(bytes.length);
    expect(staged.digest).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(staged.key).toMatch(/^[a-f0-9]{64}$/);
    const finalized = await artifacts.finalize(staged.key, staged.digest);
    expect(finalized).toMatch(/^[a-f0-9]{64}$/);
    expect(finalized).not.toBe(staged.key);
    expect(await readFile(await artifacts.readPath(finalized))).toEqual(bytes);
    expect(await artifacts.finalize(staged.key, staged.digest)).toBe(finalized);
    await artifacts.delete(finalized);
    await artifacts.delete(finalized);
  });

  it("rejects size mismatch, overflow, unsafe keys and symlink objects", async () => {
    const { root, store: artifacts } = await store();
    await expect(artifacts.stage((async function* () { yield Buffer.from("abc"); })(), 4)).rejects.toThrow();
    await expect(artifacts.stage((async function* () { yield Buffer.from("abcd"); })(), 3)).rejects.toThrow();
    await expect(artifacts.readPath("../outside")).rejects.toThrow();
    const key = randomBytes(32).toString("hex");
    await symlink("/etc/passwd", join(root, "objects", key));
    await expect(artifacts.readPath(key)).rejects.toThrow();
  });
});
