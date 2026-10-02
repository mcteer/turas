import { z } from "zod";

export const artifactContractVersion = "artifact-intake-v1" as const;
export const artifactMaxOriginalBytes = 10_485_760;
export const artifactMaxBatchBytes = 26_214_400;

const uuid = z.uuid();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const positive = z.number().int().positive();
const nonnegative = z.number().int().nonnegative();
const idempotencyKey = z.string().min(1).max(128).regex(/^[^\x00-\x1f\x7f]+$/);
const sourceDate = z.iso.date().nullable().refine((value) => value === null || value <= new Date().toISOString().slice(0, 10), "Source date cannot be in the future");
const textCodepoints = (value: string) => Array.from(value).length;

export const artifactAudienceSchema = z.enum(["internal", "delivery"]);
export const artifactDataCategorySchema = z.enum(["delivery_context", "internal_operations", "commercial", "personnel", "other_internal"]);
export const artifactFormatSchema = z.enum(["pdf", "docx", "pptx", "xlsx", "csv", "txt", "md", "png", "jpeg"]);
export const artifactStateSchema = z.enum(["quarantined", "processing", "ready", "partial", "failed", "cancelled", "withdrawn", "deleting", "deleted"]);
export const artifactIntentStateSchema = z.enum(["uploading", "staged", "completed", "cancelled", "expired", "failed"]);
export const artifactErrorCodeSchema = z.enum([
  "unsupported_format", "encrypted", "malformed", "unsafe_content", "limit_exceeded",
  "scan_unavailable", "scan_stale", "parser_timeout", "parser_failed", "cancelled", "source_withdrawn",
]);

export const artifactFileMetadataSchema = z.object({
  name: z.string().min(1).max(255).refine((value) => value === value.trim() && !/[\\/\x00-\x1f\x7f]/.test(value), "Unsafe filename"),
  expectedSizeBytes: z.number().int().min(1).max(artifactMaxOriginalBytes),
  declaredType: z.enum([
    "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv", "text/plain", "text/markdown", "image/png", "image/jpeg",
  ]),
  sourcePublishedOn: sourceDate,
  sourceObservedOn: sourceDate,
  rightsNote: z.string().trim().min(1).max(500),
  audience: artifactAudienceSchema,
  dataCategory: artifactDataCategorySchema,
}).strict().superRefine((value, ctx) => {
  if (value.audience === "delivery" && value.dataCategory !== "delivery_context") {
    ctx.addIssue({ code: "custom", path: ["dataCategory"], message: "Delivery audience requires delivery context" });
  }
});
export type ArtifactFileMetadata = z.infer<typeof artifactFileMetadataSchema>;

export const artifactIntentBatchSchema = z.object({
  conversationId: uuid,
  customerId: uuid,
  workloadId: uuid.nullable().optional(),
  files: z.array(artifactFileMetadataSchema).min(1).max(5),
  idempotencyKey,
}).strict().superRefine((value, ctx) => {
  if (value.files.reduce((sum, file) => sum + file.expectedSizeBytes, 0) > artifactMaxBatchBytes) {
    ctx.addIssue({ code: "custom", path: ["files"], message: "Batch exceeds 25 MiB" });
  }
});
export type ArtifactIntentBatch = z.infer<typeof artifactIntentBatchSchema>;

export const artifactUploadIntentReceiptSchema = z.object({
  id: uuid,
  state: artifactIntentStateSchema,
  versionId: uuid.nullable(),
  expectedSizeBytes: positive.max(artifactMaxOriginalBytes),
  receivedBytes: nonnegative.max(artifactMaxOriginalBytes),
  expiresAt: z.iso.datetime({ offset: true }),
  safeErrorCode: artifactErrorCodeSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.state === "completed") !== (value.versionId !== null)) {
    ctx.addIssue({ code: "custom", path: ["versionId"], message: "Only completed intents link a version" });
  }
  if (value.receivedBytes > value.expectedSizeBytes) {
    ctx.addIssue({ code: "custom", path: ["receivedBytes"], message: "Received bytes exceed expectation" });
  }
});
export type ArtifactUploadIntentReceipt = z.infer<typeof artifactUploadIntentReceiptSchema>;

