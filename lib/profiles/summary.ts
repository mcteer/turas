import { productsFromResearch } from "./research-products";
import { profilePayloadSchema } from "../contracts/profile-payloads";

export type SummaryFact = { kind: string; workloadId: string | null; payload: unknown; supportStatus?: string };
export type SummaryResearch = { sourceRevisionId: string; supportedClaim: string; location: string; title: string; productNames?: string[] };
const stages = ["Explore", "Activate", "Accelerate", "Optimize", "Scale", "Transform"];

/** Presentation projection of already-authorized facts. Never turns product
 * purchases, public research or engagement progress into a maturity assessment. */
export function profileSummary(facts: readonly SummaryFact[], workloadId: string | null, asOf = new Date()) {
  const eligible = facts.filter(fact => !fact.supportStatus || ["settled", "restricted_source"].includes(fact.supportStatus))
    .flatMap(fact => { const parsed = profilePayloadSchema.safeParse(fact.payload); return parsed.success ? [{ ...fact, payload: parsed.data }] : []; });
  const scoped = eligible.filter(fact => fact.workloadId === workloadId);
  const maturity = scoped.find(fact => fact.payload.kind === "maturity_assessment")?.payload;
  const assessment = maturity?.kind === "maturity_assessment" ? maturity : null;
  const risks = eligible.flatMap(fact => fact.payload.kind === "risk" && fact.payload.status !== "resolved" ? [fact.payload] : []);
  const levels = ["low", "medium", "high", "critical"];
  risks.sort((a, b) => levels.indexOf(b.severity) - levels.indexOf(a.severity));
  const products = eligible.flatMap(fact => fact.payload.kind === "product_use" && fact.payload.state === "actual" ? [fact.payload] : []);
  const identity = eligible.find(fact => fact.workloadId === null && fact.payload.kind === "customer_details")?.payload;
  return {
    description: identity?.kind === "customer_details" ? identity.businessDescription : null,
    maturity: assessment ? { stage: assessment.journeyStage ?? "Unknown", stageNumber: assessment.journeyStage ? stages.indexOf(assessment.journeyStage) + 1 : null,
      dimensions: assessment.dimensions, reviewDue: Date.parse(assessment.reviewAt) <= asOf.getTime(), observedAt: assessment.observationEnd } : null,
    risk: risks.length ? { level: risks[0].severity, count: risks.length, reviewDue: risks.some(risk => risk.reviewAt && Date.parse(risk.reviewAt) <= asOf.getTime()) } : null,
    products: [...new Map(products.map(product => [product.productKey, { key: product.productKey, name: product.displayName }])).values()],
  };
}

// Keep the legacy product vocabulary and exact source references. The server
// projects names from eligible retained quotations; summaries are a fallback
// for older consumers that do not yet supply the quotation projection.
export function researchProductMentions(research: readonly SummaryResearch[]) {
  const names = [...new Set(research.flatMap(source => source.productNames ??
    productsFromResearch([{ title: source.title, quote: source.supportedClaim }])))];
  const display: Record<string,string> = { Sandbox: "Vercel Sandbox", Blob: "Vercel Blob", Analytics: "Vercel Analytics", Workflows: "Workflow SDK", Queues: "Vercel Queues", Connect: "Vercel Connect", Flags: "Vercel Flags" };
  return names.map(name => ({ name: display[name] ?? name, sources: research.filter(source =>
    (source.productNames ?? productsFromResearch([{title:source.title,quote:source.supportedClaim}])).includes(name)) }));
}
