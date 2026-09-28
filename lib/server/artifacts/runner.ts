import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { artifactContainerInvocation } from "./containers";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { query } from "../db/client";
import { LocalArtifactStore } from "./local-store";
import { preparedArtifactImages } from "./prepared";
import { failArtifactRun, heartbeatArtifactRun, publishArtifactRun, type ArtifactJobClaim } from "./jobs";
import { runArtifactContainer, scanArtifact, verifyArtifactImage } from "./scan";
import { recordArtifactMetric } from "./telemetry";

type Original = { object_key: string; filename: string; declared_type: string;
  sha256_digest: string; actual_size_bytes: string };

const safeFailures = new Set(["unsupported_format", "encrypted", "malformed", "unsafe_content",
  "limit_exceeded", "scan_unavailable", "scan_stale", "parser_timeout", "parser_failed"]);

/** Run one already-claimed attempt. No SQL locks span container or file IO. */
export async function runArtifactJob(claim: ArtifactJobClaim): Promise<void> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const root = parseArtifactStoreConfig(process.env).root;
  const images = preparedArtifactImages();
  const row = await query<Original>(`
    SELECT object_key,filename,declared_type,sha256_digest,actual_size_bytes
    FROM artifact_versions WHERE id=$1 AND environment_id=$2 AND sha256_digest=$3
  `, [claim.versionId, environmentId, claim.originalDigest]);
  if (!row.rows[0] || images.parserDigest !== claim.parserImageDigest) {
    await failArtifactRun(claim, "parser_failed", false);
    return;
  }
  const original = row.rows[0];
  const store = new LocalArtifactStore({ root, environmentId });
  const temp = await mkdtemp(join(tmpdir(), "turas-artifact-input-"));
  const input = join(temp, "input");
  let stopped = false;
  let heartbeatBusy = false;
  const heartbeat = setInterval(() => {
    if (heartbeatBusy || stopped) return;
    heartbeatBusy = true;
    heartbeatArtifactRun(claim).then((valid) => { if (!valid) stopped = true; })
      .catch(() => { stopped = true; }).finally(() => { heartbeatBusy = false; });
  }, 5_000);
  try {
    await copyFile(await store.readPath(original.object_key), input);
    await chmod(input, 0o444);
    const bytes = await readFile(input);
    if (bytes.byteLength !== Number(original.actual_size_bytes) ||
        createHash("sha256").update(bytes).digest("hex") !== claim.originalDigest) {
      throw new Error("original_digest_changed");
    }
    const scanInvocation = artifactContainerInvocation({ kind: "scan", image: images.scannerImage,
      originalPath: input, signaturesPath: join(root, "signatures") });
    const scanStarted = Date.now();
    const receipt = await scanArtifact({ originalPath: input, originalDigest: claim.originalDigest,
      signaturesPath: join(root, "signatures"), invocation: scanInvocation,
      scannerImage: images.scannerImage, scannerDigest: images.scannerDigest });
    recordArtifactMetric("scan_duration_ms",Date.now()-scanStarted);
    if (stopped || Date.parse(claim.deadlineAt) <= Date.now()) throw new Error("parser_timeout");
    await verifyArtifactImage(images.parserImage, images.parserDigest);
    const parseInvocation = artifactContainerInvocation({ kind: "parse", image: images.parserImage,
      originalPath: input, ocrAssetsPath: join(root, "assets") });
    parseInvocation.deadlineMs = Math.min(parseInvocation.deadlineMs, Math.max(1, Date.parse(claim.deadlineAt) - Date.now()));
    const receiptDigest = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
    const parseStarted = Date.now();
    const output = await runArtifactContainer(parseInvocation,
      ["/input", original.filename, original.declared_type, claim.parserImageDigest, receiptDigest, "-"]);
    recordArtifactMetric("parse_duration_ms",Date.now()-parseStarted);
    if (output.exitCode !== 0) {
      const code = output.stderr.toString("utf8").trim();
      throw new Error(safeFailures.has(code) ? code : "parser_failed");
    }
    if (stopped || Date.parse(claim.deadlineAt) <= Date.now()) throw new Error("parser_timeout");
    let manifest: unknown;
    try { manifest = JSON.parse(output.stdout.toString("utf8")); }
    catch { throw new Error("parser_failed"); }
    await publishArtifactRun(claim, manifest, receipt);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "parser_failed";
    const code = raw === "artifact_container_timeout" ? "parser_timeout" :
      raw === "artifact_output_limit" ? "limit_exceeded" : safeFailures.has(raw) ? raw : "parser_failed";
    const transient = ["scan_unavailable", "scan_stale", "parser_timeout", "parser_failed"].includes(code);
    await failArtifactRun(claim, code, transient);
  } finally {
    clearInterval(heartbeat);
    await rm(temp, { recursive: true, force: true });
  }
}