export const artifactIntentCommandSchema = z.object({ idempotencyKey }).strict();
export const artifactAttachmentReferenceCommandSchema = z.object({ versionId: uuid, idempotencyKey }).strict();
export const artifactUnitsQuerySchema = z.object({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

const offsetSpan = { start: nonnegative, end: positive };
const lineSpan = { lineStart: positive, lineEnd: positive };
const bbox = z.tuple([z.number().finite(), z.number().finite(), z.number().positive(), z.number().positive()]);

export const artifactLocatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pdf"), page: positive, pageLabel: z.string().max(100).optional(), ...offsetSpan, bbox: bbox.optional() }).strict().refine((value) => value.end > value.start),
  z.object({ kind: z.literal("docx"), part: z.string().min(1).max(255), section: positive, paragraph: positive, table: positive.optional(), row: positive.optional(), cell: positive.optional() }).strict(),
  z.object({ kind: z.literal("pptx"), slide: positive, shape: positive, paragraph: positive, notes: z.boolean() }).strict(),
  z.object({ kind: z.literal("xlsx"), sheetOrdinal: positive, sheetName: z.string().min(1).max(255), sheetState: z.enum(["visible", "hidden", "veryHidden"]), row: positive, column: positive, a1: z.string().regex(/^[A-Z]+[1-9][0-9]*$/), mergedRange: z.string().max(100).optional(), mergedMaster: z.string().max(100).optional(), hiddenRow: z.boolean(), hiddenColumn: z.boolean() }).strict(),
  z.object({ kind: z.literal("csv"), record: positive, column: positive, ...lineSpan }).strict().refine((value) => value.lineEnd >= value.lineStart),
  z.object({ kind: z.enum(["txt", "md"]), ...lineSpan }).strict().refine((value) => value.lineEnd >= value.lineStart),
  z.object({ kind: z.literal("image"), width: positive.max(16_000), height: positive.max(16_000), region: bbox, orientation: z.number().int().min(0).max(359).nullable() }).strict(),
]);
export type ArtifactLocator = z.infer<typeof artifactLocatorSchema>;

export const artifactExtractionUnitSchema = z.object({
  id: uuid,
  ordinal: positive,
  text: z.string().min(1).refine((value) => textCodepoints(value) <= 32_000, "Unit text exceeds 32,000 code points"),
  locator: artifactLocatorSchema,
  origin: z.enum(["native", "ocr"]),
  ocrConfidence: z.number().min(0).max(100).nullable(),
  formula: z.string().max(32_000).nullable().optional(),
  cachedValue: z.union([z.string().max(32_000), z.number().finite(), z.boolean(), z.null()]).optional(),
  hidden: z.boolean().optional(),
  sourceStart: nonnegative.optional(),
  sourceEnd: positive.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.origin === "native" && value.ocrConfidence !== null) ctx.addIssue({ code: "custom", path: ["ocrConfidence"], message: "Native text has no OCR confidence" });
  if (value.sourceStart !== undefined && value.sourceEnd !== undefined && value.sourceEnd <= value.sourceStart) {
    ctx.addIssue({ code: "custom", path: ["sourceEnd"], message: "Source span must be positive" });
  }
});
export type ArtifactExtractionUnit = z.infer<typeof artifactExtractionUnitSchema>;

export const artifactCoverageSchema = z.object({
  total: nonnegative.nullable(),
  visited: nonnegative,
  omitted: z.array(z.object({ kind: z.string().min(1).max(80), count: positive, reason: z.string().min(1).max(200) }).strict()).max(100),
}).strict().refine((value) => value.total === null || value.visited <= value.total, "Visited coverage exceeds total");

export const artifactExtractionManifestSchema = z.object({
  contract: z.literal(artifactContractVersion),
  originalDigest: digest,
  parserVersion: z.string().min(1).max(100),
  imageDigest: digest,
  scanReceiptDigest: digest,
  format: artifactFormatSchema,
  status: z.enum(["ready", "partial"]),
  coverage: artifactCoverageSchema,
  units: z.array(artifactExtractionUnitSchema).max(100_000),
  warnings: z.array(z.string().min(1).max(100)).max(100),
}).strict().superRefine((value, ctx) => {
  if (value.units.reduce((sum, unit) => sum + textCodepoints(unit.text), 0) > 500_000) {
    ctx.addIssue({ code: "custom", path: ["units"], message: "Extraction exceeds 500,000 code points" });
  }
  const ordinals = new Set(value.units.map((unit) => unit.ordinal));
  if (ordinals.size !== value.units.length) ctx.addIssue({ code: "custom", path: ["units"], message: "Duplicate unit ordinal" });
  if (value.coverage.omitted.length && value.status !== "partial") {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Omitted coverage requires partial status" });
  }
});
export type ArtifactExtractionManifest = z.infer<typeof artifactExtractionManifestSchema>;

