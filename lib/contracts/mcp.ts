import { z } from "zod";
import { profilePayloadSchema } from "./profile-payloads";
import { profileQualityDtoSchema } from "./profiles";
import { sanitizedKnowledgeSchema } from "./knowledge";
import { citationLocatorSchema, retrievalSourceKindSchema } from "./retrieval";
import { planDraftContentSchema } from "./plan-content";
import { reportDocumentSchema } from "../reports/document";

export const mcpContractVersion = "turas-mcp-v1" as const;
export const mcpProtocolVersion = "2026-07-28" as const;
export const mcpLimits = Object.freeze({requestBytes:16_384,responseBytes:131_072,pageSize:20,handleCharacters:256,
  connectionPerMinute:30,memberPerMinute:60,workspacePerMinute:240,
  connectionConcurrent:2,memberConcurrent:4,workspaceConcurrent:16,
  deadlineMs:10_000,statementMs:5_000,lockMs:2_000,handleLifetimeMs:900_000});
export const mcpIdSchema = z.uuid();
export const mcpDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const mcpGenerationSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const mcpTimestampSchema = z.iso.datetime({offset:false}).refine(value => value.endsWith("Z"));
export const mcpCategorySchema = z.enum(["profiles","evidence","knowledge","plans","reports"]);
export type McpCategory = z.infer<typeof mcpCategorySchema>;
const handle = z.string().min(1).max(mcpLimits.handleCharacters);
const page = {limit:z.number().int().min(1).max(20),cursor:handle.optional()};
const customer = {customerId:mcpIdSchema};
const expected = {expectedRevisionId:mcpIdSchema.optional()};
export const mcpToolInputs = Object.freeze({
  turas_identity_v1:z.strictObject({}),
  turas_customers_list_v1:z.strictObject(page),
  turas_profile_read_v1:z.strictObject({...customer,section:z.enum(["summary","workloads","facts"]),limit:page.limit.optional(),cursor:page.cursor}),
  turas_evidence_list_v1:z.strictObject({...customer,...page,workloadId:mcpIdSchema.optional()}),
  turas_evidence_read_v1:z.strictObject({...customer,revisionId:mcpIdSchema,passageId:mcpIdSchema}),
  turas_citation_resolve_v1:z.strictObject({citationHandle:handle}),
  turas_knowledge_list_v1:z.strictObject(page),
  turas_knowledge_read_v1:z.strictObject({publicationId:mcpIdSchema,...expected}),
  turas_plans_list_v1:z.strictObject({...customer,...page}),
  turas_plan_read_v1:z.strictObject({...customer,planId:mcpIdSchema,...expected}),
  turas_reports_list_v1:z.strictObject({...customer,...page}),
  turas_report_read_v1:z.strictObject({...customer,reportId:mcpIdSchema,...expected}),
});
export const mcpToolNames = Object.freeze(Object.keys(mcpToolInputs) as (keyof typeof mcpToolInputs)[]);
export type McpToolName = keyof typeof mcpToolInputs;
export const mcpUnavailableReasonSchema = z.enum(["not_found","source_changed","incomplete","oversized","expired","unavailable"]);
const categories = z.array(mcpCategorySchema).min(1).max(5).refine(values => new Set(values).size===values.length,"Distinct categories required");
const customerIds = z.array(mcpIdSchema).max(100).refine(values => new Set(values).size===values.length,"Distinct customers required");
export const mcpCreateConnectionSchema = z.strictObject({requestKey:mcpIdSchema,name:z.string().trim().min(1).max(80),
  categories,customerIds,lifetimeDays:z.number().int().min(1).max(30).default(7),
}).refine(value => value.categories.every(category => category==="knowledge") || value.customerIds.length>0,"Customer categories require selected customers");
export type McpCreateConnection = z.infer<typeof mcpCreateConnectionSchema>;
export const mcpRevokeConnectionSchema = z.strictObject({requestKey:mcpIdSchema,expectedConnectionId:mcpIdSchema});
export const mcpManagementPageSchema = z.strictObject(page);
export const mcpConnectionMetadataSchema = z.strictObject({id:mcpIdSchema,name:z.string().min(1).max(80),categories,
  createdAt:mcpTimestampSchema,expiresAt:mcpTimestampSchema,revokedAt:mcpTimestampSchema.nullable(),
  lastUsedAt:mcpTimestampSchema.nullable(),state:z.enum(["active","expired","revoked"])});
