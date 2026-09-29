import { z } from "zod";
import {
  governedIdSchema, idempotencyKeySchema, positiveRevisionSchema,
  sha256Schema, evidenceQualitySchema, utcTimestampSchema, writeEnvelopeFields,
} from "./retrieval";

export const knowledgeContractVersion = "knowledge-v1" as const;
const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().min(1).max(2_000);

export const sanitizedKnowledgeSchema = z.object({
  title: shortText,
  productVersion: shortText,
  problem: longText,
  prerequisites: longText,
  solution: longText,
  reasoning: longText,
  applicability: longText,
  limitations: longText,
  validation: longText,
}).strict().refine((payload) => new TextEncoder().encode(JSON.stringify(payload)).length <= 20_480,
  "Sanitized revision exceeds 20 KiB");

export const knowledgeLineageSchema = z.object({
  sourceKind: z.enum(["accepted_profile", "verified_research"]),
  sourceRevisionId: governedIdSchema,
  sourceGeneration: positiveRevisionSchema,
  sourceDigest: sha256Schema,
  rightsBasis: longText,
}).strict();

export const knowledgeCandidateSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  customerId: governedIdSchema,
  payload: sanitizedKnowledgeSchema,
  lineage: z.array(knowledgeLineageSchema).min(1).max(20),
}).strict();

export const knowledgeRevisionSchema = z.object({
  ...writeEnvelopeFields,
  payload: sanitizedKnowledgeSchema,
  lineage: z.array(knowledgeLineageSchema).min(1).max(20),
}).strict();

const reviewChecklist = z.object({
  namesAndDomainsRemoved: z.literal(true),
  repositoriesAndLinksRemoved: z.literal(true),
  peopleAndCommercialDetailsRemoved: z.literal(true),
  identifyingConfigurationAndOutcomesRemoved: z.literal(true),
  countsAndCombinedInferenceReviewed: z.literal(true),
}).strict();

const decisionBase = { ...writeEnvelopeFields,
  expectedPublicationGeneration: positiveRevisionSchema.optional(),
  sanitizationRationale: longText };
export const knowledgeDecisionSchema = z.discriminatedUnion("action", [
  z.object({ ...decisionBase,action: z.literal("publish"),
    rightsAttested: z.literal(true),checklist: reviewChecklist }).strict(),
  z.object({ ...decisionBase,action: z.literal("reject"),
    rightsAttested: z.literal(false).optional() }).strict(),
]);

export const knowledgeWithdrawSchema = z.object({
  ...writeEnvelopeFields,
  expectedPublicationGeneration: positiveRevisionSchema,
  rationale: longText,
}).strict();

export const knowledgeListQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(20).default(20),
}).strict();

export const publishedKnowledgeSchema = z.object({
  version: z.literal(knowledgeContractVersion),
  id: governedIdSchema,
  revision: positiveRevisionSchema,
  payload: sanitizedKnowledgeSchema,
  quality: evidenceQualitySchema,
  publishedAt: utcTimestampSchema,
  caveats: z.array(z.string().max(200)).max(3),
}).strict();
export type PublishedKnowledge = z.infer<typeof publishedKnowledgeSchema>;

export const knowledgeStates = {
  contribution: ["draft", "submitted", "rejected", "closed"],
  publication: ["unpublished", "published", "suspended", "superseded", "withdrawn"],
} as const;
