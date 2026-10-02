import { z } from "zod";
import { staffingDateSchema, staffingIdSchema, staffingExactCommandSchema, staffingCommandEnvelopeSchema, staffingDigestSchema, staffingVersionSchema, staffingTimestampSchema, staffingRationaleSchema, staffingListSchema } from "./staffing";
export const staffingCurrencySchema = z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "JPY"]);
function boundedUnsigned(max: bigint) {
  return z.string().regex(/^(0|[1-9][0-9]*)$/).max(max.toString().length)
    .refine(value => /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= max, "Amount exceeds limit");
}
export const staffingMoneySchema = boundedUnsigned(1_000_000_000_000n);
export const staffingHourlyRateSchema = boundedUnsigned(100_000_000n);
export const staffingRateReferenceSchema = z.object({ revisionId: staffingIdSchema,
  currency: staffingCurrencySchema, minorUnitsPerHour: staffingHourlyRateSchema }).strict();
export const staffingEconomicsCalculationSchema = z.object({ currency: staffingCurrencySchema,
  revenue: staffingMoneySchema.nullable(), nonlabor: staffingMoneySchema.nullable(),
  allocations: z.array(z.object({ resourceId: staffingIdSchema, localDate: staffingDateSchema,
    minutes: z.number().int().min(1).max(960), loadedCost: staffingRateReferenceSchema.nullable(),
    service: staffingRateReferenceSchema.nullable() }).strict()).max(100_000),
}).strict();
export const staffingEffectiveRateSchema = z.object({ resourceId: staffingIdSchema,
  kind: z.enum(["loaded_cost", "service"]), currency: staffingCurrencySchema,
  fromDate: staffingDateSchema, toDate: staffingDateSchema, minorUnitsPerHour: staffingHourlyRateSchema,
}).strict().refine(value => value.fromDate < value.toDate, "Rate interval must be nonempty");
export const staffingFinanceInputSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  provenance: z.string().trim().min(1).max(2000),
  input: z.discriminatedUnion("kind", [
    z.object({ ...staffingEffectiveRateSchema.shape,
      kind: z.literal("rate"), rateKind: z.enum(["loaded_cost", "service"]) }).strict()
      .refine(value => value.fromDate < value.toDate, "Rate interval must be nonempty"),
    z.object({ kind: z.enum(["contracted_revenue", "nonlabor"]), engagementId: staffingIdSchema,
      baselineId: staffingIdSchema, currency: staffingCurrencySchema, minorUnits: staffingMoneySchema,
      fromDate: staffingDateSchema, toDate: staffingDateSchema }).strict().refine(value => {
        const span = (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86_400_000;
        return span > 0 && span <= 91;
      }, "Entered period must cover one to 91 dates"),
  ]) }).strict();
export const staffingFinanceRevisionSchema = z.object({ ...staffingExactCommandSchema.shape,
  provenance: z.string().trim().min(1).max(2000),
  input: staffingFinanceInputSchema.shape.input }).strict();
export type StaffingCurrency = z.infer<typeof staffingCurrencySchema>;
export type StaffingEconomicsCalculation = z.infer<typeof staffingEconomicsCalculationSchema>;

export const staffingFinancePolicyApprovalSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  formulaVersion: z.literal("staffing-economics-v1"), inputPolicyDigest: staffingDigestSchema }).strict();
export const staffingScenarioInputSchema = z.object({ ...staffingCommandEnvelopeSchema.shape,
  customerId: staffingIdSchema, engagementId: staffingIdSchema, baselineId: staffingIdSchema,
  baselineDigest: staffingDigestSchema, currency: staffingCurrencySchema,
  fromDate: staffingDateSchema, toDate: staffingDateSchema,
}).strict().refine(value => {
  const span = (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86_400_000;
  return span >= 0 && span <= 90;
}, "Scenario covers one to 91 inclusive dates");
export type StaffingFinanceInput = z.infer<typeof staffingFinanceInputSchema>;
export type StaffingScenarioInput = z.infer<typeof staffingScenarioInputSchema>;
const { requestKey: _requestKey, rationale: _rationale, ...scenarioScopeShape } = staffingScenarioInputSchema.shape;
export const staffingScenarioScopeSchema = z.object(scenarioScopeShape).strict().refine(value => {
  const span = (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86_400_000;
  return span >= 0 && span <= 90;
}, "Invalid scenario period");
const derived = z.string().regex(/^-?(0|[1-9][0-9]*)$/).max(17).refine(value =>
  /^-?(0|[1-9][0-9]*)$/.test(value) && value !== "-0" && BigInt(value) >= -1_000_000_000_000_000n && BigInt(value) <= 1_000_000_000_000_000n);
const group = z.object({ resourceId: staffingIdSchema, localDate: staffingDateSchema, rateRevisionId: staffingIdSchema,
  minutes: z.string().regex(/^[1-9][0-9]*$/).max(8), minorUnitsPerHour: staffingHourlyRateSchema,
  numerator: z.string().regex(/^(0|[1-9][0-9]*)$/).max(16), divisor: z.literal("60"), amount: derived }).strict();
export const staffingScenarioDependencySchema = z.object({ kind: z.enum(["allocation", "rate", "revenue", "nonlabor", "calendar", "source", "demand"]),
  inputId: staffingIdSchema, revisionId: staffingIdSchema, generation: staffingVersionSchema, contentDigest: staffingDigestSchema }).strict();
export const staffingScenarioContentSchema = z.object({ scope: staffingScenarioScopeSchema, asOf: staffingTimestampSchema,
  formulaVersion: z.literal("staffing-economics-v1"), currency: staffingCurrencySchema, exponent: z.union([z.literal(0), z.literal(2)]),
  status: z.enum(["complete", "incomplete"]), reasons: z.array(z.enum(["missing_revenue", "missing_nonlabor", "missing_loaded_cost", "mixed_currency"])).max(4),
  contractedRevenue: staffingMoneySchema.nullable(), nonlaborCost: staffingMoneySchema.nullable(), deliveryCost: derived.nullable(), contribution: derived.nullable(),
  marginPercentage: z.string().regex(/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/).max(24).nullable(), hypotheticalServiceRevenue: derived.nullable(),
  costGroups: z.array(group).max(100_000), serviceGroups: z.array(group).max(100_000),
  coverage: z.object({ confirmedRows: z.number().int().min(0).max(100_000), confirmedMinutes: z.number().int().min(0).max(96_000_000), resourceCount: z.number().int().min(0).max(500) }).strict(),
  selectedInputRevisionIds: z.array(staffingIdSchema).max(20_002), inputRevisions: z.array(staffingScenarioDependencySchema).max(100_000),
  policyApproval: z.enum(["approved", "unvalidated"]), policyDecisionId: staffingIdSchema.nullable(), inputPolicyDigest: staffingDigestSchema,
  planningOnly: z.literal(true), rationale: staffingRationaleSchema,
}).strict().refine(value => value.currency === value.scope.currency && value.exponent === (value.currency === "JPY" ? 0 : 2) &&
  (value.policyApproval === "approved") === (value.policyDecisionId !== null), "Invalid scenario calculation identity");
export const staffingFinanceListSchema = z.object({ resourceId: staffingIdSchema.optional(), engagementId: staffingIdSchema.optional(),
  baselineId: staffingIdSchema.optional(), pageSize: z.number().int().min(1).max(50).default(20), cursor: z.string().min(1).max(2048).optional(),
}).strict().refine(value => !(value.resourceId && value.engagementId) && (!value.baselineId || !!value.engagementId), "Invalid finance list scope");
export const staffingScenarioListSchema = z.object({ customerId: staffingIdSchema, engagementId: staffingIdSchema.optional(),
  ...staffingListSchema.shape }).strict();
