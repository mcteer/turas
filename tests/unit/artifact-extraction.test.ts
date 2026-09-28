import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateArtifactExtraction } from "../../lib/server/artifacts/extraction";

const digest = "a".repeat(64);
const image = "b".repeat(64);
const scan = {
  contract: "artifact-intake-v1", originalDigest: digest, engineVersion: "1.5.4",
  signatureVersion: "28137", scanPolicyVersion: "004-v1", scannedAt: "2026-09-28T12:00:00Z", result: "clean",
} as const;
const scanReceiptDigest = createHash("sha256").update(JSON.stringify(scan)).digest("hex");
const unit = {
  id: "00000000-0000-4000-8000-000000000401", ordinal: 1, text: "Synthetic evidence",
  locator: { kind: "pdf", page: 1, start: 0, end: 18 }, origin: "native", ocrConfidence: null,
};
const manifest = {
  contract: "artifact-intake-v1", originalDigest: digest, parserVersion: "004-v1",
  imageDigest: image, scanReceiptDigest, format: "pdf", status: "ready",
  coverage: { total: 1, visited: 1, omitted: [] }, units: [unit], warnings: [],
};
const expected = { originalDigest: digest, imageDigest: image, scanReceipt: scan };

describe("artifact publication validation", () => {
  it("accepts exact digest-bound located output", () => {
    expect(validateArtifactExtraction(manifest, expected).units).toHaveLength(1);
  });
  it("rejects mismatched scan, image and locator provenance", () => {
    expect(() => validateArtifactExtraction({ ...manifest, originalDigest: "c".repeat(64) }, expected)).toThrow("original_digest");
    expect(() => validateArtifactExtraction({ ...manifest, imageDigest: "c".repeat(64) }, expected)).toThrow("parser_image");
    expect(() => validateArtifactExtraction({ ...manifest, scanReceiptDigest: "c".repeat(64) }, expected)).toThrow("scan_receipt");
    expect(() => validateArtifactExtraction({ ...manifest, units: [{ ...unit, locator: { kind: "xlsx", sheetOrdinal: 1, sheetName: "Private", sheetState: "hidden", row: 1, column: 1, a1: "A1", hiddenRow: false, hiddenColumn: false } }] }, expected)).toThrow("locator_format");
  });
  it("requires explicit no-text and partial coverage explanations", () => {
    expect(() => validateArtifactExtraction({ ...manifest, units: [] }, expected)).toThrow("no_text");
    expect(() => validateArtifactExtraction({ ...manifest, coverage: { total: 2, visited: 1, omitted: [] } }, expected)).toThrow("coverage");
    expect(validateArtifactExtraction({ ...manifest, units: [], warnings: ["no_text"] }, expected).units).toHaveLength(0);
  });
});
