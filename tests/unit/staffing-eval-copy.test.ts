import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyOwnedEvalFiles } from "../../scripts/eval-owned-copy";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "turas-owned-copy-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "owned-target");
  await mkdir(source); await writeFile(join(source, "synthetic.txt"), "Synthetic owned bytes\n", { mode: 0o600 });
  return { root, source, destination };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("original-allowance owned filesystem setup", () => {
  it("copies actual synthetic bytes while excluding runtime dependencies and workflow state", async () => {
    const f = await fixture();
    for (const directory of ["node_modules", ".eve"]) {
      await mkdir(join(f.source, directory)); await writeFile(join(f.source, directory, "private.txt"), "Synthetic excluded state");
    }
    copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() + 10_000, excludeRuntime: true });
    expect(await readFile(join(f.destination, "synthetic.txt"), "utf8")).toBe("Synthetic owned bytes\n");
    await expect(access(join(f.destination, "node_modules"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(f.destination, ".eve"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses an elapsed original deadline before creating a destination and distinguishes optional missing assets", async () => {
    const f = await fixture();
    expect(() => copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() - 1 })).toThrow("Original owned evaluation deadline reached");
    await expect(access(f.destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(() => copyOwnedEvalFiles(join(f.root, "absent"), f.destination)).toThrow("Owned evaluation copy failed");
    expect(() => copyOwnedEvalFiles(join(f.root, "absent"), f.destination, { allowMissing: true })).not.toThrow();
    await expect(access(f.destination)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not inherit Node preload options into the actual copy child", async () => {
    const f = await fixture(), prior = process.env.NODE_OPTIONS;
    try {
      process.env.NODE_OPTIONS = "--synthetic-invalid-option-must-not-reach-child";
      copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() + 10_000 });
      expect(await readFile(join(f.destination, "synthetic.txt"), "utf8")).toBe("Synthetic owned bytes\n");
    } finally { if (prior === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = prior; }
  });
});
