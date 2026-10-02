import { z } from "zod";

export const STAFFING_CONTRACT_VERSION = "staffing-v1" as const;
export const STAFFING_LIMITS = {
  revisionBytes: 131_072, resources: 500, pageSize: 50, defaultPageSize: 20,
  serviceDays: 91, dailyMinutes: 960, totalMinutes: 87_360,
  ordinaryWritesPerMinute: 30, importStartsPerMinute: 5,
  reviewPreviewMinutes: 10, reservationDays: 7,
  importBytes: 10_485_760, sheets: 20, cells: 50_000, candidateRows: 5_000,
  extractedCodePoints: 500_000, scanMilliseconds: 30_000, parseMilliseconds: 90_000,
  importDeadlineMilliseconds: 120_000, openImportsPerManager: 2, queuedImportsPerWorkspace: 10,
  originalQuotaBytes: 1_073_741_824, bulkReviewRows: 100,
  advisorySteps: 6, advisoryReads: 6, advisoryOutputTokens: 4_096,
  advisoryContextBytes: 24_576, advisoryDependencies: 200, advisoryInstructions: 8_000,
  advisoryDeadlineMilliseconds: 120_000, advisoryRequestsPerHour: 5,
} as const;

export const staffingIdSchema = z.uuid();
export const staffingDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const staffingVersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const staffingRequestKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const staffingRationaleSchema = z.string().trim().min(1).max(2_000);
export const staffingTimestampSchema = z.iso.datetime({ offset: true });
export const staffingDateSchema = z.string().regex(/^(?:20\d{2}|2100)-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }, "Valid business date required");
export const staffingTimezoneSchema = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; }
  catch { return false; }
}, "IANA timezone required");
export const staffingRegionSchema = z.string().regex(/^[A-Za-z0-9-]{1,32}$/);

/** Server-derived persisted scope, never caller-selected authorization. */
export const staffingScopeSchema = z.object({ environmentId: z.string().min(1),
  workspaceId: staffingIdSchema }).strict();
export const staffingRevisionEnvelopeSchema = z.object({ ...staffingScopeSchema.shape,
  id: staffingIdSchema, revision: staffingVersionSchema, aggregateVersion: staffingVersionSchema,
  contentDigest: staffingDigestSchema, contractVersion: z.literal(STAFFING_CONTRACT_VERSION),
  createdAt: staffingTimestampSchema }).strict();
export const staffingCommandEnvelopeSchema = z.object({ requestKey: staffingRequestKeySchema,
  rationale: staffingRationaleSchema }).strict();
export const staffingExactCommandSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  revisionId: staffingIdSchema, contentDigest: staffingDigestSchema,
  expectedAggregateVersion: staffingVersionSchema }).strict();
export const staffingListSchema = z.object({ pageSize: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2_048).optional() }).strict();

export const staffingResourceInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  externalKey: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  kind: z.enum(["internal", "partner"]), state: z.enum(["active", "inactive"]),
  membershipId: staffingIdSchema.nullable(), partnerOrganizationId: staffingIdSchema.nullable(),
  timezone: staffingTimezoneSchema, regionCode: staffingRegionSchema,
}).strict().superRefine((value, context) => {
  if ((value.kind === "partner") !== (value.partnerOrganizationId !== null)) {
    context.addIssue({ code: "custom", path: ["partnerOrganizationId"], message: "Explicit partner organization required" });
  }
});
export const staffingSkillInputSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(160), definition: z.string().trim().min(1).max(2_000),
  state: z.enum(["active", "retired"]) }).strict();
export const staffingLevelSchema = z.number().int().min(0).max(4);

/** Explicit operational allowlist: no evidence, absence categories or economics. */
export const staffingOperationalResourceSchema = z.object({
  resourceId: staffingIdSchema, displayName: z.string().min(1).max(160),
  kind: z.enum(["internal", "partner"]), state: z.enum(["active", "inactive"]),
  timezone: staffingTimezoneSchema, regionCode: staffingRegionSchema,
  aggregateVersion: staffingVersionSchema,
  skillsNextCursor: z.string().max(2048).nullable(),
  skills: z.array(z.object({ skillId: staffingIdSchema, level: staffingLevelSchema,
    revisionId: staffingIdSchema, freshness: z.enum(["recent", "aging", "stale", "unknown"]),
  }).strict()).max(50),
}).strict();

export type StaffingResourceInput = z.infer<typeof staffingResourceInputSchema>;
export type StaffingSkillInput = z.infer<typeof staffingSkillInputSchema>;
export type StaffingOperationalResource = z.infer<typeof staffingOperationalResourceSchema>;

export const staffingCreateResourceSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  resource: staffingResourceInputSchema }).strict();
export const staffingReviseResourceSchema = z.object({ ...staffingExactCommandSchema.shape,
  resource: staffingResourceInputSchema }).strict();
export const staffingCreateSkillSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  skill: staffingSkillInputSchema }).strict();
export const staffingReviseSkillSchema = z.object({ ...staffingExactCommandSchema.shape,
  skill: staffingSkillInputSchema }).strict();
export const staffingPartnerEligibilitySchema = z.object({ ...staffingExactCommandSchema.shape,
  customerId: staffingIdSchema, fromDate: staffingDateSchema, toDate: staffingDateSchema,
  state: z.enum(["active", "retracted"]) }).strict().refine(v => v.toDate >= v.fromDate,
    { path: ["toDate"], message: "Invalid eligibility period" });
