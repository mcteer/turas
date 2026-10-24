import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { featureSourceDigest } from "./execution-source-digest";
import { evidenceDigest } from "./pilot-evidence";
export async function pilotSource(root = process.cwd()) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid source commit");
  return { sourceCommit: commit, sourceDigest: await featureSourceDigest("016", root),
    catalogDigest: evidenceDigest(await readFile(`${root}/scripts/pilot-catalog.json`)) };
}
