import { createHash } from "node:crypto";
import {
  artifactExtractionManifestSchema,
  artifactScanReceiptSchema,
  type ArtifactExtractionManifest,
  type ArtifactScanReceipt,
} from "../../contracts/artifacts";

export type ArtifactExtractionExpectation = {
  originalDigest: string;
  imageDigest: string;
  scanReceipt: ArtifactScanReceipt;
};

const locatorKindByFormat = {
  pdf: "pdf", docx: "docx", pptx: "pptx", xlsx: "xlsx", csv: "csv",
  txt: "txt", md: "md", png: "image", jpeg: "image",
} as const;

/** Validate a parser result before any SQL write; parser values never define authorization scope. */
export function validateArtifactExtraction(raw: unknown, expected: ArtifactExtractionExpectation): ArtifactExtractionManifest {
  const encoded = JSON.stringify(raw);
  if (Buffer.byteLength(encoded) > 52_428_800) throw new Error("manifest_size");
  const scan = artifactScanReceiptSchema.parse(expected.scanReceipt);
  if (scan.originalDigest !== expected.originalDigest || scan.result !== "clean") throw new Error("scan_receipt");
  const manifest = artifactExtractionManifestSchema.parse(raw);
  if (manifest.originalDigest !== expected.originalDigest) throw new Error("original_digest");
  if (manifest.imageDigest !== expected.imageDigest) throw new Error("parser_image");
  const scanDigest = createHash("sha256").update(JSON.stringify(scan)).digest("hex");
  if (manifest.scanReceiptDigest !== scanDigest) throw new Error("scan_receipt");
  const locatorKind = locatorKindByFormat[manifest.format];
  if (manifest.units.some((unit) => unit.locator.kind !== locatorKind)) throw new Error("locator_format");
  if (manifest.coverage.total !== null && manifest.coverage.visited < manifest.coverage.total && !manifest.coverage.omitted.length) {
    throw new Error("coverage");
  }
  if (!manifest.units.length && !manifest.warnings.includes("no_text")) throw new Error("no_text");
  if (manifest.status === "partial" && !manifest.coverage.omitted.length) throw new Error("coverage");
  return manifest;
}