export const mcpBearerSchema=z.string().regex(/^tmcp\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);
export const mcpCreateReplySchema=z.discriminatedUnion('secretAvailable',[
  z.strictObject({connection:mcpConnectionMetadataSchema,secretAvailable:z.literal(true),credential:mcpBearerSchema}),
  z.strictObject({connection:mcpConnectionMetadataSchema,secretAvailable:z.literal(false)}),
]);
export const mcpUsageSchema=z.strictObject({requestId:mcpIdSchema,operation:z.enum(['identity','customers','profiles','evidence','knowledge','plans','reports','discovery','denied']),
  result:z.enum(['available','empty','unavailable','invalid_input','forbidden','limited','failed']),
  createdAt:mcpTimestampSchema,durationMs:z.number().int().min(0).max(10000)});
export const mcpOperationalStateSchema=z.enum(['disabled','unavailable','ready']);
export const mcpManagementErrorSchema=z.strictObject({code:z.enum(['authentication_required','forbidden','invalid_input','conflict','limited','unavailable']),
  correlationId:mcpIdSchema});
export const mcpIdentitySchema = z.strictObject({kind:z.enum(["internal","partner"]),workspaceId:mcpIdSchema,
  categories,expiresAt:mcpTimestampSchema});
export const mcpCustomerReferenceSchema = z.strictObject({customerId:mcpIdSchema,displayName:z.string().min(1).max(200)});
const quality = z.strictObject({...profileQualityDtoSchema.shape,asOf:mcpTimestampSchema,validUntil:mcpTimestampSchema});

// Enumerate existing variants while omitting private lineage and UI capabilities.
const privateProfileKeys = ["sourceMessageId","sourceSpanDigest","sourceUrl","sourceExcerpt","ownerReferenceId","recordReferenceId","referenceId"] as const;
const profileVariants = profilePayloadSchema.options.map(variant => {
  const shape = {...variant.shape};
  for(const key of privateProfileKeys)delete (shape as Record<string,unknown>)[key];
  for(const key of ['observedAt','observationStart','observationEnd','reviewAt','startsAt','endsAt','effectiveAt','dueAt','completedAt']){
    const field=(shape as Record<string,z.ZodType>)[key];
    if(field)(shape as Record<string,z.ZodType>)[key]=field.refine(value=>value===undefined||mcpTimestampSchema.safeParse(value).success,'UTC timestamp required');
  }
  return z.strictObject(shape);
});
export const mcpProfilePayloadSchema = z.discriminatedUnion("kind",[profileVariants[0],...profileVariants.slice(1)]);
export const mcpProfileFactSchema = z.strictObject({id:mcpIdSchema,recordId:mcpIdSchema,workloadId:mcpIdSchema.nullable(),
  reviewState:z.literal("accepted"),payload:mcpProfilePayloadSchema,quality,
  createdAt:mcpTimestampSchema,supportStatus:z.enum(["settled","restricted_source"]),sourceAttestation:z.string().max(2000).optional()});
const revision = {revisionId:mcpIdSchema,generation:mcpGenerationSchema,digest:mcpDigestSchema};
export const mcpEvidenceSchema = z.strictObject({...revision,passageId:mcpIdSchema,sourceKind:retrievalSourceKindSchema,
  title:z.string().min(1).max(200),text:z.string().min(1).max(2000),
  locators:z.array(citationLocatorSchema).min(1).max(50),quality,
  publicationAt:mcpTimestampSchema.nullable(),observationAt:mcpTimestampSchema.nullable(),retrievedAt:mcpTimestampSchema.nullable(),
  acceptance:z.literal("accepted"),conflict:z.literal("none"),citationHandle:handle,
  caveats:z.array(z.string().max(500)).max(10)});
export const mcpKnowledgeSchema = z.strictObject({...revision,publicationId:mcpIdSchema,payload:sanitizedKnowledgeSchema,
  quality,publishedAt:mcpTimestampSchema,citationHandle:handle,caveats:z.array(z.string().max(500)).max(10)});
const planShape = planDraftContentSchema.shape;
const planAssertion = planShape.assertions.element;
const {effort: omittedMilestoneEffort,...milestoneFields}=planShape.milestones.element.shape;
export const mcpPlanContentSchema = z.strictObject({title:planShape.title,asOf:mcpTimestampSchema,
  startDate:planShape.startDate,startDateUnknownReason:planShape.startDateUnknownReason,
  targetDate:planShape.targetDate,targetDateUnknownReason:planShape.targetDateUnknownReason,
  sections:z.array(planShape.sections.element).max(10).refine(items => items.every(item => item.key!=="staffing")),
  assertions:z.array(z.strictObject({...planAssertion.shape,sourceDependencyIds:z.array(mcpIdSchema).length(0)})).max(100),
  diagrams:planShape.diagrams,
  designDecisions:z.array(planShape.designDecisions.element.omit({links:true})).max(20),
  workPackages:z.array(planShape.workPackages.element.omit({effort:true})).max(50),
  milestones:z.array(z.strictObject(milestoneFields)).max(50),
});
export const mcpPlanSchema = z.strictObject({...revision,planId:mcpIdSchema,customerId:mcpIdSchema,
  audience:z.enum(["internal","delivery"]),state:z.literal("accepted"),content:mcpPlanContentSchema,
  dependencyState:z.literal("current")});
