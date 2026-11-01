import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, symlink, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { evidenceDigest, readEvidence, writeEvidence } from "../../../scripts/pilot-evidence";
const roots: string[] = [];
async function root() { const p = await mkdtemp(path.join(await realpath(tmpdir()), "pilot-evidence-")); await chmod(p, 0o700); roots.push(p); return p; }
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
describe("private immutable evidence", () => {
  it("verifies exact private bytes", async () => { const p = await root(); const digest = await writeEvidence(p, "receipt.json", { state: "blocked" }); expect(await readEvidence(p, "receipt.json", digest)).toEqual({ state: "blocked" }); });
  it("rejects overwrite", async () => { const p = await root(); await writeEvidence(p, "receipt.json", {}); await expect(writeEvidence(p, "receipt.json", {})).rejects.toThrow(); });
  it("rejects traversal", async () => { await expect(writeEvidence(await root(), "../receipt.json", {})).rejects.toThrow("Unsafe evidence identity"); });
  it("rejects symlink files", async () => { const p = await root(); await writeEvidence(p, "real.json", {}); await symlink(path.join(p, "real.json"), path.join(p, "link.json")); await expect(readEvidence(p, "link.json", evidenceDigest("{}\n"))).rejects.toThrow(); });
  it("rejects public modes", async () => { const p = await root(); const digest = await writeEvidence(p, "receipt.json", {}); await chmod(path.join(p, "receipt.json"), 0o644); await expect(readEvidence(p, "receipt.json", digest)).rejects.toThrow("Unsafe evidence file"); });
  it("rejects an unsafe root", async () => { const p = await root(); await chmod(p, 0o755); await expect(writeEvidence(p, "receipt.json", {})).rejects.toThrow("Unsafe evidence directory"); });
  it("rejects altered bytes", async () => { const p = await root(); const digest = await writeEvidence(p, "receipt.json", {}); await writeFile(path.join(p, "receipt.json"), '{"changed":true}\n'); await expect(readEvidence(p, "receipt.json", digest)).rejects.toThrow("Evidence integrity failure"); });
  it("rejects excessive metadata", async () => { await expect(writeEvidence(await root(), "receipt.json", "x".repeat(1024 * 1024))).rejects.toThrow("Evidence exceeds limit"); });
});

it("summarizes unsafe input without customer credential or filename prose",async()=>{
 const {spawnSync}=await import("node:child_process");
 const result=spawnSync(process.execPath,["--import","tsx","scripts/pilot-readiness.ts","--run","/SyntheticCustomer/SyntheticCredential-private.json"],{encoding:"utf8"});
 expect(result.status).toBe(2);expect(result.stdout).toBe("");expect(result.stderr).toBe("Private pilot command retired; historical fixtures are import-only.\n");
});
