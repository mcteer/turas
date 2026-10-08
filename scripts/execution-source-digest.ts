import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

/** Bind preflight and live capture to the same checked-in and uncommitted source
 * bytes. Exclude secrets, workflow state and generated build/test artifacts. */
export async function executionSourceDigest(root = process.cwd()) {
  return featureSourceDigest("008", root);
}

export async function featureSourceDigest(feature: "008" | "010" | "011", root = process.cwd()) {
  const digest = createHash("sha256");
  const ignored = new Set(["node_modules", ".eve", ".next", "dist", "build", "coverage", "test-results", "playwright-report"]);
  const roots = ["app", "agent", "lib", "migrations", "scripts", "public", "evals", "tests", "packages", "infra", "docs", ".github",
    `specs/${feature === "008" ? "008-engagement-execution" : feature === "010" ? "010-tam-support-guidance" : "011-product-expansion"}`, "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "tsconfig.execution.json", "tsconfig.expansion.json", "vitest.config.ts",
    "playwright.config.ts", "AGENTS.md", "README.md", "ROADMAP.md", "CONTRIBUTING.md", ".specify/memory/constitution.md"];
  async function visit(path: string): Promise<void> {
    const full = join(root, path), info = await lstat(full).catch(error => {
      if (error.code === "ENOENT") return null; throw error;
    });
    const featureDirectory = `specs/${feature === "008" ? "008-engagement-execution" : feature === "010" ? "010-tam-support-guidance" : "011-product-expansion"}`;
    if (!info || path === `${featureDirectory}/validation.md`) return;
    if (info.isSymbolicLink()) throw new Error("Live source fingerprint refuses symlinks");
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) if (!ignored.has(name) && !name.startsWith(".env") && !name.endsWith(".log"))
        await visit(join(path, name));
    } else if (info.isFile()) {
      const bytes = await readFile(full);
      // Evidence ledger and checkbox/status bookkeeping cannot be part of their
      // own fingerprint. Requirement prose, task definitions and contracts remain bound.
      const content = ["tasks.md", "spec.md"].some(name => path === `${featureDirectory}/${name}`)
        ? bytes.toString("utf8").replace(/^\*\*Status\*\*:.*$/gm, "**Status**: tracking").replace(/^- \[[ Xx]\] (T\d{3}\b)/gm, "- [ ] $1") : bytes;
      digest.update(path); digest.update("\0"); digest.update(content); digest.update("\0");
    }
  }
  for (const path of roots) await visit(path);
  return digest.digest("hex");
}