const reportShape=reportDocumentSchema.shape;
export const mcpReportContentSchema = z.strictObject({schemaVersion:reportShape.schemaVersion,projectionVersion:reportShape.projectionVersion,
  formulaVersion:reportShape.formulaVersion,templateVersion:reportShape.templateVersion,kind:reportShape.kind,title:reportShape.title,
  audience:reportShape.audience,classification:reportShape.classification,timezone:z.string().max(100),period:reportShape.period,
  asOf:mcpTimestampSchema,partial:reportShape.partial,
  sections:reportShape.sections.refine(items => items.every(item => item.heading!=="Effort and Capacity")),
  citations:reportShape.citations,gaps:reportShape.gaps,annotations:reportShape.annotations,correctionOf:mcpIdSchema.nullable()});
export const mcpReportSchema = z.strictObject({...revision,reportId:mcpIdSchema,publicationId:mcpIdSchema,customerId:mcpIdSchema,
  state:z.literal("published"),dependencyState:z.literal("current"),document:mcpReportContentSchema});
const envelope={contractVersion:z.literal(mcpContractVersion),requestId:mcpIdSchema,nextCursor:handle.nullable()};
export function mcpEnvelopeSchema<T extends z.ZodType>(data:T) {
  return z.discriminatedUnion("status",[
    z.strictObject({...envelope,status:z.literal("available"),data}),
    z.strictObject({...envelope,status:z.literal("empty"),data:z.strictObject({items:z.array(z.never()).length(0)}),nextCursor:z.null()}),
    z.strictObject({...envelope,status:z.literal("unavailable"),data:z.null(),nextCursor:z.null(),reason:mcpUnavailableReasonSchema}),
  ]);
}
export const mcpProfilePageSchema=z.strictObject({customerId:mcpIdSchema,section:z.enum(["summary","workloads","facts"]),
  generation:mcpGenerationSchema,items:z.array(mcpProfileFactSchema).max(20)});
const pageOf=<T extends z.ZodType>(schema:T)=>z.strictObject({items:z.array(schema).max(20)});
const planReference=z.strictObject({planId:mcpIdSchema,...revision,title:z.string().min(1).max(160),audience:z.enum(["internal","delivery"])});
const reportReference=z.strictObject({reportId:mcpIdSchema,publicationId:mcpIdSchema,...revision,title:z.string().min(1).max(200),
  audience:z.enum(["delivery","account_team","leadership"]),correctionOf:mcpIdSchema.nullable()});
export const mcpToolOutputs=Object.freeze({
  turas_identity_v1:mcpEnvelopeSchema(mcpIdentitySchema),
  turas_customers_list_v1:mcpEnvelopeSchema(pageOf(mcpCustomerReferenceSchema)),
  turas_profile_read_v1:mcpEnvelopeSchema(mcpProfilePageSchema),
  turas_evidence_list_v1:mcpEnvelopeSchema(pageOf(mcpEvidenceSchema.omit({text:true,locators:true}))),
  turas_evidence_read_v1:mcpEnvelopeSchema(mcpEvidenceSchema),
  turas_citation_resolve_v1:mcpEnvelopeSchema(z.union([mcpEvidenceSchema,mcpKnowledgeSchema])),
  turas_knowledge_list_v1:mcpEnvelopeSchema(pageOf(mcpKnowledgeSchema.omit({payload:true}))),
  turas_knowledge_read_v1:mcpEnvelopeSchema(mcpKnowledgeSchema),
  turas_plans_list_v1:mcpEnvelopeSchema(pageOf(planReference)),
  turas_plan_read_v1:mcpEnvelopeSchema(mcpPlanSchema),
  turas_reports_list_v1:mcpEnvelopeSchema(pageOf(reportReference)),
  turas_report_read_v1:mcpEnvelopeSchema(mcpReportSchema),
});

/** Validate the entire SDK response, after projection; never truncate a record. */
export function mcpResponseFits(value:unknown):boolean {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= mcpLimits.responseBytes;
}
