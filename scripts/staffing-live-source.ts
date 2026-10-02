import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

/** Bind preflight and live capture to the same checked-in and uncommitted source
 * bytes. Exclude secrets, workflow state and generated build/test artifacts. */
export async function staffingLiveSourceDigest(root = process.cwd()) {
  const digest = createHash("sha256");
  const ignored = new Set(["node_modules", ".eve", ".next", "dist", "build", "coverage", "test-results", "playwright-report"]);
  const roots = ["app", "agent", "lib", "migrations", "scripts", "public", "evals", "tests", "packages", "docs", ".github",
    "specs/007-skills-staffing", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "vitest.config.ts",
    "playwright.config.ts", "AGENTS.md", "README.md", "ROADMAP.md", "CONTRIBUTING.md", ".specify/memory/constitution.md"];
  async function visit(path: string): Promise<void> {
    const full = join(root, path), info = await lstat(full).catch(error => {
      if (error.code === "ENOENT") return null; throw error;
    });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error("Live source fingerprint refuses symlinks");
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) if (!ignored.has(name) && !name.startsWith(".env") && !name.endsWith(".log"))
        await visit(join(path, name));
    } else if (info.isFile()) {
      digest.update(path); digest.update("\0"); digest.update(await readFile(full)); digest.update("\0");
    }
  }
  for (const path of roots) await visit(path);
  return digest.digest("hex");
}
