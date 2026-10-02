import { z } from "zod";
import { STAFFING_LIMITS, staffingIdSchema, staffingDigestSchema, staffingVersionSchema,
  staffingRequestKeySchema, staffingRationaleSchema, staffingDateSchema, staffingLevelSchema,
  staffingExactCommandSchema } from "./staffing";

export const workforceFormatSchema = z.enum(["csv", "xlsx"]);
export const workforceImportIntentSchema = z.object({ requestKey: staffingRequestKeySchema,
  filename: z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f\x7f]+$/),
  format: workforceFormatSchema, byteSize: z.number().int().min(1).max(STAFFING_LIMITS.importBytes),
  contentDigest: staffingDigestSchema }).strict().refine(v => v.filename.toLowerCase().endsWith(`.${v.format}`),
    { path: ["filename"], message: "Original format must match filename" });
export const workforceImportCompletionSchema = z.object({ requestKey: staffingRequestKeySchema,
  contentDigest: staffingDigestSchema, sourceGeneration: staffingVersionSchema }).strict();
export const workforceImportCancelSchema = z.object({ requestKey: staffingRequestKeySchema,
  sourceGeneration: staffingVersionSchema, rationale: staffingRationaleSchema }).strict();

const candidateFields = {
  resourceId: staffingIdSchema, skillId: staffingIdSchema, level: staffingLevelSchema,
  assessmentDate: staffingDateSchema, nextReviewDate: staffingDateSchema,
  evidence: z.string().trim().min(1).max(4_000),
};
export const workforceManualAssessmentSchema = z.object({ requestKey: staffingRequestKeySchema,
  rationale: staffingRationaleSchema, ...candidateFields }).strict().refine(v => v.nextReviewDate >= v.assessmentDate,
    { path: ["nextReviewDate"], message: "Review date must follow assessment" });
export const workforceCorrectAssessmentSchema = z.object({ ...staffingExactCommandSchema.shape,
  ...candidateFields }).strict().refine(v => v.nextReviewDate >= v.assessmentDate,
    { path: ["nextReviewDate"], message: "Review date must follow assessment" });
export const workforceLocatorSchema = z.object({ cellId: staffingIdSchema,
  sheetIndex: z.number().int().min(0).max(19), rowNumber: z.number().int().min(1).max(1_048_576),
  columnNumber: z.number().int().min(1).max(16_384), field: z.enum([
    "resource", "skill", "level", "assessmentDate", "nextReviewDate", "evidence"]),
}).strict();
export const workforceCandidateSchema = z.object({ ...candidateFields,
  sourceVersionId: staffingIdSchema, extractionRunId: staffingIdSchema,
  mappingRevisionId: staffingIdSchema, sourceGeneration: staffingVersionSchema,
  rowKey: z.string().min(1).max(160), contentDigest: staffingDigestSchema,
  locators: z.array(workforceLocatorSchema).min(1).max(6), correctedFields: z.array(z.enum([
    "resource", "skill", "level", "assessmentDate", "nextReviewDate", "evidence"])).max(6),
}).strict().refine(v => v.nextReviewDate >= v.assessmentDate,
  { path: ["nextReviewDate"], message: "Review date must follow assessment" });

export const workforceTableMappingSchema = z.object({ sheetIndex: z.number().int().min(0).max(19),
  startRow: z.number().int().min(1).max(1_048_576), endRow: z.number().int().min(2).max(1_048_576),
  startColumn: z.number().int().min(1).max(16_384), endColumn: z.number().int().min(1).max(16_384),
  headerRow: z.number().int().min(1).max(1_048_576),
  columns: z.object({ resource: z.number().int().min(1).max(16_384),
    skill: z.number().int().min(1).max(16_384), level: z.number().int().min(1).max(16_384),
    assessmentDate: z.number().int().min(1).max(16_384), nextReviewDate: z.number().int().min(1).max(16_384),
    evidence: z.number().int().min(1).max(16_384) }).strict(),
}).strict().superRefine((v, ctx) => {
  if (v.headerRow !== v.startRow || v.endRow <= v.startRow || v.endColumn < v.startColumn ||
    Object.values(v.columns).some(c => c < v.startColumn || c > v.endColumn) ||
    new Set(Object.values(v.columns)).size !== 6) ctx.addIssue({ code: "custom", message: "Explicit valid table range required" });
});
export const workforceMappingSchema = z.object({ requestKey: staffingRequestKeySchema,
  sourceVersionId: staffingIdSchema, sourceGeneration: staffingVersionSchema,
  extractionRunId: staffingIdSchema, extractionDigest: staffingDigestSchema,
  csvDateConvention: z.enum(["ISO", "DMY", "MDY"]),
  tables: z.array(workforceTableMappingSchema).min(1).max(20),
  resources: z.array(z.object({ value: z.string().min(1).max(160), resourceId: staffingIdSchema }).strict()).max(500),
  skills: z.array(z.object({ value: z.string().min(1).max(160), skillId: staffingIdSchema }).strict()).max(50),
  corrections: z.array(z.object({ sheetIndex: z.number().int().min(0).max(19),
    rowNumber: z.number().int().min(1).max(1_048_576), resourceId: staffingIdSchema.optional(),
    skillId: staffingIdSchema.optional(), level: staffingLevelSchema.optional(),
    assessmentDate: staffingDateSchema.optional(), nextReviewDate: staffingDateSchema.optional(),
    evidence: candidateFields.evidence.optional() }).strict()).max(5_000),
}).strict().superRefine((v, ctx) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(v.tables.map(t => String(t.sheetIndex))) ||
      v.tables.reduce((n, t) => n + t.endRow - t.headerRow, 0) > STAFFING_LIMITS.candidateRows ||
      !unique(v.resources.map(r => r.value)) || !unique(v.skills.map(s => s.value)) ||
      !unique(v.corrections.map(c => `${c.sheetIndex}:${c.rowNumber}`)) ||
      v.corrections.some(c => Object.keys(c).length <= 2 || !v.tables.some(t =>
        t.sheetIndex === c.sheetIndex && c.rowNumber > t.headerRow && c.rowNumber <= t.endRow))) {
    ctx.addIssue({ code: "custom", message: "Mapping identities and rows must be unique and bounded" });
  }
});
export const workforceReviewSchema = z.object({ requestKey: staffingRequestKeySchema,
  rows: z.array(z.object({ competencyId: staffingIdSchema, candidateRevisionId: staffingIdSchema,
    candidateDigest: staffingDigestSchema, sourceGeneration: staffingVersionSchema,
    expectedAggregateVersion: staffingVersionSchema, action: z.enum(["accept", "reject", "retract"]),
    rationale: staffingRationaleSchema }).strict()).min(1).max(100),
}).strict().refine(v => new Set(v.rows.map(r => r.competencyId)).size === v.rows.length,
  { path: ["rows"], message: "Duplicate competencies are forbidden" });

export type WorkforceMapping = z.infer<typeof workforceMappingSchema>;
export type WorkforceCandidate = z.infer<typeof workforceCandidateSchema>;
