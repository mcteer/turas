import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArtifactStoreConfig } from "../config";
import { artifactContainerInvocation } from "../artifacts/containers";
import { scanArtifact, verifyArtifactImage, runArtifactContainer } from "../artifacts/scan";
import { WorkforceStore } from "./store";
import { preparedWorkforceImages } from "./prepared";
import { claimWorkforceImport, heartbeatWorkforceImport, failWorkforceImport,
  publishWorkforceImport, type WorkforceClaim } from "./jobs";
import { recordStaffingTelemetry } from "./telemetry";
import { staffingSha256 } from "./commands";

/** File/container IO runs between the claim and publication transactions. */
export async function runWorkforceImport(claim: WorkforceClaim) {
  const startedAt = Date.now();
  let published = false;
  const temp = await mkdtemp(join(tmpdir(), "turas-workforce-input-")), input = join(temp, "input");
  let stopped = false, busy = false;
  const heartbeat = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void heartbeatWorkforceImport(claim).then(valid => { if (!valid) stopped = true; })
      .catch(() => { stopped = true; }).finally(() => { busy = false; });
  }, 10_000);
  const live = () => { if (stopped || Date.now() >= Date.parse(claim.deadlineAt)) throw new Error("source_changed"); };
  try {
    const images = preparedWorkforceImages(), artifacts = parseArtifactStoreConfig(process.env).root;
    if (images.parserDigest !== claim.parserImageDigest || images.scannerDigest !== claim.scannerImageDigest) throw new Error("source_changed");
    await copyFile(await new WorkforceStore().readPath(claim.objectKey), input); await chmod(input, 0o444);
    const bytes = await readFile(input);
    if (bytes.length !== claim.byteSize || createHash("sha256").update(bytes).digest("hex") !== claim.originalDigest) throw new Error("source_changed");
    live();
    const scanInvocation = artifactContainerInvocation({ kind: "scan", image: images.scannerImage,
      originalPath: input, signaturesPath: join(artifacts, "signatures") });
    scanInvocation.deadlineMs = Math.min(scanInvocation.deadlineMs, Math.max(1, Date.parse(claim.deadlineAt) - Date.now()));
    const receipt = await scanArtifact({ originalPath: input, originalDigest: claim.originalDigest,
      signaturesPath: join(artifacts, "signatures"), invocation: scanInvocation,
      scannerImage: images.scannerImage, scannerDigest: images.scannerDigest });
    live(); await verifyArtifactImage(images.parserImage, images.parserDigest);
    const parser = artifactContainerInvocation({ kind: "parse", image: images.parserImage,
      originalPath: input, ocrAssetsPath: join(artifacts, "assets") });
    parser.deadlineMs = Math.min(parser.deadlineMs, Math.max(1, Date.parse(claim.deadlineAt) - Date.now()));
    const output = await runArtifactContainer(parser, ["/input", claim.filename,
      claim.format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      claim.parserImageDigest, staffingSha256(receipt), "-", "workforce-table-v1"]);
    if (output.exitCode !== 0) throw new Error("parser_failed");
    live();
    await publishWorkforceImport(claim, JSON.parse(output.stdout.toString("utf8")), receipt);
    published = true;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "parser_failed";
    const code = raw === "artifact_container_timeout" ? "parser_timeout" :
      raw === "artifact_output_limit" ? "limit_exceeded" : raw;
    await failWorkforceImport(claim, code, ["scan_unavailable", "scan_stale", "parser_timeout"].includes(code));
  } finally {
    clearInterval(heartbeat);
    recordStaffingTelemetry({ operation: "import", outcome: published ? "committed" : "failed",
      durationMs: Math.min(86_400_000, Math.max(0, Date.now() - startedAt)), count: 1 });
    await rm(temp, { recursive: true, force: true });
  }
}
export async function runWorkforceWorkerTick() {
  const claim = await claimWorkforceImport();
  if (claim) await runWorkforceImport(claim);
}
