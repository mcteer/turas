import { z } from "zod";

export const servicesPlanSchema = z.object({
  headcount: z.number().int().min(1).max(100),
  deliveryWeeks: z.number().min(1).max(52),
  weeklyHours: z.number().min(1).max(60),
  billablePercent: z.number().min(0).max(100),
  protectedPercent: z.number().min(0).max(100),
  realizedHourlyRate: z.number().min(0).max(10000),
  annualCostPerPerson: z.number().min(0).max(2000000),
  annualOverhead: z.number().min(0).max(10000000),
  annualNonLaborCost: z.number().min(0).max(10000000),
  targetMarginPercent: z.number().min(0).max(95),
});
export type ServicesPlan = z.infer<typeof servicesPlanSchema>;

// Proposed annual assumptions, independent of the fixed-date engagement portfolio.
export const DEFAULT_SERVICES_PLAN: ServicesPlan = {
  headcount: 3, deliveryWeeks: 46, weeklyHours: 40, billablePercent: 65,
  protectedPercent: 25, realizedHourlyRate: 250, annualCostPerPerson: 230000,
  annualOverhead: 90000, annualNonLaborCost: 30000, targetMarginPercent: 20,
};

export const servicesPlanOutputSchema = z.object({
  synthetic: z.literal(true),
  metricVersion: z.literal("services-plan-1"),
  availableHours: z.number(), billableHours: z.number(), payroll: z.number(),
  totalCost: z.number(), revenue: z.number(), operatingContribution: z.number(),
  operatingMarginPercent: z.number().nullable(), breakEvenUtilizationPercent: z.number().nullable(),
  targetRate: z.number().nullable(), maximumBillablePercent: z.number(),
  capacityFeasible: z.boolean(), breakEvenFeasible: z.boolean(),
});

const round = (value: number) => Math.round(value * 100) / 100;

export function calculateServicesPlan(input: ServicesPlan) {
  const plan = servicesPlanSchema.parse(input);
  const availableHours = plan.headcount * plan.deliveryWeeks * plan.weeklyHours;
  const billableHours = availableHours * plan.billablePercent / 100;
  const payroll = plan.headcount * plan.annualCostPerPerson;
  const totalCost = payroll + plan.annualOverhead + plan.annualNonLaborCost;
  const revenue = billableHours * plan.realizedHourlyRate;
  const maximumBillablePercent = 100 - plan.protectedPercent;
  const breakEvenUtilization = plan.realizedHourlyRate > 0
    ? totalCost / (availableHours * plan.realizedHourlyRate) * 100 : null;
  return servicesPlanOutputSchema.parse({
    synthetic: true, metricVersion: "services-plan-1",
    availableHours: round(availableHours), billableHours: round(billableHours),
    payroll: round(payroll), totalCost: round(totalCost), revenue: round(revenue),
    operatingContribution: round(revenue - totalCost),
    operatingMarginPercent: revenue > 0 ? round((revenue - totalCost) / revenue * 100) : null,
    breakEvenUtilizationPercent: breakEvenUtilization === null ? null : round(breakEvenUtilization),
    targetRate: billableHours > 0 ? round(totalCost / (billableHours * (1 - plan.targetMarginPercent / 100))) : null,
    maximumBillablePercent,
    capacityFeasible: plan.billablePercent <= maximumBillablePercent,
    breakEvenFeasible: breakEvenUtilization !== null && breakEvenUtilization <= maximumBillablePercent,
  });
}