export const artifactSelectionRangeSchema = z.object({ unitId: uuid, start: nonnegative, end: positive }).strict().refine((value) => value.end > value.start, "Selection span must be positive");
const artifactSelectionBaseSchema = z.object({
  versionId: uuid,
  runId: uuid,
  lifecycleGeneration: positive,
  ranges: z.array(artifactSelectionRangeSchema).min(1).max(20),
  excerpt: z.string().min(1).refine((value) => textCodepoints(value) <= 8_000, "Excerpt exceeds 8,000 code points"),
  excerptDigest: digest,
}).strict();
export const artifactSelectionSchema = artifactSelectionBaseSchema.superRefine((value, ctx) => {
  for (let index = 1; index < value.ranges.length; index += 1) {
    const previous = value.ranges[index - 1];
    const current = value.ranges[index];
    if (previous.unitId === current.unitId && current.start < previous.end) {
      ctx.addIssue({ code: "custom", path: ["ranges", index], message: "Ranges must be ordered and non-overlapping" });
    }
  }
});
export type ArtifactSelection = z.infer<typeof artifactSelectionSchema>;

export const artifactDraftSelectionSchema = artifactSelectionBaseSchema.pick({ versionId: true, runId: true, lifecycleGeneration: true, ranges: true });
export const artifactDraftSendSchema = z.object({
  text: z.string().max(16_384),
  selections: z.array(artifactDraftSelectionSchema).max(5),
  requestKey: uuid,
}).strict().superRefine((value, ctx) => {
  if (!value.text.trim() && !value.selections.length) {
    ctx.addIssue({ code: "custom", path: ["text"], message: "A message or selection is required" });
  }
  const ids = new Set(value.selections.map((selection) => selection.versionId));
  if (ids.size !== value.selections.length) {
    ctx.addIssue({ code: "custom", path: ["selections"], message: "Each version may be selected once" });
  }
  if (value.selections.reduce((sum, selection) => sum + selection.ranges.length, 0) > 20) {
    ctx.addIssue({ code: "custom", path: ["selections"], message: "Draft context exceeds 20 ranges" });
  }
});
export type ArtifactDraftSend = z.infer<typeof artifactDraftSendSchema>;

export const artifactScanReceiptSchema = z.object({
  contract: z.literal(artifactContractVersion),
  originalDigest: digest,
  engineVersion: z.string().min(1).max(100),
  signatureVersion: z.string().min(1).max(100),
  scanPolicyVersion: z.string().min(1).max(100),
  scannedAt: z.iso.datetime({ offset: true }),
  result: z.literal("clean"),
}).strict();
export type ArtifactScanReceipt = z.infer<typeof artifactScanReceiptSchema>;

export const artifactLifecycleActionSchema = z.object({
  action: z.enum(["retry", "cancel", "withdraw", "delete"]),
  expectedGeneration: positive,
  reason: z.string().trim().min(1).max(2_000),
  idempotencyKey,
}).strict();

export const artifactVersionDtoSchema = z.object({
  id: uuid,
  artifactId: uuid,
  publishedRunId: uuid.nullable(),
  versionNumber: positive,
  lifecycleGeneration: positive,
  state: artifactStateSchema,
  format: artifactFormatSchema.nullable(),
  sizeBytes: positive.max(artifactMaxOriginalBytes),
  displayName: z.string().min(1).max(255),
  coverage: artifactCoverageSchema.nullable(),
  safeErrorCode: artifactErrorCodeSchema.nullable(),
  canReadOriginal: z.boolean(),
  canPropose: z.boolean(),
  submitted: z.boolean(),
  canManageLifecycle: z.boolean(),
}).strict();

