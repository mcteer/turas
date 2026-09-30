import { createHash } from "node:crypto";
import { z } from "zod";
import { planDraftContentSchema } from "./plan-content";

export const planContractVersion = "delivery-plan-v1" as const;
export const planIdSchema = z.uuid();
export const planDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const planVersionSchema = z.number().int().positive().safe();
export const planRequestKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const planAudienceSchema = z.enum(["internal","delivery"]);
export const planReviewStateSchema = z.enum(["draft","in_review","changes_requested",
  "rejected","accepted","superseded"]);
export const planDraftingStateSchema = z.enum(["prepared","running","saved","failed",
  "cancelled","expired","unconfirmed"]);
export const planAvailabilitySchema = z.enum(["readable","historical_warning",
  "withheld","purged"]);
export const planSourceKindSchema = z.enum(["accepted_profile","approved_excerpt",
  "verified_research","shared_knowledge"]);

const scope = {
  workspaceId:planIdSchema,
  customerId:planIdSchema,
  workloadId:planIdSchema.nullable(),
};

export const planCreateSchema = z.object({
  requestKey:planRequestKeySchema,
  ...scope,
  audience:planAudienceSchema,
  ownerMembershipId:planIdSchema,
  content:planDraftContentSchema,
}).strict();
export type PlanCreateInput = z.infer<typeof planCreateSchema>;

export const planSaveRevisionSchema = z.object({
  requestKey:planRequestKeySchema,
  expectedAggregateVersion:planVersionSchema,
  parentRevisionId:planIdSchema,
  baseAcceptedRevisionId:planIdSchema.nullable(),
  content:planDraftContentSchema,
  changeReason:z.string().trim().min(1).max(2_000),
}).strict();
export type PlanSaveRevisionInput = z.infer<typeof planSaveRevisionSchema>;

export const planSubmitSchema = z.object({
  requestKey:planRequestKeySchema,
  expectedAggregateVersion:planVersionSchema,
  revisionId:planIdSchema,
  contentDigest:planDigestSchema,
}).strict();
export type PlanSubmitInput = z.infer<typeof planSubmitSchema>;

export const planReviewPreviewSchema = planSubmitSchema;
export const planDecisionSchema = z.discriminatedUnion("action",[
  z.object({requestKey:planRequestKeySchema,action:z.literal("accept"),
    revisionId:planIdSchema,contentDigest:planDigestSchema,
    expectedAggregateVersion:planVersionSchema,reviewPreviewId:planIdSchema,
    rationale:z.string().trim().min(1).max(2_000),
    deliverySuitabilityConfirmed:z.boolean().optional(),
    engagementId:planIdSchema.optional(),
  }).strict(),
  z.object({requestKey:planRequestKeySchema,
    action:z.enum(["request_changes","reject"]),
    revisionId:planIdSchema,contentDigest:planDigestSchema,
    expectedAggregateVersion:planVersionSchema,reviewPreviewId:planIdSchema,
    rationale:z.string().trim().min(1).max(2_000),
  }).strict(),
]);
export type PlanDecisionInput = z.infer<typeof planDecisionSchema>;

export const planDraftStartSchema = z.object({
  requestKey:planRequestKeySchema,planId:planIdSchema,
  baseRevisionId:planIdSchema,expectedAggregateVersion:planVersionSchema,
  instructions:z.string().trim().min(1).max(8_000),
}).strict();
export type PlanDraftStartInput = z.infer<typeof planDraftStartSchema>;

export const planRevisionEnvelopeSchema = z.object({
  id:planIdSchema,
  revisionNumber:planVersionSchema,
  aggregateVersion:planVersionSchema,
  contentDigest:planDigestSchema,
  asOf:z.iso.datetime({offset:true}).refine((value) => Date.parse(value) <= Date.now(),
    "asOf cannot be future"),
}).strict();

export const planPageQuerySchema = z.object({
  cursor:z.string().max(500).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).optional(),
  limit:z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const planLimits = {
  pageSize:50,defaultPageSize:20,writesPerMinute:30,draftsPerHour:5,
  concurrentDraftsPerPlan:1,previewLifetimeMs:600_000,
  draftDeadlineMs:120_000,modelSteps:6,outputTokensPerStep:4_096,
  retrievalCalls:4,evidenceContextBytes:24_576,sourceDependencies:40,
} as const;

export const planReviewTransitions = {
  draft:["in_review","changes_requested"],
  in_review:["accepted","changes_requested","rejected"],
  changes_requested:[],rejected:[],accepted:["superseded"],superseded:[],
} as const;
export function canPlanReviewTransition(from:z.infer<typeof planReviewStateSchema>,
  to:z.infer<typeof planReviewStateSchema>):boolean {
  return (planReviewTransitions[from] as readonly string[]).includes(to);
}

export const planDraftingTransitions = {
  prepared:["running","cancelled","expired"],
  running:["saved","failed","cancelled","expired","unconfirmed"],
  saved:[],failed:[],cancelled:[],expired:[],unconfirmed:[],
} as const;
export function canPlanDraftingTransition(from:z.infer<typeof planDraftingStateSchema>,
  to:z.infer<typeof planDraftingStateSchema>):boolean {
  return (planDraftingTransitions[from] as readonly string[]).includes(to);
}

function normalizeCanonical(value:unknown):unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g,"\n").normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([left],[right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key,entry]) => [key,normalizeCanonical(entry)]));
  return value;
}

export function canonicalPlanJson(value:unknown):string {
  return JSON.stringify(normalizeCanonical(value));
}
export function planSha256(value:unknown):string {
  return createHash("sha256").update(canonicalPlanJson(value)).digest("hex");
}
