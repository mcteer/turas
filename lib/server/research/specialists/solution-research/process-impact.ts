import { z } from "zod";

export const impactInputNames = ["monthlyVolume", "baselineMinutes", "proposedMinutes", "adoptionFraction", "loadedHourlyCost", "implementationCost", "recurringMonthlyCost", "cashAvoidedMonthly"] as const;
export const processImpactSchema = z.object({
  process: z.string().min(1).max(200),
  currentWorkflow: z.string().min(1).max(700),
  proposedChange: z.string().min(1).max(700),
  affectedRoles: z.string().min(1).max(300),
  timeBasis: z.enum(["active_work", "elapsed_cycle", "unknown"]),
  inputs: z.array(z.object({
    name: z.enum(impactInputNames), value: z.number().finite().min(0).max(1e12).nullable(),
    basis: z.enum(["customer_observed", "public_benchmark", "assumption", "unknown"]),
    explanation: z.string().min(1).max(500),
    customerEvidenceIds: z.array(z.string().max(200)).max(6),
    sourceIds: z.array(z.string().max(80)).max(6),
  }).strict()).max(8),
  realization: z.string().min(1).max(700),
  costsAndRisks: z.string().min(1).max(700),
  validationPlan: z.string().min(1).max(700),
}).strict().superRefine((impact,ctx)=>{
  if(new Set(impact.inputs.map(i=>i.name)).size!==impact.inputs.length)ctx.addIssue({code:"custom",message:"Impact input names must be unique."});
  for(const input of impact.inputs){
    if(input.name==="adoptionFraction"&&input.value!==null&&input.value>1)ctx.addIssue({code:"custom",message:"Adoption fraction must be in [0,1]."});
    if(input.basis==="unknown"&&input.value!==null)ctx.addIssue({code:"custom",message:"Unknown inputs cannot carry a numeric value."});
  }
});
export type ProcessImpact = z.infer<typeof processImpactSchema>;
export const processImpactEstimateSchema = z.object({
  process:z.string(), estimatedMonthlyHoursReleased:z.number().finite().nullable(),
  estimatedMonthlyCapacityValue:z.number().finite().nullable(), estimatedMonthlyNetCashSavings:z.number().finite().nullable(),
  cashPaybackMonths:z.number().finite().nullable(),formula:z.string(),caveat:z.string(),
  missingInputs:z.array(z.enum(impactInputNames)),
  assumptions:z.array(z.object({name:z.enum(impactInputNames),basis:z.enum(["public_benchmark","assumption","customer_observed","unknown"]),explanation:z.string()})),
}).strict();
export function calculateProcessImpact(impact: ProcessImpact) {
  const input=(name:typeof impactInputNames[number])=>impact.inputs.find(i=>i.name===name)?.value??null;
  const volume=input("monthlyVolume"),before=input("baselineMinutes"),after=input("proposedMinutes"),adoption=input("adoptionFraction");
  const hourly=input("loadedHourlyCost"),recurring=input("recurringMonthlyCost"),setup=input("implementationCost"),avoided=input("cashAvoidedMonthly");
  const ready=volume!==null&&before!==null&&after!==null&&adoption!==null;
  const hours=ready&&impact.timeBasis==="active_work"?volume*(before-after)*adoption/60:null;
  const capacityValue=hours!==null&&hourly!==null?hours*hourly:null;
  const netCash=avoided!==null&&recurring!==null?avoided-recurring:null;
  return {process:impact.process,
    estimatedMonthlyHoursReleased:hours,
    estimatedMonthlyCapacityValue:capacityValue,
    estimatedMonthlyNetCashSavings:netCash,
    cashPaybackMonths:netCash!==null&&netCash>0&&setup!==null?setup/netCash:null,
    formula:"Active hours = monthly volume × (baseline active minutes − proposed active minutes) × adoption fraction ÷ 60. Capacity value = hours × loaded hourly cost. Net cash = explicit avoided cash costs − recurring costs. Payback = implementation cost ÷ positive net cash.",
    caveat:"Scenario estimate, not observed or causally proven ROI. Capacity value is not cash savings. Elapsed cycle time is not labor time. Cash avoided must be separately evidenced or explicitly assumed; never derive it from released hours.",
    missingInputs:impactInputNames.filter(name=>input(name)===null),
    assumptions:impact.inputs.filter(i=>i.basis==="assumption"||i.basis==="public_benchmark").map(i=>({name:i.name,basis:i.basis,explanation:i.explanation})),
  };
}
