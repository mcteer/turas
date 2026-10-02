import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
const root = process.env.TURAS_WORKFORCE_STORE_ROOT, environmentId = process.env.TURAS_ENVIRONMENT_ID;
if (!root || !environmentId || !isAbsolute(root) || resolve(root) !== root ||
  root === resolve("public") || root.startsWith(`${resolve("public")}/`)) throw new Error("Explicit private workforce root and environment required");
mkdirSync(root, { recursive: true, mode: 0o700 });
const stat = lstatSync(root);
if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || realpathSync(root) !== root) throw new Error("Workforce root is not private");
const marker = join(root, ".turas-workforce-store.json");
if (existsSync(marker)) {
  const info = lstatSync(marker);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) ||
    JSON.parse(readFileSync(marker, "utf8")).environmentId !== environmentId) throw new Error("Workforce marker mismatch");
} else writeFileSync(marker, JSON.stringify({ environmentId, ownerToken: randomUUID() }), { flag: "wx", mode: 0o600 });
if (process.argv.slice(2).some(arg => arg !== "--attest-only")) throw new Error("Unknown workforce preparation option");
if (!process.argv.includes("--attest-only")) execFileSync("docker", ["build", "--file", "infra/artifacts/parser.Dockerfile",
  "--tag", "turas-artifact-parser:007-v1", "."], { stdio: "inherit", timeout: 600_000 });
const imageId = (image: string) => {
  const id = execFileSync("docker", ["image", "inspect", image, "--format", "{{.Id}}"], { encoding: "utf8", timeout: 5_000 }).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error("Invalid workforce image identity");
  return id.slice(7);
};
writeFileSync(join(root, "runtime-images.json"), JSON.stringify({ contract: "workforce-table-v1", environmentId,
  parserImage: "turas-artifact-parser:007-v1", parserDigest: imageId("turas-artifact-parser:007-v1"),
  scannerImage: "turas-artifact-scanner:004-v1", scannerDigest: imageId("turas-artifact-scanner:004-v1") }), { mode: 0o600 });
console.log("Workforce images prepared; no database changes");
