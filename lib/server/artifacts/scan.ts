import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { ArtifactContainerInvocation } from "./containers";
import type { ArtifactScanReceipt } from "../../contracts/artifacts";
import { recordArtifactMetric } from "./telemetry";

const execFileAsync = promisify(execFile);

export async function verifyArtifactImage(image: string, expectedDigest: string): Promise<void> {
  const { stdout } = await execFileAsync("docker", ["image", "inspect", image, "--format", "{{.Id}}"],
    { timeout: 5_000, maxBuffer: 1024 });
  if (stdout.trim() !== `sha256:${expectedDigest}`) throw new Error("artifact_image_changed");
}

export async function runArtifactContainer(invocation: ArtifactContainerInvocation,
  command: string[] = []): Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...invocation.args, ...command], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let ended = false;
    const stop = (reason: Error) => {
      if (ended) return;
      ended = true;
      child.kill("SIGKILL");
      execFile("docker", ["rm", "-f", invocation.name], { timeout: 5_000 }, () => undefined);
      reject(reason);
    };
    const timer = setTimeout(() => stop(new Error("artifact_container_timeout")), invocation.deadlineMs);
    child.stdout.on("data", (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > invocation.maxOutputBytes) stop(new Error("artifact_output_limit"));
      else out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errBytes += chunk.length;
      if (errBytes > 65_536) stop(new Error("artifact_diagnostics_limit"));
      else err.push(chunk);
    });
    child.on("error", (error) => { clearTimeout(timer); stop(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (ended) return;
      ended = true;
      resolve({ exitCode: code ?? 2, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
  });
}

export async function assertFreshArtifactSignatures(path: string): Promise<string> {
  const file = await open(`${path}/daily.cvd`, "r");
  const buffer = Buffer.alloc(512);
  try { await file.read(buffer, 0, buffer.length, 0); }
  finally { await file.close(); }
  const header = buffer.toString("ascii");
  const match = /^ClamAV-VDB:[^:]*:([0-9]+):/.exec(header);
  if (!match) throw new Error("scan_unavailable");
  const info = await stat(`${path}/daily.cvd`);
  if (Date.now() - info.mtimeMs > 7 * 86_400_000 || info.mtimeMs > Date.now() + 60_000) {
    throw new Error("scan_stale");
  }
  return match[1];
}

export async function scanArtifact(input: {
  originalPath: string; originalDigest: string; signaturesPath: string;
  invocation: ArtifactContainerInvocation; scannerImage: string; scannerDigest: string;
}): Promise<ArtifactScanReceipt> {
  await verifyArtifactImage(input.scannerImage, input.scannerDigest);
  const signatureVersion = await assertFreshArtifactSignatures(input.signaturesPath);
  recordArtifactMetric("scan_signature_age_ms",Math.max(0,
    Date.now()-(await stat(`${input.signaturesPath}/daily.cvd`)).mtimeMs));
  const before = createHash("sha256").update(await readFile(input.originalPath)).digest("hex");
  if (before !== input.originalDigest) throw new Error("original_digest_changed");
  const result = await runArtifactContainer(input.invocation);
  if (result.exitCode === 1 || result.stdout.toString("utf8").includes("FOUND")) throw new Error("unsafe_content");
  if (result.exitCode !== 0 || !/\/input: OK\b/.test(result.stdout.toString("utf8"))) {
    throw new Error("scan_unavailable");
  }
  const after = createHash("sha256").update(await readFile(input.originalPath)).digest("hex");
  if (after !== input.originalDigest) throw new Error("original_digest_changed");
  return { contract: "artifact-intake-v1", originalDigest: input.originalDigest,
    engineVersion: "ClamAV 1.5.4", signatureVersion,
    scanPolicyVersion: "004-scan-v1", scannedAt: new Date().toISOString(), result: "clean" };
}
