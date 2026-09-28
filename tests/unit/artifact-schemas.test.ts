import { describe, expect, it } from "vitest";
import {
  artifactExtractionManifestSchema,
  artifactFileMetadataSchema,
  artifactIntentBatchSchema,
  artifactLocatorSchema,
  artifactSelectionSchema,
  artifactUploadIntentReceiptSchema,
  approvedArtifactExcerptSchema,
} from "../../lib/contracts/artifacts";

const id = "00000000-0000-4000-8000-000000000401";
const digest = "a".repeat(64);
const metadata = {
  name: "synthetic.pdf", expectedSizeBytes: 100, declaredType: "application/pdf",
  sourcePublishedOn: null, sourceObservedOn: null, rightsNote: "Synthetic fixture",
  audience: "delivery", dataCategory: "delivery_context",
};

describe("artifact boundary contracts", () => {
  it("rejects unsafe names, empty/oversized bytes, future dates and unknown fields", () => {
    expect(artifactFileMetadataSchema.safeParse(metadata).success).toBe(true);
    for (const name of ["../synthetic.pdf", "a\\b.pdf", "a\nb.pdf", " "]) {
      expect(artifactFileMetadataSchema.safeParse({ ...metadata, name }).success).toBe(false);
    }
    for (const expectedSizeBytes of [0, 10_485_761]) {
      expect(artifactFileMetadataSchema.safeParse({ ...metadata, expectedSizeBytes }).success).toBe(false);
    }
    expect(artifactFileMetadataSchema.safeParse({ ...metadata, sourcePublishedOn: "2999-01-01" }).success).toBe(false);
    expect(artifactFileMetadataSchema.safeParse({ ...metadata, origin: "independent_research" }).success).toBe(false);
    expect(artifactFileMetadataSchema.safeParse({ ...metadata, audience: "delivery", dataCategory: "personnel" }).success).toBe(false);
  });

  it("limits each batch and forbids client-owned scope fields", () => {
    const batch = { conversationId: id, customerId: id, files: [metadata], idempotencyKey: "fixture-key" };
    expect(artifactIntentBatchSchema.safeParse(batch).success).toBe(true);
    expect(artifactIntentBatchSchema.safeParse({ ...batch, files: Array(6).fill(metadata) }).success).toBe(false);
    expect(artifactIntentBatchSchema.safeParse({ ...batch, files: Array(3).fill({ ...metadata, expectedSizeBytes: 9_000_000 }) }).success).toBe(false);
    expect(artifactIntentBatchSchema.safeParse({ ...batch, ownerPrincipalId: id }).success).toBe(false);
  });

  it("keeps pre-completion intent receipts versionless", () => {
    const receipt = { id, state: "uploading", versionId: null, expectedSizeBytes: 100, receivedBytes: 0, expiresAt: "2026-09-28T12:00:00Z", safeErrorCode: null };
    expect(artifactUploadIntentReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(artifactUploadIntentReceiptSchema.safeParse({ ...receipt, versionId: id }).success).toBe(false);
    expect(artifactUploadIntentReceiptSchema.safeParse({ ...receipt, state: "completed", versionId: null }).success).toBe(false);
    expect(artifactUploadIntentReceiptSchema.safeParse({ ...receipt, objectKey: digest }).success).toBe(false);
  });

  it("requires tagged, exact locators", () => {
    expect(artifactLocatorSchema.safeParse({ kind: "pdf", page: 1, start: 0, end: 8 }).success).toBe(true);
    expect(artifactLocatorSchema.safeParse({ kind: "xlsx", sheetOrdinal: 1, sheetName: "Summary", sheetState: "visible", row: 2, column: 2, a1: "B2", hiddenRow: false, hiddenColumn: false }).success).toBe(true);
    expect(artifactLocatorSchema.safeParse({ kind: "pdf", page: 0, start: 0, end: 8 }).success).toBe(false);
    expect(artifactLocatorSchema.safeParse({ kind: "csv", record: 2, column: 2, lineStart: 3, lineEnd: 2 }).success).toBe(false);
    expect(artifactLocatorSchema.safeParse({ kind: "txt", lineStart: 1, lineEnd: 1, url: "https://example.invalid" }).success).toBe(false);
  });

  it("uses Unicode code-point offsets and ordered selection ranges", () => {
    const selection = { versionId: id, runId: id, lifecycleGeneration: 1, ranges: [{ unitId: id, start: 0, end: 2 }], excerpt: "😀A", excerptDigest: digest };
    expect(artifactSelectionSchema.safeParse(selection).success).toBe(true);
    expect(artifactSelectionSchema.safeParse({ ...selection, excerpt: "x".repeat(8001) }).success).toBe(false);
    expect(artifactSelectionSchema.safeParse({ ...selection, ranges: [{ unitId: id, start: 2, end: 2 }] }).success).toBe(false);
    expect(artifactSelectionSchema.safeParse({ ...selection, ranges: Array(21).fill(selection.ranges[0]) }).success).toBe(false);
    expect(artifactSelectionSchema.safeParse({ ...selection, ranges: [{ unitId: id, start: 3, end: 4 }, { unitId: id, start: 0, end: 2 }] }).success).toBe(false);
  });

  it("bounds parser output and restricts approved excerpt projections", () => {
    const unit = { id, ordinal: 1, text: "Synthetic source", locator: { kind: "pdf", page: 1, start: 0, end: 16 }, origin: "native", ocrConfidence: null };
    const manifest = { contract: "artifact-intake-v1", originalDigest: digest, parserVersion: "004-v1", imageDigest: digest, scanReceiptDigest: digest, format: "pdf", status: "ready", coverage: { total: 1, visited: 1, omitted: [] }, units: [unit], warnings: [] };
    expect(artifactExtractionManifestSchema.safeParse(manifest).success).toBe(true);
    expect(artifactExtractionManifestSchema.safeParse({ ...manifest, units: [{ ...unit, text: "x".repeat(32001) }] }).success).toBe(false);
    expect(artifactExtractionManifestSchema.safeParse({ ...manifest, scanReceiptDigest: null }).success).toBe(false);
    const approved = { sourceLabel: "Reviewed source", citation: { kind: "pdf", page: 1 }, excerpt: "Synthetic source", attestation: "Reviewed exact excerpt" };
    expect(approvedArtifactExcerptSchema.safeParse(approved).success).toBe(true);
    expect(approvedArtifactExcerptSchema.safeParse({ ...approved, filename: "private.pdf" }).success).toBe(false);
  });
});
