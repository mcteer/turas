import { z } from "zod";
import {
  governedIdSchema, idempotencyKeySchema, positiveRevisionSchema,
  sha256Schema, utcTimestampSchema,
} from "./retrieval";

export const researchContractVersion = "research-v1" as const;
const publicField = z.string().trim().min(1).max(200);
const publicUrl = z.url().max(2_048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    (!url.port || url.port === "443");
}, "Public HTTPS/443 URL required");

const commonRequest = {
  idempotencyKey: idempotencyKeySchema,
  customerId: governedIdSchema,
  conversationId: governedIdSchema,
  submittedUrls: z.array(publicUrl).max(8).default([]),
};
export const researchPreviewInputSchema = z.discriminatedUnion("mode", [
  z.object({ ...commonRequest, mode: z.literal("recon"),
    publicName: publicField, publicDomain: publicField, identityConfirmed: z.literal(true),
    refreshSourceRevisionId: governedIdSchema.optional() }).strict(),
  z.object({ ...commonRequest, mode: z.literal("practices"),
    product: publicField, version: publicField, topic: publicField,
    refreshSourceRevisionId: governedIdSchema.optional() }).strict(),
  z.object({ ...commonRequest, mode: z.literal("fit"),
    evidenceReceiptIds: z.array(governedIdSchema).min(1).max(10), submittedUrls: z.tuple([]) }).strict(),
]);
export type ResearchPreviewInput = z.infer<typeof researchPreviewInputSchema>;
export const researchRevisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  expectedRevision: positiveRevisionSchema,
  expectedDigest: sha256Schema,
  input: researchPreviewInputSchema,
}).strict();

export const admittedResearchScopeSchema = z.object({
  mode: z.enum(["recon", "practices", "fit"]),
  digest: sha256Schema,
  actorMembershipId: governedIdSchema,
  sessionId: governedIdSchema,
  customerId: governedIdSchema,
  conversationId: governedIdSchema,
  queries: z.array(z.string().trim().min(1).max(500)).max(4),
  deadline: utcTimestampSchema,
}).strict();

export const researchStartSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  expectedRevision: positiveRevisionSchema,
  expectedDigest: sha256Schema,
}).strict();
export const researchCancelSchema = z.object({ idempotencyKey: idempotencyKeySchema }).strict();
export const researchRequestStateSchema = z.enum(["draft", "admitted", "consumed", "expired", "cancelled"]);
export const researchRunStateSchema = z.enum(["queued", "running", "completed", "partial", "failed", "cancelled", "unconfirmed"]);
export const researchOperationStateSchema = z.enum(["reserved", "dispatched", "succeeded", "failed", "unconfirmed"]);
export const researchOriginSchema = z.enum(["independent_discovery", "user_submission"]);

export const researchRunReceiptSchema = z.object({
  version: z.literal(researchContractVersion),
  id: governedIdSchema,
  requestId: governedIdSchema,
  state: researchRunStateSchema,
  mode: z.enum(["recon", "practices", "fit"]),
  startedAt: utcTimestampSchema.nullable(),
  deadline: utcTimestampSchema,
  safeReasonCode: z.string().max(100).nullable(),
  searchesUsed: z.number().int().min(0).max(4),
  fetchesUsed: z.number().int().min(0).max(8),
  retainedCitationIds: z.array(governedIdSchema).max(8),
}).strict();

export const researchLimits = {
  runMs: 120_000,
  admissionLifetimeMs: 300_000,
  activePerPrincipal: 1,
  activePerWorkspace: 2,
  hourlyPerPrincipal: 10,
  hourlyPerWorkspace: 30,
  searches: 4,
  resultsPerSearch: 5,
  searchTimeoutMs: 15_000,
  fetchAttempts: 8,
  concurrentFetches: 2,
  fetchTimeoutMs: 10_000,
  redirectsPerFetch: 3,
  bytesPerDocument: 2 * 1024 * 1024,
  bytesPerRun: 8 * 1024 * 1024,
  normalizedCharacters: 100_000,
  retainedPassages: 8,
  retainedPassageCharacters: 2_000,
  resultBytes: 24_576,
} as const;