export const approvedArtifactCitationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pdf"), page: positive }).strict(),
  z.object({ kind: z.literal("docx"), section: positive, paragraph: positive }).strict(),
  z.object({ kind: z.literal("pptx"), slide: positive, shape: positive }).strict(),
  z.object({ kind: z.literal("xlsx"), sheetOrdinal: positive, row: positive, column: positive }).strict(),
  z.object({ kind: z.literal("csv"), record: positive, column: positive }).strict(),
  z.object({ kind: z.enum(["txt", "md"]), lineStart: positive, lineEnd: positive }).strict(),
  z.object({ kind: z.literal("image"), regionNumber: positive }).strict(),
]);
export const approvedArtifactExcerptSchema = z.object({
  sourceLabel: z.string().min(1).max(100),
  citation: approvedArtifactCitationSchema,
  excerpt: z.string().min(1).refine((value) => textCodepoints(value) <= 8_000),
  attestation: z.string().min(1).max(2_000),
}).strict();
export type ApprovedArtifactExcerpt = z.infer<typeof approvedArtifactExcerptSchema>;

/** Additive private workforce mode; existing artifact-intake-v1 contracts are unchanged. */
const workforceScalarSchema = z.union([z.string().max(500_000), z.number().finite(), z.boolean(), z.null()]);
export const workforceCellSchema = z.object({ sheetIndex: z.number().int().min(0).max(19),
  rowNumber: positive.max(1_048_576), columnNumber: positive.max(16_384),
  a1: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/).nullable(),
  kind: z.enum(["string", "number", "boolean", "date", "formula", "error", "empty"]),
  raw: workforceScalarSchema, text: z.string().max(500_000), formula: z.string().max(500_000).nullable(),
  sharedFormula: z.string().max(100).nullable(), cachedValue: workforceScalarSchema,
  hiddenSheet: z.boolean(), hiddenRow: z.boolean(), hiddenColumn: z.boolean(),
  merged: z.boolean(), mergedMaster: z.string().max(20).nullable(),
  lineStart: positive.nullable(), lineEnd: positive.nullable(),
}).strict();
export const workforceExtractionSchema = z.object({ contract: z.literal("workforce-table-v1"),
  parserVersion: z.literal("007-table-parser-v1"), originalDigest: digest, imageDigest: digest,
  scanReceiptDigest: digest, format: z.enum(["csv", "xlsx"]), status: z.enum(["ready", "partial"]),
  dateSystem: z.enum(["1900", "1904"]).nullable(),
  sheets: z.array(z.object({ index: z.number().int().min(0).max(19), name: z.string().min(1).max(255),
    state: z.enum(["visible", "hidden", "veryHidden"]), rowCount: nonnegative.max(1_048_576),
    columnCount: nonnegative.max(16_384) }).strict()).min(1).max(20),
  cells: z.array(workforceCellSchema).max(50_000), codePointCount: nonnegative.max(500_000),
  coverage: z.object({ total: nonnegative.nullable(), visited: nonnegative.max(50_000),
    omitted: z.array(z.object({ kind: z.string().max(30), count: positive,
      reason: z.enum(["sheet_limit", "cell_limit", "code_point_limit", "raw_date_unavailable"]) }).strict()).max(20),
  }).strict(),
}).strict().superRefine((v, ctx) => {
  const sheetIds = new Set(v.sheets.map(s => s.index));
  const locators = new Set(v.cells.map(c => `${c.sheetIndex}:${c.rowNumber}:${c.columnNumber}`));
  const points = v.cells.reduce((n, c) => n + Array.from(c.text).length + Array.from(c.formula ?? "").length, 0);
  if (sheetIds.size !== v.sheets.length || locators.size !== v.cells.length ||
      v.cells.some(c => !sheetIds.has(c.sheetIndex)) || v.coverage.visited !== v.cells.length ||
      (v.coverage.total !== null && v.coverage.total < v.cells.length) || points !== v.codePointCount ||
      (v.status === "ready") !== (v.coverage.omitted.length === 0) ||
      (v.format === "csv") !== (v.dateSystem === null)) {
    ctx.addIssue({ code: "custom", message: "Invalid workforce coverage or lineage" });
  }
});
export type WorkforceExtraction = z.infer<typeof workforceExtractionSchema>;
export type WorkforceExtractedCell = z.infer<typeof workforceCellSchema>;
