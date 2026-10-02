import { z } from "zod";
import { staffingDateSchema, staffingIdSchema, staffingDigestSchema, staffingTimestampSchema } from "./staffing";
import { staffingDemandInputSchema } from "./staffing-demands";
import { staffingScenarioContentSchema } from "./staffing-economics";
import { staffingReadDependencySchema } from "../staffing/dependencies";

export const staffingEmptyToolSchema = z.object({}).strict();
export const staffingMatchToolSchema = z.object({ pageSize: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional() }).strict();
export const staffingCapacityToolSchema = z.object({ resourceIds: z.array(staffingIdSchema).min(1).max(20),
  fromDate: staffingDateSchema, toDate: staffingDateSchema }).strict().refine(input =>
  new Set(input.resourceIds).size === input.resourceIds.length && input.fromDate <= input.toDate &&
  Date.parse(input.toDate) - Date.parse(input.fromDate) <= 90 * 86_400_000, "Invalid capacity scope");
const citations = z.array(staffingReadDependencySchema).max(200);
const common = { contractVersion: z.literal("staffing-advice-v1"), demandId: staffingIdSchema,
  demandRevisionId: staffingIdSchema, asOf: staffingTimestampSchema, citations };
export const staffingDemandToolResultSchema = z.object({ ...common, demand: staffingDemandInputSchema,
  reviewRequired: z.literal(false), planningOnly: z.literal(true) }).strict();
const constraint = z.object({ kind: z.enum(["resource", "region", "partner_eligibility", "availability", "required_skill", "calendar_coverage", "capacity", "overlap"]),
  outcome: z.enum(["passed", "failed", "unknown"]), reason: z.enum(["satisfied", "inactive", "region_mismatch", "grant_ineligible", "source_ineligible", "missing", "stale", "invalid_through_work", "insufficient_level", "uncertified_date", "insufficient_minutes", "insufficient_overlap"]),
  skillId: staffingIdSchema.optional(), date: staffingDateSchema.optional(), freshness: z.enum(["recent", "aging", "stale", "unknown"]).optional() }).strict();
export const staffingMatchToolResultSchema = z.object({ ...common, resultId: staffingIdSchema,
  inputDigest: staffingDigestSchema, formulaVersion: z.literal("staffing-matching-v1"),
  fromDate: staffingDateSchema, toDate: staffingDateSchema,
  skills: z.array(z.object({ skillId: staffingIdSchema, name: z.string().min(1).max(160) }).strict()).max(40),
  items: z.array(z.object({ resourceId: staffingIdSchema, displayName: z.string().min(1).max(160), timezone: z.string().min(1).max(100),
    status: z.enum(["eligible", "needs_review", "ineligible"]), desiredSkillCount: z.number().int().min(0).max(20),
    minimumRemainingAfterRequest: z.number().int().nullable(), availabilityFreshness: z.enum(["recent", "aging", "stale", "unknown"]),
    constraints: z.array(constraint).max(400) }).strict()).max(50),
  totalResources: z.number().int().min(0).max(500), completePool: z.literal(true),
  nextCursor: z.string().max(2048).nullable(), planningOnly: z.literal(true) }).strict();
const minutes = z.number().int().min(0).max(960).nullable();
export const staffingCapacityToolResultSchema = z.object({ ...common, formulaVersion: z.literal("staffing-capacity-v1"),
  fromDate: staffingDateSchema, toDate: staffingDateSchema,
  items: z.array(z.object({ resourceId: staffingIdSchema, days: z.array(z.object({ date: staffingDateSchema,
    calendarRevisionId: staffingIdSchema.nullable(), capacityGeneration: z.number().int().min(1),
    contractedMinutes: minutes, availableMinutes: minutes, protectedMinutes: minutes,
    confirmedMinutes: z.number().int().min(0), remainingMinutes: z.number().int().nullable(),
    freshness: z.enum(["recent", "aging", "stale", "unknown"]), reviewRequired: z.boolean(),
    actualUtilization: z.null(), actualReason: z.literal("actual_unavailable") }).strict()).min(1).max(91) }).strict()).min(1).max(20),
  planningOnly: z.literal(true) }).strict();
const { rationale: _rationale, ...scenarioShape } = staffingScenarioContentSchema.shape;
export const staffingScenarioToolResultSchema = z.object({ ...common, scenarioId: staffingIdSchema,
  contentDigest: staffingDigestSchema, scenario: z.object(scenarioShape).strict() }).strict();
