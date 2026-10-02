import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

/** Bind preflight and live capture to the same checked-in and uncommitted source
 * bytes. Exclude secrets, workflow state and generated build/test artifacts. */
export async function executionSourceDigest(root = process.cwd()) {
  const digest = createHash("sha256");
  const ignored = new Set(["node_modules", ".eve", ".next", "dist", "build", "coverage", "test-results", "playwright-report"]);
  const roots = ["app", "agent", "lib", "migrations", "scripts", "public", "evals", "tests", "packages", "infra", "docs", ".github",
    "specs/008-engagement-execution", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "vitest.config.ts",
    "playwright.config.ts", "AGENTS.md", "README.md", "ROADMAP.md", "CONTRIBUTING.md", ".specify/memory/constitution.md"];
  async function visit(path: string): Promise<void> {
    const full = join(root, path), info = await lstat(full).catch(error => {
      if (error.code === "ENOENT") return null; throw error;
    });
    if (!info || path === "specs/008-engagement-execution/validation.md") return;
    if (info.isSymbolicLink()) throw new Error("Live source fingerprint refuses symlinks");
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) if (!ignored.has(name) && !name.startsWith(".env") && !name.endsWith(".log"))
        await visit(join(path, name));
    } else if (info.isFile()) {
      const bytes = await readFile(full);
      // Evidence ledger and checkbox/status bookkeeping cannot be part of their
      // own fingerprint. Requirement prose, task definitions and contracts remain bound.
      const content = /^specs\/008-engagement-execution\/(tasks|spec)\.md$/.test(path)
        ? bytes.toString("utf8").replace(/^\*\*Status\*\*:.*$/gm, "**Status**: tracking").replace(/^- \[[ Xx]\] (T\d{3}\b)/gm, "- [ ] $1") : bytes;
      digest.update(path); digest.update("\0"); digest.update(content); digest.update("\0");
    }
  }
  for (const path of roots) await visit(path);
  return digest.digest("hex");
}
