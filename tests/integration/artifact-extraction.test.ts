import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { preflightArtifact } from "../../packages/artifact-extractor/src/preflight";
import { parseArtifact } from "../../packages/artifact-extractor/src/main";
import { validateArtifactExtraction } from "../../lib/server/artifacts/extraction";
import { artifactContainerInvocation } from "../../lib/server/artifacts/containers";
import { assertFreshArtifactSignatures, scanArtifact } from "../../lib/server/artifacts/scan";

const root = join(process.cwd(), "local-artifacts/004/fixtures");
const preparedStore = process.env.TURAS_TEST_ARTIFACT_STORE_ROOT ?? join(process.cwd(), "local-artifacts/004/store");
const declared = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", txt: "text/plain", md: "text/markdown",
  png: "image/png", jpeg: "image/jpeg",
} as const;

describe("real synthetic artifact preflight", () => {
  it.each([
    ["simple.txt", "txt"], ["notes.md", "md"], ["multiline.csv", "csv"],
    ["review.pdf", "pdf"], ["scanned.pdf", "pdf"],
    ["review.docx", "docx"], ["milestone.pptx", "pptx"], ["workloads.xlsx", "xlsx"],
    ["invoice.png", "png"], ["invoice.jpg", "jpeg"], ["rotated.png", "png"],
  ] as const)("accepts %s as %s with its actual bytes", async (filename, format) => {
    const bytes = await readFile(join(root, filename));
    expect((await preflightArtifact(bytes, filename, declared[format])).format).toBe(format);
  });

  it.each([
    ["external.docx", "docx", "external_relationship"],
    ["xxe.docx", "docx", "xxe"],
    ["traversal.docx", "docx", "path_traversal"],
    ["active.docx", "docx", "active_content"],
    ["expansion.docx", "docx", "entry_expansion_limit"],
    ["encrypted.pdf", "pdf", "encrypted"],
    ["corrupt.pdf", "pdf", "malformed"],
    ["spoofed.pdf", "pdf", "type_mismatch"],
    ["bad-utf8.txt", "txt", "invalid_utf8"],
  ] as const)("rejects %s without exposing content", async (filename, format, code) => {
    const bytes = await readFile(join(root, filename));
    await expect(preflightArtifact(bytes, filename, declared[format])).rejects.toMatchObject({ code });
  });
});

describe("located synthetic extraction", () => {
  it.each([
    ["simple.txt", "txt", "Juniper API", "txt"],
    ["notes.md", "md", "verify rollback", "md"],
    ["multiline.csv", "csv", "second line", "csv"],
    ["review.docx", "docx", "Panel", "docx"],
    ["milestone.pptx", "pptx", "Delivery milestone one", "pptx"],
    ["workloads.xlsx", "xlsx", "2", "xlsx"],
    ["review.pdf", "pdf", "Juniper readiness review", "pdf"],
  ] as const)("extracts %s with %s locators", async (filename, format, phrase, locator) => {
    const bytes = await readFile(join(root, filename));
    const result = await parseArtifact(bytes, filename, declared[format], {
      imageDigest: "a".repeat(64), scanReceiptDigest: "b".repeat(64),
    });
    expect(result.format).toBe(format);
    expect(result.units.some((unit) => unit.locator.kind === locator && unit.text.includes(phrase))).toBe(true);
    const scanReceipt = { contract: "artifact-intake-v1" as const, originalDigest: result.originalDigest,
      engineVersion: "synthetic", signatureVersion: "synthetic", scanPolicyVersion: "004-scan-v1",
      scannedAt: new Date().toISOString(), result: "clean" as const };
    const scanReceiptDigest = createHash("sha256").update(JSON.stringify(scanReceipt)).digest("hex");
    expect(validateArtifactExtraction({ ...result, scanReceiptDigest }, {
      originalDigest: result.originalDigest, imageDigest: "a".repeat(64), scanReceipt,
    }).units.length).toBeGreaterThan(0);
  });

  it.each([
    ["invoice.png", "png", "Synthetic invoice 42"],
    ["invoice.jpg", "jpeg", "Synthetic invoice 42"],
    ["rotated.png", "png", "ROTATED 42"],
    ["scanned.pdf", "pdf", "Synthetic invoice 42"],
  ] as const)("OCRs %s offline with image provenance", async (filename, format, phrase) => {
    const old = process.env.TURAS_OCR_ASSET_ROOT;
    process.env.TURAS_OCR_ASSET_ROOT = join(preparedStore, "assets");
    try {
      const result = await parseArtifact(await readFile(join(root, filename)), filename, declared[format], {
        imageDigest: "a".repeat(64), scanReceiptDigest: "b".repeat(64),
      });
      expect(result.units.some((item) => item.origin === "ocr" && item.text.includes(phrase))).toBe(true);
      expect(result.units.every((item) => item.ocrConfidence === null || item.ocrConfidence >= 0)).toBe(true);
      if (filename === "rotated.png") {
        expect(result.units[0].locator).toMatchObject({ orientation: 90 });
      }
    } finally { process.env.TURAS_OCR_ASSET_ROOT = old; }
  }, 120_000);
});

describe("constrained local scanner", () => {
  it("rejects missing and stale signature snapshots before scanning", async () => {
    const directory = await mkdtemp(join(tmpdir(),"turas-004-signatures-"));
    try {
      await expect(assertFreshArtifactSignatures(directory)).rejects.toThrow();
      const path = join(directory,"daily.cvd");
      await writeFile(path,"ClamAV-VDB:synthetic:28137:local-test");
      const old = new Date(Date.now()-8*86_400_000);
      await utimes(path,old,old);
      await expect(assertFreshArtifactSignatures(directory)).rejects.toThrow("scan_stale");
    } finally { await rm(directory,{ recursive: true,force: true }); }
  });

  it("accepts a clean fixture and blocks the generated EICAR canary", async () => {
    const store = preparedStore;
    const images = JSON.parse(await readFile(join(store, "runtime-images.json"), "utf8")) as {
      scannerImage: string; scannerDigest: string;
    };
    const staged = await mkdtemp(join(tmpdir(), "turas-artifact-scan-test-"));
    try {
      for (const [name, clean] of [["simple.txt", true], ["eicar.txt", false]] as const) {
        const path = join(staged, name);
        await copyFile(join(root, name), path);
        await chmod(path, 0o444);
        const digest = createHash("sha256").update(await readFile(path)).digest("hex");
        const invocation = artifactContainerInvocation({ kind: "scan", image: images.scannerImage,
          originalPath: path, signaturesPath: join(store, "signatures") });
        const run = scanArtifact({ originalPath: path, originalDigest: digest,
          signaturesPath: join(store, "signatures"), invocation,
          scannerImage: images.scannerImage, scannerDigest: images.scannerDigest });
        if (clean) expect((await run).result).toBe("clean");
        else await expect(run).rejects.toThrow("unsafe_content");
      }
    } finally { await rm(staged, { recursive: true, force: true }); }
  }, 60_000);
});
