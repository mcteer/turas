import { z } from "zod";
import { staffingIdSchema, staffingDateSchema, staffingDigestSchema, staffingTimezoneSchema,
  staffingRegionSchema, staffingCommandEnvelopeSchema, staffingExactCommandSchema } from "./staffing";
import { staffingLocalWindowSchema } from "./staffing-calendar";
const qualificationSkill = z.object({ skillId: staffingIdSchema, minimumLevel: z.number().int().min(1).max(4) }).strict();
export const staffingDemandInputSchema = z.object({ customerId: staffingIdSchema, workloadId: staffingIdSchema.nullable(),
  engagementId: staffingIdSchema, planId: staffingIdSchema, baselineId: staffingIdSchema,
  planRevisionId: staffingIdSchema, baselineDigest: staffingDigestSchema,
  workPackageKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), title: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(100), fromDate: staffingDateSchema, toDate: staffingDateSchema,
  requiredSkills: z.array(qualificationSkill).min(1).max(20), desiredSkills: z.array(qualificationSkill).max(20),
  days: z.array(z.object({ date: staffingDateSchema, requiredMinutes: z.number().int().min(1).max(960) }).strict()).min(1).max(91),
  allowedRegions: z.array(staffingRegionSchema).max(20), billable: z.boolean(),
  overlap: z.object({ timezone: staffingTimezoneSchema, minimumOverlapMinutes: z.number().int().min(1).max(960),
    windows: z.array(staffingLocalWindowSchema).min(1).max(91) }).strict().nullable(),
}).strict().superRefine((demand, context) => {
  const span = (Date.parse(`${demand.toDate}T00:00:00Z`) - Date.parse(`${demand.fromDate}T00:00:00Z`)) / 86_400_000;
  const skills = [...demand.requiredSkills, ...demand.desiredSkills].map(skill => skill.skillId), dates = demand.days.map(day => day.date);
  if (span < 0 || span > 90 || new Set(skills).size !== skills.length || new Set(dates).size !== dates.length ||
      new Set(demand.allowedRegions).size !== demand.allowedRegions.length ||
      demand.days.some(day => day.date < demand.fromDate || day.date > demand.toDate) ||
      demand.days.reduce((sum, day) => sum + day.requiredMinutes, 0) > 87_360) {
    context.addIssue({ code: "custom", message: "Invalid demand skills, service dates or limits" });
  }
  if (demand.overlap) {
    const windowDates = demand.overlap.windows.map(window => window.date);
    if (new Set(windowDates).size !== windowDates.length || windowDates.length !== dates.length || windowDates.some(date => !dates.includes(date))) {
      context.addIssue({ code: "custom", path: ["overlap"], message: "One zoned overlap window required per service date" });
    }
  }
});
export const staffingCreateDemandSchema = z.object({ ...staffingCommandEnvelopeSchema.shape, demand: staffingDemandInputSchema }).strict();
export const staffingReviseDemandSchema = z.object({ ...staffingExactCommandSchema.shape, demand: staffingDemandInputSchema }).strict();
export const staffingQualifyDemandSchema = staffingExactCommandSchema;
export const staffingCancelDemandSchema = staffingExactCommandSchema;
export type StaffingDemandInput = z.infer<typeof staffingDemandInputSchema>;
export const staffingDemandListSchema = z.object({ customerId: staffingIdSchema,
  engagementId: staffingIdSchema.optional(), pageSize: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional() }).strict();
