import { profilePayloadSchema } from "../contracts/profile-payloads";

export type SummaryFact = { kind: string; workloadId: string | null; payload: unknown; supportStatus?: string };
export type SummaryResearch = { sourceRevisionId: string; supportedClaim: string; location: string; title: string };
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

// Product identity vocabulary only; a mention is shown as sourced research,
// never as a maturity level, global deployment footprint or commercial purchase.
const products = [
  { name: "Vercel Sandbox", pattern: /\bvercel\s+sandbox(?:es)?\b/i },
  { name: "Next.js", pattern: /\bnext\.js\b|\bnextjs\b/i },
  { name: "AI SDK", pattern: /\b(?:vercel\s+)?ai[ -]sdk\b/i },
  { name: "AI Gateway", pattern: /\b(?:vercel\s+)?ai gateway\b/i },
  { name: "Fluid Compute", pattern: /\bfluid compute\b/i },
  { name: "Vercel Blob", pattern: /\bvercel blob\b/i },
  { name: "Edge Config", pattern: /\bedge config\b/i },
  { name: "Vercel Firewall", pattern: /\bvercel firewall\b/i },
  { name: "Vercel Analytics", pattern: /\bvercel (?:web )?analytics\b/i },
  { name: "Speed Insights", pattern: /\bspeed insights\b/i },
  { name: "Workflow SDK", pattern: /\bworkflow sdk\b|\bvercel workflows?\b/i },
  { name: "Vercel Queues", pattern: /\bvercel queues\b/i },
  { name: "Vercel Connect", pattern: /\bvercel connect\b/i },
  { name: "Vercel Flags", pattern: /\bvercel flags\b/i },
  { name: "v0", pattern: /\bv0\b/i },
];
function documentsUse(claim: string, product: RegExp) {
  return claim.split(/(?<=[.!?])\s+|\n+/).some(sentence => product.test(sentence) &&
    /\b(?:uses?|using|used|runs?|running|built|builds?|deployed|deploys?|hosts?|hosting|adopted|powered|migrated|integrated|executes?|executing)\b/i.test(sentence) &&
    !/\b(?:does not|do not|did not|doesn't|don't|didn't|never|no longer|without|not using|plans? to|planning|evaluating|considering)\b/i.test(sentence));
}
export function researchProductMentions(research: readonly SummaryResearch[]) {
  return products.flatMap(product => {
    const sources = research.filter(source => documentsUse(source.supportedClaim, product.pattern));
    return sources.length ? [{ name: product.name, sources }] : [];
  });
}
