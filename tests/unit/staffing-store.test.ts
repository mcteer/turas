import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, chmod, utimes, symlink, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { WorkforceStore } from "../../lib/server/staffing/store";

async function ownedStore(run: (store: WorkforceStore, root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "turas-007-store-")));
  const environment = `test-store-${randomUUID()}`;
  const store = new WorkforceStore(root, environment);
  try {
    await writeFile(join(root, ".turas-workforce-store.json"), JSON.stringify({ environmentId: environment }), { mode: 0o600 });
    await store.assertReady();
    await run(store, root);
  } finally { await store.closeSweep(); await rm(root, { recursive: true, force: true }); }
}

describe("owned workforce orphan nomination", () => {
  it("nominates only old private UUID files, excluding young, public and symlink files", async () => {
    await ownedStore(async (store, root) => {
      const old = randomUUID(), young = randomUUID(), publicFile = randomUUID(), alias = randomUUID();
      await mkdir(join(root, "staged"), { mode: 0o700 });
      for (const key of [old, young, publicFile]) await writeFile(join(root, "staged", key), "synthetic", { mode: key === publicFile ? 0o644 : 0o600 });
      // A private test-runner umask must not turn this intentional public-file
      // rejection fixture into another eligible private file.
      await chmod(join(root, "staged", publicFile), 0o644);
      const earlier = new Date(Date.now() - 2 * 86_400_000);
      for (const key of [old, publicFile]) await utimes(join(root, "staged", key), earlier, earlier);
      await symlink(join(root, "staged", old), join(root, "staged", alias));
      expect(await store.sweepCandidates("staged")).toEqual([old]);
      // Nomination does not delete anything; database ownership must decide.
      expect((await store.read(old, "staged")).toString()).toBe("synthetic");
    });
  });
  it("continues bounded scans across ticks without losing later old files", async () => {
    await ownedStore(async (store, root) => {
      const expected: string[] = [], earlier = new Date(Date.now() - 2 * 86_400_000);
      for (let i = 0; i < 47; i++) {
        const key = randomUUID(); expected.push(key);
        await writeFile(join(root, "objects", key), "synthetic", { mode: 0o600 });
        await utimes(join(root, "objects", key), earlier, earlier);
      }
      const actual: string[] = [];
      for (let tick = 0; tick < 3; tick++) {
        const page = await store.sweepCandidates("objects"); expect(page.length).toBeLessThanOrEqual(20); actual.push(...page);
      }
      expect(actual.sort()).toEqual(expected.sort());
    });
  });
  it("rejects a changed environment marker before enumerating files", async () => {
    await ownedStore(async (store, root) => {
      await writeFile(join(root, ".turas-workforce-store.json"), JSON.stringify({ environmentId: "test-foreign" }), { mode: 0o600 });
      await expect(store.sweepCandidates("objects")).rejects.toMatchObject({ status: 503 });
    });
  });
});
