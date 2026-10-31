import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Images = {
  parserImage: string;
  scannerImage: string;
  scannerBase: string;
  signatureMaxAgeDays: number;
  englishOcrAsset: { url: string; sha256: string; license: string };
};

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const images = JSON.parse(readFileSync(resolve(repo, "infra/artifacts/images.json"), "utf8")) as Images;
const parserImage = process.env.TURAS_PILOT_PARSER_IMAGE ?? images.parserImage;
const scannerImage = process.env.TURAS_PILOT_SCANNER_IMAGE ?? images.scannerImage;
for (const [selected, fallback] of [[parserImage, images.parserImage], [scannerImage, images.scannerImage]]) {
  if (selected !== fallback && !/^sha256:[a-f0-9]{64}$/.test(selected)) throw new Error("Local artifact image selection must be immutable");
}
const rootValue = process.env.TURAS_ARTIFACT_STORE_ROOT;
const environmentId = process.env.TURAS_ENVIRONMENT_ID;
const requested = new Set(process.argv.slice(2));
const all = requested.size === 0;

function docker(...args: string[]): void {
  execFileSync("docker", args, { cwd: repo, stdio: "inherit" });
}

function prepareStore(): string {
  if (!rootValue || !environmentId) throw new Error("Set TURAS_ARTIFACT_STORE_ROOT and TURAS_ENVIRONMENT_ID");
  const root = resolve(rootValue);
  if (root !== rootValue) throw new Error("Artifact store root must be absolute and normalized");
  const publicRoot = resolve(repo, "public");
  if (root === publicRoot || root.startsWith(`${publicRoot}/`)) throw new Error("Artifact store cannot be public");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new Error("Artifact store root cannot be a symlink");
  chmodSync(root, 0o700);
  const markerPath = resolve(root, ".turas-artifact-store.json");
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { environmentId?: string };
    if (marker.environmentId !== environmentId) throw new Error("Artifact store belongs to a different environment");
  } else {
    writeFileSync(markerPath, JSON.stringify({ version: 1, environmentId }), { mode: 0o600, flag: "wx" });
  }
  chmodSync(markerPath, 0o600);
  return root;
}

function prepareSignatures(root: string): void {
  const signatures = resolve(root, "signatures");
  mkdirSync(signatures, { recursive: true, mode: 0o755 });
  // FreshClam drops to UID 1000 even when the container starts as root. The
  // parent store is 0700; restore this child directory after preparation.
  chmodSync(signatures, 0o777);
  const configPath = resolve(root, `freshclam-${randomUUID()}.conf`);
  try {
    // The runtime protocol reads signed CVDs. Disable incremental CLD output
    // using this pinned vendor image's configuration; retain its other settings.
    const config = execFileSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "cat", images.scannerBase, "/etc/clamav/freshclam.conf"], { cwd: repo, encoding: "utf8", timeout: 30_000, maxBuffer: 1_048_576 });
    if (!/^ScriptedUpdates\s+yes\s*$/m.test(config)) throw new Error("Expected pinned FreshClam update policy unavailable");
    writeFileSync(configPath, config.replace(/^ScriptedUpdates\s+yes\s*$/m, "ScriptedUpdates no"), { mode: 0o644, flag: "wx" });
    docker("run", "--rm", "--network", "bridge", "--user", "0:0", "--mount", `type=bind,src=${signatures},dst=/var/lib/clamav`, "--mount", `type=bind,src=${configPath},dst=/tmp/turas-freshclam.conf,readonly`, "--entrypoint", "freshclam", images.scannerBase, "--config-file=/tmp/turas-freshclam.conf", "--stdout");
  } finally { rmSync(configPath, { force: true }); chmodSync(signatures, 0o755); }
  const files = readdirSync(signatures).filter((name) => /^(main|daily|bytecode)\.(cvd|cld)$/.test(name));
  if (!files.length) throw new Error("FreshClam did not prepare a signature snapshot");
  const oldest = Math.min(...files.map((name) => statSync(resolve(signatures, name)).mtimeMs));
  if (Date.now() - oldest > images.signatureMaxAgeDays * 86_400_000) throw new Error("Artifact signatures are stale");
}

async function prepareOcrAsset(root: string): Promise<void> {
  const assetDir = resolve(root, "assets");
  const assetPath = resolve(assetDir, "eng.traineddata");
  mkdirSync(assetDir, { recursive: true, mode: 0o755 });
  chmodSync(assetDir, 0o755);
  if (existsSync(assetPath)) {
    const digest = createHash("sha256").update(readFileSync(assetPath)).digest("hex");
    if (digest === images.englishOcrAsset.sha256) return;
    throw new Error("Prepared OCR asset has a different digest");
  }
  const response = await fetch(images.englishOcrAsset.url);
  if (!response.ok) throw new Error(`OCR asset download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10_485_760) throw new Error("OCR asset exceeds preparation limit");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== images.englishOcrAsset.sha256) throw new Error("OCR asset digest mismatch");
  writeFileSync(assetPath, bytes, { mode: 0o644, flag: "wx" });
}

if (requested.size && [...requested].some((flag) => !["--store", "--images", "--signatures", "--assets"].includes(flag))) {
  throw new Error("Use --store, --images, --signatures or --assets");
}
const root = prepareStore();
if (all || requested.has("--images")) {
  if (parserImage === images.parserImage) docker("build", "--file", "infra/artifacts/parser.Dockerfile", "--tag", parserImage, ".");
  if (scannerImage === images.scannerImage) docker("build", "--file", "infra/artifacts/scanner.Dockerfile", "--tag", scannerImage, ".");
  const imageId = (name: string) => {
    const id = execFileSync("docker", ["image", "inspect", name, "--format", "{{.Id}}"], { encoding: "utf8" }).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(id) || name.startsWith("sha256:") && name !== id) throw new Error("Selected artifact image differs");
    return id.slice(7);
  };
  writeFileSync(resolve(root, "runtime-images.json"), JSON.stringify({
    contract: "artifact-intake-v1", parserImage,
    parserDigest: imageId(parserImage), scannerImage,
    scannerDigest: imageId(scannerImage),
  }), { mode: 0o600 });
}
if (all || requested.has("--signatures")) prepareSignatures(root);
if (all || requested.has("--assets")) await prepareOcrAsset(root);
